import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
}

interface SegmentRequest {
  fileId: string;
  userId: string;
  quality: string;
  segmentIndex: string;
  startChunk: string;
  endChunk: string;
  expiry: string;
  signature: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const url = new URL(req.url);
    const params: Partial<SegmentRequest> = {};
    
    // Parse query parameters
    for (const [key, value] of url.searchParams) {
      params[key as keyof SegmentRequest] = value;
    }

    const { fileId, userId, quality, segmentIndex, startChunk, endChunk, expiry, signature } = params;

    // Validate required parameters
    if (!fileId || !userId || !quality || !segmentIndex || !startChunk || !endChunk || !expiry || !signature) {
      throw new Error('Missing required parameters');
    }

    // Verify signature
    const signatureParams = { fileId, userId, quality, segmentIndex, startChunk, endChunk, expiry };
    const isValid = await verifyHMACSignature(signatureParams, signature);
    
    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // Check expiry
    if (Date.now() > parseInt(expiry)) {
      throw new Error('Segment URL has expired');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get file metadata
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      throw new Error('File not found');
    }

    // Verify user has access to file
    if (file.user_id !== userId) {
      // Check for public share or explicit permissions
      const { data: shareData } = await supabase
        .from('file_shares')
        .select('*')
        .eq('file_id', fileId)
        .eq('can_view', true)
        .single();

      if (!shareData && !file.is_public) {
        throw new Error('Access denied');
      }
    }

    // Parse Res54 metadata
    let metadata: any;
    try {
      if (file.storage_path === 'res54_distributed' && file.tags && file.tags.length > 0) {
        metadata = JSON.parse(file.tags[0]);
      } else {
        throw new Error('File does not use Res54 encryption');
      }
    } catch (error) {
      throw new Error('Invalid Res54 metadata: ' + error.message);
    }

    // Parse chunk range
    const startChunkIndex = parseInt(startChunk);
    const endChunkIndex = parseInt(endChunk);
    
    if (startChunkIndex < 0 || endChunkIndex >= metadata.chunks.length || startChunkIndex > endChunkIndex) {
      throw new Error('Invalid chunk range');
    }

    // Handle HEAD requests (for content length and headers)
    if (req.method === 'HEAD') {
      // Estimate content length based on chunk count and average chunk size
      const avgChunkSize = file.size / metadata.chunks.length;
      const estimatedLength = Math.floor(avgChunkSize * (endChunkIndex - startChunkIndex + 1));
      
      return new Response(null, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': file.type || 'video/mp4',
          'Content-Length': estimatedLength.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'max-age=3600', // Cache for 1 hour
        },
      });
    }

    // Process range header for byte-range requests
    const rangeHeader = req.headers.get('range');
    let byteStart = 0;
    let byteEnd: number | undefined;
    
    if (rangeHeader) {
      const range = rangeHeader.replace(/bytes=/, '').split('-');
      byteStart = parseInt(range[0]) || 0;
      byteEnd = range[1] ? parseInt(range[1]) : undefined;
    }

    // Decrypt and serve segment
    const segmentData = await decryptSegment({
      metadata,
      startChunkIndex,
      endChunkIndex,
      encryptionKey: metadata.encryptionKey,
      byteStart,
      byteEnd,
      supabase,
    });

    // Log segment access for analytics
    await supabase
      .from('api_request_logs')
      .insert({
        user_id: userId,
        endpoint: '/edge/media/segment',
        file_id: fileId,
        request_data: { 
          quality, 
          segmentIndex: parseInt(segmentIndex),
          chunkRange: `${startChunk}-${endChunk}`,
          byteRange: rangeHeader || 'full' 
        },
        response_status: rangeHeader ? 206 : 200,
        bytes_transferred: segmentData.length,
        created_at: new Date().toISOString(),
      });

    const totalDuration = metadata.duration || (metadata.chunks.length * 3);

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': file.type || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400, immutable',
      'Content-Length': segmentData.length.toString(),
      'X-Content-Duration': totalDuration.toString(),
      'Timing-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, X-Content-Duration',
    };

    if (rangeHeader) {
      const contentRange = `bytes ${byteStart}-${byteStart + segmentData.length - 1}/*`;
      responseHeaders['Content-Range'] = contentRange;
      return new Response(segmentData, { status: 206, headers: responseHeaders });
    }

    return new Response(segmentData, { status: 200, headers: responseHeaders });

  } catch (error) {
    console.error('Segment serving error:', error);
    
    const statusCode = error.message.includes('Access denied') ? 403 :
                      error.message.includes('expired') ? 410 :
                      error.message.includes('not found') ? 404 : 500;
    
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to serve segment' 
    }), {
      status: statusCode,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});

async function decryptSegment(params: {
  metadata: any;
  startChunkIndex: number;
  endChunkIndex: number;
  encryptionKey: string;
  byteStart: number;
  byteEnd?: number;
  supabase: any;
}): Promise<Uint8Array> {
  const { metadata, startChunkIndex, endChunkIndex, encryptionKey, byteStart, byteEnd, supabase } = params;

  // Compute file byte offset of the first requested chunk
  let rangeFileOffset = 0;
  for (let i = 0; i < startChunkIndex; i++) {
    rangeFileOffset += metadata.chunks[i]?.size || 0;
  }

  // Make byteStart/byteEnd relative to combinedData (not absolute file positions)
  const relStart = Math.max(0, byteStart - rangeFileOffset);
  const relEnd = byteEnd !== undefined ? byteEnd - rangeFileOffset : undefined;

  const decryptedChunks: Uint8Array[] = [];
  let totalSize = 0;

  // Download and decrypt chunks in the requested range
  for (let i = startChunkIndex; i <= endChunkIndex; i++) {
    const chunk = metadata.chunks[i];
    
    if (!chunk || !chunk.repo || !chunk.path) {
      throw new Error(`Invalid chunk metadata for chunk ${i}`);
    }

    try {
      // Download chunk from GitHub storage
      const response = await supabase.functions.invoke('github-storage', {
        body: { action: 'download', path: chunk.path, repo: chunk.repo }
      });

      if (response.error || !response.data?.content) {
        throw new Error(`Failed to download chunk ${i} from ${chunk.repo}/${chunk.path}`);
      }

      // Decode and parse chunk data
      const cleanContent = response.data.content.replace(/\s/g, '');
      const decodedContent = atob(cleanContent);
      const parsedChunk = JSON.parse(decodedContent);

      if (!parsedChunk.chunkData) {
        throw new Error(`Invalid chunk format for chunk ${i}`);
      }

      // Decrypt chunk using Res54 decryption
      const decryptedData = await decryptRes54Data(parsedChunk.chunkData, encryptionKey);
      const uint8Array = new Uint8Array(decryptedData);
      
      decryptedChunks.push(uint8Array);
      totalSize += uint8Array.length;
      
    } catch (error) {
      console.error(`Error processing chunk ${i}:`, error);
      throw new Error(`Failed to decrypt chunk ${i}: ${error.message}`);
    }
  }

  // Combine all decrypted chunks
  const combinedData = new Uint8Array(totalSize);
  let offset = 0;
  
  for (const chunk of decryptedChunks) {
    combinedData.set(chunk, offset);
    offset += chunk.length;
  }

  // Apply byte range if specified (using relative offsets)
  if (relEnd !== undefined && relEnd < combinedData.length - 1) {
    return combinedData.slice(relStart, relEnd + 1);
  } else if (relStart > 0) {
    return combinedData.slice(relStart);
  }

  return combinedData;
}

// Simplified Res54 decryption (matches the pattern from other edge functions)
async function decryptRes54Data(encryptedData: string, encryptionKey: string): Promise<ArrayBuffer> {
  try {
    // Import encryption key
    const keyData = new TextEncoder().encode(encryptionKey);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Decode base64 encrypted data
    const encryptedBytes = new Uint8Array(
      atob(encryptedData).split('').map(char => char.charCodeAt(0))
    );

    // Extract IV and encrypted content
    // This follows the same pattern as other Res54 implementations in the codebase
    const ivLength = 12; // AES-GCM standard IV length
    const iv = encryptedBytes.slice(0, ivLength);
    const encrypted = encryptedBytes.slice(ivLength);

    // Decrypt data
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encrypted
    );

    return decrypted;
  } catch (error) {
    console.error('Res54 decryption error:', error);
    throw new Error('Failed to decrypt chunk data');
  }
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

  try {
    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    
    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(paramString)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}