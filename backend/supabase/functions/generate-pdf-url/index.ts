import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role key for server-side operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from JWT
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(jwt)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { fileId, userId } = await req.json()

    if (!fileId || !userId || userId !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Generating PDF URL for file:', fileId, 'user:', userId)

    // Get file information from database
    const { data: fileData, error: fileError } = await supabaseClient
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single()

    if (fileError || !fileData) {
      console.error('File not found:', fileError)
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Verify user has access to the file
    const hasAccess = fileData.user_id === userId || fileData.shared

    if (!hasAccess && fileData.user_id !== userId) {
      // Check if file is shared with this user
      const { data: shareData, error: shareError } = await supabaseClient
        .from('shares')
        .select('id, share_type, allowed_users, expires_at, is_active')
        .eq('file_id', fileId)
        .eq('is_active', true)
        .or(`share_type.eq.public,allowed_users.cs.{${userId}}`)
        .maybeSingle()

      if (shareError || !shareData) {
        return new Response(
          JSON.stringify({ error: 'Access denied' }),
          { 
            status: 403, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      if (shareData.expires_at && new Date(shareData.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: 'Access denied' }),
          { 
            status: 403, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    // Verify it's a PDF file
    const isPDF = fileData.type?.includes('pdf') || 
                  fileData.name?.toLowerCase().endsWith('.pdf')

    if (!isPDF) {
      return new Response(
        JSON.stringify({ error: 'File is not a PDF document' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    let secureUrl: string
    const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)) // 24 hours

    if (fileData.encrypted && fileData.storage_path === 'res54_distributed') {
      // For encrypted files, we'll return a special URL that the client can use
      // to identify that it needs to use RES54 decryption
      secureUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/encrypted/${fileData.id}?expires=${expiresAt.getTime()}`
    } else {
      // Generate signed URL for standard storage
      const { data: signedUrlData, error: signedUrlError } = await supabaseClient.storage
        .from('files')
        .createSignedUrl(fileData.storage_path, 24 * 3600) // 24 hours

      if (signedUrlError || !signedUrlData) {
        console.error('Error generating signed URL:', signedUrlError)
        return new Response(
          JSON.stringify({ error: 'Failed to generate secure URL' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      secureUrl = signedUrlData.signedUrl
    }

    // Log the successful URL generation
    console.log('PDF URL generated successfully for file:', fileId)

    // Store the secure URL with expiration in database for tracking
    await supabaseClient
      .from('pdf_secure_urls')
      .upsert({
        file_id: fileId,
        user_id: userId,
        secure_url: secureUrl,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      })

    return new Response(
      JSON.stringify({
        url: secureUrl,
        fileName: fileData.name,
        expiresAt: expiresAt.toISOString(),
        encrypted: fileData.encrypted || false
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in generate-pdf-url function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})