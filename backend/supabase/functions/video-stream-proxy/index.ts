import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface StreamProxyRequest {
  fileId: string;
  quality: string;
  userId: string;
  sessionId: string;
  expiry: string;
  signature: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
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
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const params: Partial<StreamProxyRequest> = {}
    
    // Parse query parameters
    for (const [key, value] of url.searchParams) {
      params[key as keyof StreamProxyRequest] = value
    }

    const { fileId, quality, userId, sessionId, expiry, signature } = params

    // Validate required parameters
    if (!fileId || !quality || !userId || !sessionId || !expiry || !signature) {
      throw new Error('Missing required parameters')
    }

    // Verify signature
    const secret = Deno.env.get('STREAM_SIGNING_SECRET')
    if (!secret) {
      throw new Error('STREAM_SIGNING_SECRET is not configured')
    }
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    // Recreate signed parameters (without signature)
    const signParams = { fileId, quality, userId, sessionId, expiry }
    const sortedParams = Object.keys(signParams)
      .sort()
      .map(k => `${k}=${signParams[k as keyof typeof signParams]}`)
      .join('&')

    const signatureBytes = new Uint8Array(
      signature.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) ?? []
    )

    const isValidSignature = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(sortedParams)
    )

    if (!isValidSignature) {
      throw new Error('Invalid signature')
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000)
    if (now > parseInt(expiry)) {
      throw new Error('Stream URL expired')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get file metadata
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single()

    if (fileError || !file) {
      throw new Error('File not found')
    }

    // Verify access (double-check)
    if (file.user_id !== userId) {
      const { data: shareData, error: shareError } = await supabase
        .from('shares')
        .select('id, share_type, allowed_users, expires_at, is_active')
        .eq('file_id', fileId)
        .eq('is_active', true)
        .or(`share_type.eq.public,allowed_users.cs.{${userId}}`)
        .maybeSingle()

      if (shareError || !shareData) {
        throw new Error('Access denied')
      }

      if (shareData.expires_at && new Date(shareData.expires_at) < new Date()) {
        throw new Error('Access denied')
      }
    }

    // Parse file metadata to get Res54 chunks
    let metadata
    try {
      metadata = Array.isArray(file.tags) && file.tags.length > 0 
        ? JSON.parse(file.tags[0])
        : null
    } catch (e) {
      throw new Error('Invalid file metadata')
    }

    if (!metadata || !metadata.chunks) {
      throw new Error('File chunks not found')
    }

    // Handle range requests for streaming
    const rangeHeader = req.headers.get('range')
    let start = 0
    let end = file.size - 1
    let isRangeRequest = false

    if (rangeHeader) {
      isRangeRequest = true
      const ranges = rangeHeader.replace(/bytes=/, '').split('-')
      start = parseInt(ranges[0]) || 0
      end = parseInt(ranges[1]) || file.size - 1
    }

    // Determine which chunks we need based on the range using actual chunk sizes
    const chunkOffsets: number[] = [];
    let cumSize = 0;
    for (const c of metadata.chunks) {
      chunkOffsets.push(cumSize);
      cumSize += c.size || 0;
    }
    let startChunk = 0;
    while (startChunk < chunkOffsets.length - 1 && chunkOffsets[startChunk + 1] <= start) startChunk++;
    let endChunk = startChunk;
    while (endChunk < chunkOffsets.length - 1 && chunkOffsets[endChunk] < end) endChunk++;

    const decryptedChunks: Uint8Array[] = []
    
    for (let i = startChunk; i <= endChunk; i++) {
      const chunk = metadata.chunks[i]
      if (!chunk || !chunk.repo || !chunk.path) {
        continue
      }

      try {
        // Download chunk from GitHub storage
        const { data: chunkResponse, error: chunkError } = await supabase.functions.invoke('github-storage', {
          body: { 
            action: 'download', 
            path: chunk.path, 
            repo: chunk.repo 
          }
        })

        if (chunkError || !chunkResponse?.content) {
          console.error(`Failed to download chunk ${i}:`, chunkError)
          continue
        }

        // Decode GitHub base64 content
        const cleanContent = chunkResponse.content.replace(/\s/g, '')
        const decodedContent = atob(cleanContent)
        const parsedChunk = JSON.parse(decodedContent)

        if (!parsedChunk.chunkData) {
          console.error(`Invalid chunk data for chunk ${i}`)
          continue
        }

        // Decrypt chunk data using Res54
        const decryptedData = await decryptRes54Data(parsedChunk.chunkData, metadata.encryptionKey)
        decryptedChunks.push(new Uint8Array(decryptedData))

      } catch (error) {
        console.error(`Error processing chunk ${i}:`, error)
        // Continue with other chunks
      }
    }

    if (decryptedChunks.length === 0) {
      throw new Error('No valid chunks found')
    }

    // Combine chunks into a single stream
    const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combinedData = new Uint8Array(totalLength)
    let offset = 0
    
    for (const chunk of decryptedChunks) {
      combinedData.set(chunk, offset)
      offset += chunk.length
    }

    // Extract the requested range from combined data using actual chunk offsets
    const relStart = start - chunkOffsets[startChunk];
    const rangeLen = end - start + 1;
    const requestedData = combinedData.slice(relStart, relStart + rangeLen)

    // Log streaming event
    try {
      await supabase
        .from('api_request_logs')
        .insert({
          user_id: userId,
          endpoint: '/video/stream-proxy',
          method: 'GET',
          file_id: fileId,
          response_time: 0,
          status_code: isRangeRequest ? 206 : 200,
          ip_address: req.headers.get('x-forwarded-for') || 'unknown',
          user_agent: req.headers.get('user-agent') || 'unknown',
        })
    } catch (logError) {
      console.error('Failed to log stream request:', logError)
    }

    // Set appropriate headers for video streaming
    const headers = {
      ...corsHeaders,
      'Content-Type': file.type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Content-Length': requestedData.length.toString(),
    }

    if (isRangeRequest) {
      headers['Content-Range'] = `bytes ${start}-${end}/${file.size}`
    }

    return new Response(requestedData, {
      headers,
      status: isRangeRequest ? 206 : 200,
    })

  } catch (error) {
    console.error('Stream proxy error:', error)
    
    const statusCode = 
      error.message === 'Invalid signature' ? 401 :
      error.message === 'Stream URL expired' ? 410 :
      error.message === 'Access denied' ? 403 :
      error.message === 'File not found' ? 404 : 500

    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        code: 'STREAM_PROXY_ERROR'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode,
      },
    )
  }
})

// Res54 decryption function (simplified version)
async function decryptRes54Data(encryptedData: string, encryptionKey: string): Promise<ArrayBuffer> {
  try {
    // This is a simplified version - in production you'd use the full Res54 decryption
    const keyData = new TextEncoder().encode(encryptionKey)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )

    // Parse encrypted data (assuming it's base64 encoded with IV)
    const encryptedBytes = new Uint8Array(
      atob(encryptedData).split('').map(char => char.charCodeAt(0))
    )

    // Extract IV (first 12 bytes) and encrypted content
    const iv = encryptedBytes.slice(0, 12)
    const encrypted = encryptedBytes.slice(12)

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encrypted
    )

    return decrypted
  } catch (error) {
    console.error('Res54 decryption error:', error)
    throw new Error('Failed to decrypt chunk data')
  }
}