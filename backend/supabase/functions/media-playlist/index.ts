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
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId');
    const userId = url.searchParams.get('userId');
    const quality = url.searchParams.get('quality');
    const expiry = url.searchParams.get('expiry');
    const segmentDuration = url.searchParams.get('segmentDuration');
    const totalChunks = url.searchParams.get('totalChunks');
    const signature = url.searchParams.get('signature');

    if (!fileId || !userId || !quality || !expiry || !segmentDuration || !totalChunks || !signature) {
      throw new Error('Missing required parameters');
    }

    const params = { fileId, userId, quality, expiry, segmentDuration, totalChunks };
    const isValid = await verifyHMACSignature(params, signature);
    if (!isValid) throw new Error('Invalid signature');
    if (Date.now() > parseInt(expiry)) throw new Error('URL expired');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: file, error: fileError } = await supabase
      .from('files').select('*').eq('id', fileId).single();
    if (fileError || !file) throw new Error('File not found');

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

    const playlist = await generateVariantPlaylist({
      fileId, userId, quality, expiry,
      segmentDuration: parseInt(segmentDuration),
      totalChunks: parseInt(totalChunks),
      metadata,
    });

    return new Response(playlist, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'max-age=300',
      },
    });

  } catch (error) {
    console.error('Playlist generation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateVariantPlaylist(params: {
  fileId: string; userId: string; quality: string; expiry: string;
  segmentDuration: number; totalChunks: number; metadata: any;
}): Promise<string> {
  const { fileId, userId, quality, expiry, segmentDuration, totalChunks, metadata } = params;

  // Compute per-chunk byte offsets for EXT-X-BYTERANGE
  let runningOffset = 0;
  const chunkMap = metadata.chunks.map((c: any) => {
    const size = c.size || 0;
    const offset = runningOffset;
    runningOffset += size;
    return { size, offset };
  });
  const totalFileSize = runningOffset;
  const totalSegments = Math.max(1, totalChunks);

  const baseDuration = totalChunks * segmentDuration;

  // ONE signed URL for the full concatenated file
  const baseSegmentUrl = Deno.env.get('SUPABASE_URL') + '/functions/v1/media-segment';
  const fullParams = {
    fileId, userId, quality,
    segmentIndex: '0',
    startChunk: '0',
    endChunk: (totalChunks - 1).toString(),
    expiry,
  };
  const fullSig = await generateHMACSignature(fullParams);
  const fullUrl = `${baseSegmentUrl}?${new URLSearchParams({ ...fullParams, signature: fullSig }).toString()}`;

  let playlist = '#EXTM3U\n';
  playlist += '#EXT-X-VERSION:7\n';
  playlist += `#EXT-X-TARGETDURATION:${segmentDuration + 1}\n`;
  playlist += '#EXT-X-MEDIA-SEQUENCE:0\n';
  playlist += '#EXT-X-PLAYLIST-TYPE:VOD\n\n';

  for (let i = 0; i < totalSegments; i++) {
    const c = chunkMap[i];
    const byteLen = c.size;
    const byteStart = c.offset;

    const duration = totalFileSize > 0
      ? Math.max(0.5, (c.size / totalFileSize) * baseDuration)
      : segmentDuration;
    const lastAdj = i === totalSegments - 1
      ? Math.max(0.5, baseDuration - (totalSegments - 1) * segmentDuration)
      : duration;

    playlist += `#EXTINF:${lastAdj.toFixed(3)},\n`;
    playlist += `#EXT-X-BYTERANGE:${byteLen}@${byteStart}\n`;
    playlist += `${fullUrl}\n`;
  }

  playlist += '#EXT-X-ENDLIST\n';
  return playlist;
}

async function verifyHMACSignature(params: Record<string, string>, signature: string): Promise<boolean> {
  const secret = Deno.env.get('STREAM_SIGNING_SECRET') ?? 'default-secret';
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(paramString));
}

async function generateHMACSignature(params: Record<string, string>): Promise<string> {
  const secret = Deno.env.get('STREAM_SIGNING_SECRET') ?? 'default-secret';
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(paramString));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
