import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface TranscodeRequest {
  fileId: string;
  userId: string;
  outputQualities: string[];
  priority?: 'low' | 'normal' | 'high';
}

interface TranscodeJob {
  id: string;
  fileId: string;
  userId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  outputQualities: string[];
  progress: number;
  error?: string;
  outputFiles?: {
    quality: string;
    path: string;
    size: number;
    duration: number;
  }[];
  createdAt: string;
  updatedAt: string;
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

    const { fileId, userId, outputQualities, priority = 'normal' }: TranscodeRequest = await req.json()

    // Validate request
    if (!fileId || !userId || !outputQualities || outputQualities.length === 0) {
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

    // Check if user has access
    if (file.user_id !== userId) {
      throw new Error('Access denied')
    }

    // Verify it's a video file
    if (!file.type.startsWith('video/')) {
      throw new Error('File is not a video')
    }

    // Check if transcoding job already exists
    const { data: existingJob } = await supabase
      .from('transcode_jobs')
      .select('*')
      .eq('file_id', fileId)
      .eq('status', 'processing')
      .single()

    if (existingJob) {
      return new Response(
        JSON.stringify({ 
          message: 'Transcoding job already in progress',
          jobId: existingJob.id,
          status: existingJob.status,
          progress: existingJob.progress
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    // Create transcoding job
    const jobId = crypto.randomUUID()
    const { error: jobError } = await supabase
      .from('transcode_jobs')
      .insert({
        id: jobId,
        file_id: fileId,
        user_id: userId,
        status: 'queued',
        output_qualities: outputQualities,
        priority: priority,
        progress: 0,
      })

    if (jobError) {
      throw new Error('Failed to create transcoding job')
    }

    // Queue the job for background processing
    await queueTranscodeJob(jobId, file, outputQualities, priority)

    return new Response(
      JSON.stringify({ 
        message: 'Transcoding job created successfully',
        jobId,
        status: 'queued',
        estimatedTime: estimateTranscodeTime(file, outputQualities)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201,
      },
    )

  } catch (error) {
    console.error('HLS generation error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        code: 'HLS_GENERATION_ERROR'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.message === 'Access denied' ? 403 : 
               error.message === 'File not found' ? 404 : 500,
      },
    )
  }
})

// Queue transcoding job for background processing
async function queueTranscodeJob(
  jobId: string, 
  file: any, 
  outputQualities: string[], 
  priority: string
): Promise<void> {
  // In a real implementation, this would:
  // 1. Add job to a queue (Redis, BullMQ, etc.)
  // 2. Notify worker processes
  // 3. Handle job priorities
  
  // For now, we'll simulate the process
  console.log(`Queuing transcode job ${jobId} for file ${file.id}`)
  
  // Start background processing (simplified simulation)
  setTimeout(() => {
    processTranscodeJob(jobId, file, outputQualities)
  }, 1000)
}

// Process transcoding job
async function processTranscodeJob(
  jobId: string,
  file: any,
  outputQualities: string[]
): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    // Update job status to processing
    await supabase
      .from('transcode_jobs')
      .update({ 
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)

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

    // Download and decrypt original file
    const decryptedChunks: Uint8Array[] = []
    
    for (let i = 0; i < metadata.chunks.length; i++) {
      const chunk = metadata.chunks[i]
      
      // Update progress
      const progress = Math.round((i / metadata.chunks.length) * 30) // 30% for download
      await supabase
        .from('transcode_jobs')
        .update({ progress })
        .eq('id', jobId)

      // Download chunk
      const { data: chunkResponse, error: chunkError } = await supabase.functions.invoke('github-storage', {
        body: { 
          action: 'download', 
          path: chunk.path, 
          repo: chunk.repo 
        }
      })

      if (chunkError || !chunkResponse?.content) {
        throw new Error(`Failed to download chunk ${i}`)
      }

      // Decode and decrypt chunk
      const cleanContent = chunkResponse.content.replace(/\s/g, '')
      const decodedContent = atob(cleanContent)
      const parsedChunk = JSON.parse(decodedContent)
      
      // Decrypt using simplified Res54 decryption
      const decryptedData = await decryptRes54Data(parsedChunk.chunkData, metadata.encryptionKey)
      decryptedChunks.push(new Uint8Array(decryptedData))
    }

    // Combine chunks into complete file
    const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combinedData = new Uint8Array(totalLength)
    let offset = 0
    
    for (const chunk of decryptedChunks) {
      combinedData.set(chunk, offset)
      offset += chunk.length
    }

    // Generate HLS variants for each quality
    const outputFiles = []
    
    for (let i = 0; i < outputQualities.length; i++) {
      const quality = outputQualities[i]
      
      // Update progress
      const progress = 30 + Math.round(((i + 1) / outputQualities.length) * 60) // 60% for transcoding
      await supabase
        .from('transcode_jobs')
        .update({ progress })
        .eq('id', jobId)

      // Generate HLS for this quality
      const hlsOutput = await generateHLSForQuality(combinedData, quality, file.type)
      
      if (hlsOutput) {
        outputFiles.push({
          quality,
          path: hlsOutput.manifestPath,
          size: hlsOutput.totalSize,
          duration: hlsOutput.duration
        })
      }
    }

    // Generate master playlist
    const masterPlaylist = generateMasterPlaylist(outputFiles)
    
    // Store master playlist
    const masterPath = `${file.user_id}/${file.id}/master.m3u8`
    await storeFile(masterPath, masterPlaylist, 'application/x-mpegURL')

    // Update job as completed
    await supabase
      .from('transcode_jobs')
      .update({ 
        status: 'completed',
        progress: 100,
        output_files: outputFiles,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)

    console.log(`Transcoding job ${jobId} completed successfully`)

  } catch (error) {
    console.error(`Transcoding job ${jobId} failed:`, error)
    
    // Update job as failed
    await supabase
      .from('transcode_jobs')
      .update({ 
        status: 'failed',
        error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
  }
}

// Generate HLS for specific quality
async function generateHLSForQuality(
  videoData: Uint8Array,
  quality: string,
  originalType: string
): Promise<{
  manifestPath: string;
  segmentPaths: string[];
  totalSize: number;
  duration: number;
} | null> {
  
  // This is a simplified simulation of HLS generation
  // In a real implementation, you would use FFmpeg or similar tools
  
  const qualitySettings = {
    '360p': { width: 640, height: 360, bitrate: 800000 },
    '480p': { width: 854, height: 480, bitrate: 1500000 },
    '720p': { width: 1280, height: 720, bitrate: 3000000 },
    '1080p': { width: 1920, height: 1080, bitrate: 5000000 }
  }

  const settings = qualitySettings[quality as keyof typeof qualitySettings]
  if (!settings) {
    console.warn(`Unsupported quality: ${quality}`)
    return null
  }

  // Simulate transcoding process
  console.log(`Generating HLS for ${quality}:`, settings)
  
  // In real implementation, this would:
  // 1. Transcode video to target resolution/bitrate
  // 2. Segment video into chunks (typically 6-10 seconds each)
  // 3. Generate playlist file
  // 4. Store segments and playlist
  
  // For simulation, we'll create mock segments
  const segmentDuration = 6 // seconds
  const estimatedDuration = 120 // 2 minutes
  const numSegments = Math.ceil(estimatedDuration / segmentDuration)
  
  const segmentPaths = []
  const manifestLines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${segmentDuration}`,
    '#EXT-X-MEDIA-SEQUENCE:0'
  ]

  // Generate segments
  for (let i = 0; i < numSegments; i++) {
    const segmentPath = `segments/${quality}/segment_${i.toString().padStart(6, '0')}.ts`
    segmentPaths.push(segmentPath)
    
    // Add to playlist
    manifestLines.push(`#EXTINF:${segmentDuration}.0,`)
    manifestLines.push(segmentPath)
    
    // In real implementation, store actual segment data
    // await storeFile(segmentPath, segmentData, 'video/mp2t')
  }

  manifestLines.push('#EXT-X-ENDLIST')
  const playlistContent = manifestLines.join('\n')
  
  // Store playlist
  const manifestPath = `playlists/${quality}/playlist.m3u8`
  await storeFile(manifestPath, playlistContent, 'application/x-mpegURL')

  return {
    manifestPath,
    segmentPaths,
    totalSize: Math.round(videoData.length * (settings.bitrate / 5000000)), // Estimate based on bitrate
    duration: estimatedDuration
  }
}

// Generate master playlist
function generateMasterPlaylist(outputFiles: any[]): string {
  let manifest = '#EXTM3U\n#EXT-X-VERSION:3\n\n'
  
  const qualitySettings = {
    '360p': { width: 640, height: 360, bitrate: 800000 },
    '480p': { width: 854, height: 480, bitrate: 1500000 },
    '720p': { width: 1280, height: 720, bitrate: 3000000 },
    '1080p': { width: 1920, height: 1080, bitrate: 5000000 }
  }

  // Sort by bitrate (highest first)
  const sortedFiles = outputFiles.sort((a, b) => {
    const aBitrate = qualitySettings[a.quality as keyof typeof qualitySettings]?.bitrate || 0
    const bBitrate = qualitySettings[b.quality as keyof typeof qualitySettings]?.bitrate || 0
    return bBitrate - aBitrate
  })

  for (const file of sortedFiles) {
    const settings = qualitySettings[file.quality as keyof typeof qualitySettings]
    if (settings) {
      manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${settings.bitrate},RESOLUTION=${settings.width}x${settings.height}\n`
      manifest += `${file.path}\n\n`
    }
  }

  return manifest
}

// Store file (simplified - in real implementation would use proper storage)
async function storeFile(path: string, content: string, contentType: string): Promise<void> {
  // In real implementation, this would store to cloud storage
  console.log(`Storing file: ${path} (${contentType})`)
  console.log(`Content length: ${content.length}`)
}

// Simplified Res54 decryption
async function decryptRes54Data(encryptedData: string, encryptionKey: string): Promise<ArrayBuffer> {
  try {
    const keyData = new TextEncoder().encode(encryptionKey)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )

    const encryptedBytes = new Uint8Array(
      atob(encryptedData).split('').map(char => char.charCodeAt(0))
    )

    const iv = encryptedBytes.slice(0, 12)
    const encrypted = encryptedBytes.slice(12)

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

// Estimate transcoding time
function estimateTranscodeTime(file: any, outputQualities: string[]): number {
  // Rough estimation: 1 minute per GB per quality
  const fileSizeGB = file.size / (1024 * 1024 * 1024)
  const estimatedMinutes = Math.ceil(fileSizeGB * outputQualities.length)
  return Math.max(estimatedMinutes, 1) // At least 1 minute
}