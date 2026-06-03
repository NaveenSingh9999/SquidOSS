import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface VideoStreamRequest {
  fileId: string;
  requestedQualities?: string[];
  requesterUserId: string;
  playbackMode: 'stream' | 'download';
}

interface VideoQuality {
  id: string;
  label: string;
  bandwidth: number;
  url: string;
  height?: number;
  width?: number;
}

interface StreamResponse {
  url: string;
  ttl_seconds: number;
  qualities: VideoQuality[];
  hlsManifest?: string;
  sessionId?: string;
}

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

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Verify JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Invalid authentication')
    }

    const { fileId, requestedQualities, requesterUserId, playbackMode }: VideoStreamRequest = await req.json()

    // Validate request
    if (!fileId || !requesterUserId) {
      throw new Error('Missing required parameters')
    }

    // Get file metadata and verify access
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single()

    if (fileError || !file) {
      throw new Error('File not found')
    }

    // Check if user has access (owner or valid share)
    if (file.user_id !== requesterUserId) {
      const { data: shareData, error: shareError } = await supabase
        .from('shares')
        .select('id, share_type, allowed_users, expires_at, is_active')
        .eq('file_id', fileId)
        .eq('is_active', true)
        .or(`share_type.eq.public,allowed_users.cs.{${requesterUserId}}`)
        .maybeSingle()

      if (shareError || !shareData) {
        throw new Error('Access denied')
      }

      if (shareData.expires_at && new Date(shareData.expires_at) < new Date()) {
        throw new Error('Access denied')
      }
    }

    // Verify it's a video file
    if (!file.type.startsWith('video/')) {
      throw new Error('File is not a video')
    }

    // Generate session ID for tracking
    const sessionId = crypto.randomUUID()

    // Generate signed stream URLs
    const ttlSeconds = 3600 // 1 hour default TTL
    const expiryTime = Math.floor(Date.now() / 1000) + ttlSeconds

    // Create HMAC signature for signed URLs
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
      ['sign']
    )

    // Helper function to sign URL parameters
    const signUrlParams = async (params: Record<string, string>) => {
      const sortedParams = Object.keys(params)
        .sort()
        .map(k => `${k}=${params[k]}`)
        .join('&')
      
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(sortedParams))
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      
      return signatureHex
    }

    // Generate base stream URL
    const baseUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/video-stream-proxy`
    
    // Define available qualities (these would be generated during upload or transcoding)
    const availableQualities: VideoQuality[] = [
      {
        id: 'auto',
        label: 'Auto',
        bandwidth: 0,
        url: `${baseUrl}/auto`,
      },
      {
        id: '1080p',
        label: '1080p',
        bandwidth: 5000000,
        url: `${baseUrl}/1080p`,
        height: 1080,
        width: 1920,
      },
      {
        id: '720p',
        label: '720p',
        bandwidth: 3000000,
        url: `${baseUrl}/720p`,
        height: 720,
        width: 1280,
      },
      {
        id: '480p',
        label: '480p',
        bandwidth: 1500000,
        url: `${baseUrl}/480p`,
        height: 480,
        width: 854,
      },
      {
        id: '360p',
        label: '360p',
        bandwidth: 800000,
        url: `${baseUrl}/360p`,
        height: 360,
        width: 640,
      }
    ]

    // Filter requested qualities
    let qualities = availableQualities
    if (requestedQualities && requestedQualities.length > 0) {
      qualities = availableQualities.filter(q => 
        requestedQualities.includes(q.id) || q.id === 'auto'
      )
    }

    // Sign URLs for each quality
    for (const quality of qualities) {
      const params = {
        fileId,
        quality: quality.id,
        userId: requesterUserId,
        sessionId,
        expiry: expiryTime.toString(),
      }
      
      const signature = await signUrlParams(params)
      const queryString = Object.keys(params)
        .map(k => `${k}=${params[k as keyof typeof params]}`)
        .join('&')
      
      quality.url = `${quality.url}?${queryString}&signature=${signature}`
    }

    // Generate HLS master playlist for adaptive streaming
    let hlsManifest = ''
    if (playbackMode === 'stream') {
      hlsManifest = generateHLSMasterPlaylist(qualities.filter(q => q.id !== 'auto'))
    }

    // Log the stream request
    try {
      await supabase
        .from('api_request_logs')
        .insert({
          user_id: requesterUserId,
          endpoint: '/video/stream-url',
          method: 'POST',
          file_id: fileId,
          response_time: 0, // Will be updated by middleware
          status_code: 200,
          ip_address: req.headers.get('x-forwarded-for') || 'unknown',
          user_agent: req.headers.get('user-agent') || 'unknown',
        })
    } catch (logError) {
      console.error('Failed to log request:', logError)
      // Don't fail the request for logging errors
    }

    const response: StreamResponse = {
      url: qualities.find(q => q.id === 'auto')?.url ?? qualities[0].url,
      ttl_seconds: ttlSeconds,
      qualities,
      hlsManifest: hlsManifest || undefined,
      sessionId,
    }

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Stream URL generation error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        code: 'STREAM_URL_ERROR'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.message === 'Access denied' ? 403 : 
               error.message === 'File not found' ? 404 : 500,
      },
    )
  }
})

// Helper function to generate HLS master playlist
function generateHLSMasterPlaylist(qualities: VideoQuality[]): string {
  let manifest = '#EXTM3U\n#EXT-X-VERSION:3\n\n'
  
  // Sort qualities by bandwidth (highest first)
  const sortedQualities = qualities
    .filter(q => q.bandwidth > 0)
    .sort((a, b) => b.bandwidth - a.bandwidth)
  
  for (const quality of sortedQualities) {
    manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${quality.bandwidth}`
    
    if (quality.width && quality.height) {
      manifest += `,RESOLUTION=${quality.width}x${quality.height}`
    }
    
    manifest += `\n${quality.url}\n\n`
  }
  
  return manifest
}