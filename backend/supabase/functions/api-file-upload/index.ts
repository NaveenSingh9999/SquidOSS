

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-squidcloud-encryption-key, x-encryption-key',
}

const validateEncryptionKeyFormat = (key: string): boolean => {
  return key.length >= 8 && key.length <= 512
}

serve(async (req) => {
  // KZA Guard — must be first
  const kzaResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/kza-sentinel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': req.headers.get('Authorization') ?? '',
      'X-KZA-Session': req.headers.get('X-KZA-Session') ?? '',
      'X-Forwarded-For': req.headers.get('X-Forwarded-For') ?? '',
      'User-Agent': req.headers.get('User-Agent') ?? '',
    },
    body: JSON.stringify({
      url: req.url,
      method: req.method,
      body_snapshot: await req.clone().text()
    })
  });

  if (!kzaResponse.ok) {
    return kzaResponse; // KZA blocked this request — return its response directly
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()
  let statusCode = 500
  let fileName = null
  let fileSize = null
  let errorMessage = null

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Authenticate via API key
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer cb_')) {
      statusCode = 401
      throw new Error('Invalid API key format')
    }

    const apiKey = authHeader.replace('Bearer ', '')
    
    // Hash the API key using Web Crypto API
    const encoder = new TextEncoder()
    const data = encoder.encode(apiKey)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Verify API key and get user
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id, name, scopes, is_active')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single()

    if (keyError || !keyData) {
      statusCode = 401
      throw new Error('Invalid or inactive API key')
    }

    if (!keyData.scopes.includes('write')) {
      statusCode = 403
      throw new Error('API key does not have write permissions')
    }

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyHash)

    // Parse multipart form data
    const formData = await req.formData()
    const file = formData.get('file') as File
    const formEncryptionKey = (formData.get('encryption_key') || formData.get('encryptionKey')) as string | null
    const headerEncryptionKey = req.headers.get('x-squidcloud-encryption-key') || req.headers.get('x-encryption-key')
    const encryptionKey = (formEncryptionKey || headerEncryptionKey || '').trim() || null

    if (!file) {
      statusCode = 400
      throw new Error('No file provided')
    }

    if (encryptionKey && !validateEncryptionKeyFormat(encryptionKey)) {
      statusCode = 400
      throw new Error('Invalid encryption key format')
    }

    fileName = file.name
    fileSize = file.size

    // Upload file using existing upload logic
    const fileBuffer = await file.arrayBuffer()
    const fileContent = new Uint8Array(fileBuffer)

    // Use the Res54 upload system
    const uploadResponse = await supabase.functions.invoke('github-storage', {
      body: {
        action: 'upload',
        fileName: file.name,
        fileContent: Array.from(fileContent),
        userId: keyData.user_id,
        encrypted: true,
        encryptionKey
      }
    })

    if (uploadResponse.error) {
      statusCode = 500
      throw new Error(`Upload failed: ${uploadResponse.error.message}`)
    }

    // Store file metadata in database
    const { data: fileRecord, error: dbError } = await supabase
      .from('files')
      .insert({
        user_id: keyData.user_id,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        storage_path: 'github_distributed',
        encrypted: true,
        encryption_key: encryptionKey,
        github_repo: uploadResponse.data.repo
      })
      .select()
      .single()

    if (dbError) {
      statusCode = 500
      throw new Error(`Database error: ${dbError.message}`)
    }

    statusCode = 201

    return new Response(
      JSON.stringify({
        success: true,
        file: fileRecord,
        message: 'File uploaded successfully',
        encryption: {
          mode: encryptionKey ? 'provided' : 'platform',
        },
      }),
      {
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error: unknown) {
    console.error('API upload error:', error)
    errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      {
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } finally {
    // Log the request
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const authHeader = req.headers.get('Authorization')
      if (authHeader && authHeader.startsWith('Bearer cb_')) {
        const apiKey = authHeader.replace('Bearer ', '')
        
        // Hash the API key using Web Crypto API for logging
        const encoder = new TextEncoder()
        const data = encoder.encode(apiKey)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

        const { data: keyData } = await supabase
          .from('api_keys')
          .select('id, user_id')
          .eq('key_hash', keyHash)
          .single()

        if (keyData) {
          await supabase
            .from('api_request_logs')
            .insert({
              api_key_id: keyData.id,
              user_id: keyData.user_id,
              endpoint: '/api-file-upload',
              method: req.method,
              ip_address: req.headers.get('x-forwarded-for') || 'unknown',
              user_agent: req.headers.get('user-agent'),
              status_code: statusCode,
              response_time_ms: Date.now() - startTime,
              file_name: fileName,
              file_size: fileSize,
              error_message: errorMessage
            })
        }
      }
    } catch (logError) {
      console.error('Failed to log request:', logError)
    }
  }
})

