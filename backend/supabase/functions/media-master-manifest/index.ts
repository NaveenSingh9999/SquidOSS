import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId');
    const userId = url.searchParams.get('userId');
    const expiry = url.searchParams.get('expiry');
    const variantCount = url.searchParams.get('variantCount');
    const signature = url.searchParams.get('signature');

    if (!fileId || !userId || !expiry || !variantCount || !signature) {
      throw new Error('Missing required parameters');
    }

    // Verify signature
    const params = { fileId, userId, expiry, variantCount };
    const isValid = await verifyHMACSignature(params, signature);
    
    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // Check expiry
    if (Date.now() > parseInt(expiry)) {
      throw new Error('URL has expired');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get file information for building manifest
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      throw new Error('File not found');
    }

    // Parse Res54 metadata to get chunk information
    let metadata: any;
    try {
      if (file.storage_path === 'res54_distributed' && file.tags && file.tags.length > 0) {
        metadata = JSON.parse(file.tags[0]);
      } else {
        throw new Error('File does not use Res54 encryption');
      }
    } catch (error) {
      throw new Error('Invalid Res54 metadata');
    }

    // Generate master manifest content
    const masterManifest = await generateMasterManifest(fileId, userId, expiry, metadata);

    return new Response(masterManifest, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': `max-age=300`, // Cache for 5 minutes
      },
    });

  } catch (error) {
    console.error('Master manifest error:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to generate master manifest' 
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});

async function generateMasterManifest(
  fileId: string, 
  userId: string, 
  expiry: string,
  metadata: any
): Promise<string> {
  const baseUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/media-playlist';
  
  // Quality variants with their characteristics
  const variants = [
    { quality: '240p', bandwidth: 400000, resolution: '426x240' },
    { quality: '360p', bandwidth: 800000, resolution: '640x360' },
    { quality: '480p', bandwidth: 1500000, resolution: '854x480' },
    { quality: '720p', bandwidth: 3000000, resolution: '1280x720' },
    { quality: '1080p', bandwidth: 6000000, resolution: '1920x1080' },
  ];

  let manifest = '#EXTM3U\n';
  manifest += '#EXT-X-VERSION:6\n';
  manifest += '#EXT-X-INDEPENDENT-SEGMENTS\n\n';

  for (const variant of variants) {
    // Generate signed URL for this variant playlist
    const playlistParams = {
      fileId,
      userId,
      quality: variant.quality,
      expiry,
      segmentDuration: '3',
      totalChunks: metadata.chunks.length.toString(),
    };

    const signature = await generateHMACSignature(playlistParams);
    const playlistUrl = `${baseUrl}?${new URLSearchParams({
      ...playlistParams,
      signature,
    }).toString()}`;

    manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.resolution},CODECS="avc1.42E01E,mp4a.40.2"\n`;
    manifest += `${playlistUrl}\n\n`;
  }

  return manifest;
}

async function verifyHMACSignature(params: Record<string, string>, signature: string): Promise<boolean> {
  const secret = Deno.env.get('STREAM_SIGNING_SECRET') ?? 'default-secret';
  
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
  
  return await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(paramString)
  );
}

async function generateHMACSignature(params: Record<string, string>): Promise<string> {
  const secret = Deno.env.get('STREAM_SIGNING_SECRET') ?? 'default-secret';
  
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(paramString)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}