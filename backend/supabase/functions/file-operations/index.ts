import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import JSZip from 'https://esm.sh/jszip@3.10.1'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Create Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

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
    return new Response(null, { headers: corsHeaders })
  }
  
  try {
    console.log('File operations request received')
    
    let requestBody
    try {
      requestBody = await req.json()
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON in request body',
          success: false
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    console.log('Request body parsed:', requestBody)
    
    const { action, fileIds, userId, archiveName, archiveType, fileId, destinationFolder } = requestBody
    
    if (!userId) {
      console.error('User ID is missing')
      return new Response(
        JSON.stringify({ 
          error: 'User ID is required',
          success: false
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    if (action === 'compress') {
      return await handleCompressFiles(fileIds, userId, archiveName, archiveType, destinationFolder)
    } else if (action === 'extract') {
      return await handleExtractArchive(fileId, userId, destinationFolder)
    } else {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid action specified. Use "compress" or "extract"',
          success: false
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
  } catch (error) {
    console.error('Unexpected error processing request:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return new Response(
      JSON.stringify({ 
        error: `Server error: ${errorMessage}`,
        success: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

// Function to handle extracting archive
async function handleExtractArchive(
  fileId: string, 
  userId: string, 
  destinationFolder: string = ''
) {
  console.log(`Starting extraction for file ID: ${fileId}, user: ${userId}`)
  
  if (!fileId) {
    throw new Error('File ID is required')
  }
  
  try {
    // Fetch the archive file from the database
    console.log('Fetching file info from database...')
    const { data: fileInfo, error: fileInfoError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', userId)
      .single()
    
    if (fileInfoError) {
      console.error('Error fetching file info:', fileInfoError)
      throw new Error(`Database error: ${fileInfoError.message}`)
    }
    
    if (!fileInfo) {
      throw new Error('Archive file not found or access denied')
    }
    
    console.log(`Found file: ${fileInfo.name}, storage path: ${fileInfo.storage_path}`)
    
    // Validate file type
    const isZipFile = fileInfo.type?.includes('zip') || 
                     fileInfo.name?.toLowerCase().endsWith('.zip') ||
                     fileInfo.type === 'application/zip'
    
    if (!isZipFile) {
      throw new Error('File is not a ZIP archive')
    }
    
    // Get the file content from storage
    console.log('Downloading file from storage...')
    const { data: fileData, error: fileDataError } = await supabase
      .storage
      .from('files')
      .download(fileInfo.storage_path)
    
    if (fileDataError) {
      console.error('Error downloading file:', fileDataError)
      throw new Error(`Storage error: ${fileDataError.message}`)
    }
    
    if (!fileData) {
      throw new Error('No file content found in storage')
    }
    
    console.log(`Downloaded file, size: ${fileData.size} bytes`)
    
    // Convert blob to array buffer
    const archiveBuffer = await fileData.arrayBuffer()
    console.log(`Archive buffer size: ${archiveBuffer.byteLength} bytes`)
    
    if (archiveBuffer.byteLength === 0) {
      throw new Error('Archive file is empty')
    }
    
    // Load and process the ZIP archive
    const extractedFiles = []
    
    console.log('Loading ZIP archive...')
    const zip = new JSZip()
    let loadedZip
    
    try {
      loadedZip = await zip.loadAsync(archiveBuffer)
    } catch (zipError) {
      console.error('ZIP loading error:', zipError)
      throw new Error('Invalid or corrupted ZIP file')
    }
    
    console.log('ZIP loaded successfully, processing files...')
    
    // Get all files in the ZIP
    const zipEntries = Object.entries(loadedZip.files)
    console.log(`Found ${zipEntries.length} entries in ZIP`)
    
    if (zipEntries.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          files: [],
          message: 'ZIP archive is empty',
          extractedCount: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Filter and process valid files
    const validEntries = zipEntries.filter(([path, zipEntry]) => {
      // Skip directories
      if (zipEntry.dir) {
        console.log(`Skipping directory: ${path}`)
        return false
      }
      
      // Skip system files
      if (path.startsWith('__MACOSX/') || path.startsWith('.DS_Store') || path.includes('/.DS_Store')) {
        console.log(`Skipping system file: ${path}`)
        return false
      }
      
      // Skip empty paths
      if (!path || path.trim() === '') {
        console.log('Skipping empty path')
        return false
      }
      
      return true
    })
    
    console.log(`Processing ${validEntries.length} valid files`)
    
    // Extract each valid file
    for (const [path, zipEntry] of validEntries) {
      try {
        console.log(`Extracting: ${path}`)
        
        // Extract the file content
        const content = await zipEntry.async('arrayBuffer')
        
        if (content.byteLength === 0) {
          console.warn(`Skipping empty file: ${path}`)
          continue
        }
        
        console.log(`Extracted ${path}, size: ${content.byteLength} bytes`)
        
        // Get clean filename
        const fileName = path.split('/').pop() || path
        const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
        
        // Create unique storage path
        const timestamp = Date.now()
        const randomSuffix = Math.random().toString(36).substring(2, 8)
        const storagePath = `${userId}/${timestamp}_${randomSuffix}_${cleanFileName}`
        
        console.log(`Uploading to storage: ${storagePath}`)
        
        // Determine file type
        const fileType = determineFileType(fileName)
        
        // Upload to storage
        const { error: uploadError } = await supabase
          .storage
          .from('files')
          .upload(storagePath, new Blob([content]), {
            contentType: fileType,
            upsert: false
          })
        
        if (uploadError) {
          console.error(`Error uploading ${path}:`, uploadError)
          continue
        }
        
        console.log(`Successfully uploaded: ${storagePath}`)
        
        // Create file record in database
        const { data: newFile, error: newFileError } = await supabase
          .from('files')
          .insert({
            name: fileName,
            type: fileType,
            size: content.byteLength,
            user_id: userId,
            encrypted: false,
            storage_path: storagePath,
            parent_folder: destinationFolder || null
          })
          .select('*')
          .single()
        
        if (newFileError) {
          console.error(`Error creating file record for ${path}:`, newFileError)
          // Clean up uploaded file
          await supabase.storage.from('files').remove([storagePath])
          continue
        }
        
        extractedFiles.push(newFile)
        console.log(`Successfully processed: ${path}`)
      } catch (entryError) {
        console.error(`Error processing ${path}:`, entryError)
        continue
      }
    }
    
    console.log(`Extraction complete. ${extractedFiles.length} files extracted successfully.`)
    
    return new Response(
      JSON.stringify({ 
        success: true,
        files: extractedFiles,
        message: `Successfully extracted ${extractedFiles.length} files from ${fileInfo.name}`,
        extractedCount: extractedFiles.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error extracting archive:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error'
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}

// Helper function to determine file type from name
function determineFileType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()
  
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    xml: 'application/xml',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    wav: 'audio/wav',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    '7z': 'application/x-7z-compressed'
  }
  
  return extension && extension in mimeTypes
    ? mimeTypes[extension]
    : 'application/octet-stream'
}

// Function to handle compressing files
async function handleCompressFiles(
  fileIds: string[], 
  userId: string, 
  archiveName: string, 
  archiveType: 'zip' | 'tar',
  parentFolder: string = ''
) {
  console.log('Starting compression for files:', fileIds)
  
  if (!fileIds || fileIds.length === 0) {
    throw new Error('No files selected for compression')
  }
  
  if (!archiveName) {
    throw new Error('Archive name is required')
  }
  
  try {
    // Only support ZIP for now
    if (archiveType !== 'zip') {
      throw new Error('Only ZIP archive type is currently supported')
    }
    
    // Fetch the files from the database
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('*')
      .in('id', fileIds)
      .eq('user_id', userId)
    
    if (filesError) {
      console.error('Database error fetching files:', filesError)
      throw new Error(`Error fetching files: ${filesError.message}`)
    }
    
    if (!files || files.length === 0) {
      throw new Error('No valid files found for compression')
    }
    
    console.log(`Found ${files.length} files to compress`)
    
    // Create a new ZIP archive
    const zip = new JSZip()
    
    // Add each file to the archive
    for (const file of files) {
      try {
        console.log(`Processing file: ${file.name}`)
        
        // Get the file content from storage
        const { data: fileData, error: fileDataError } = await supabase
          .storage
          .from('files')
          .download(file.storage_path)
        
        if (fileDataError) {
          console.warn(`Error downloading file ${file.name}:`, fileDataError)
          continue
        }
        
        if (!fileData) {
          console.warn(`No data found for file ${file.name}, skipping...`)
          continue
        }
        
        // Convert blob to array buffer
        const fileBuffer = await fileData.arrayBuffer()
        
        // Add the file to the ZIP
        zip.file(file.name, fileBuffer)
        console.log(`Added file ${file.name} to ZIP`)
      } catch (fileError) {
        console.warn(`Error processing file ${file.name}:`, fileError)
        continue
      }
    }
    
    // Generate the ZIP file
    console.log('Generating ZIP archive...')
    const zipContent = await zip.generateAsync({ type: 'uint8array' })
    console.log(`ZIP generated, size: ${zipContent.byteLength} bytes`)
    
    // Create storage path
    const timestamp = Date.now()
    const storagePath = `${userId}/${timestamp}_${archiveName}`
    
    // Upload to storage
    const { error: uploadError } = await supabase
      .storage
      .from('files')
      .upload(storagePath, new Blob([zipContent]), {
        contentType: 'application/zip',
        upsert: false
      })
    
    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      throw new Error(`Error uploading ZIP: ${uploadError.message}`)
    }
    
    console.log(`ZIP uploaded to storage: ${storagePath}`)
    
    // Create a new file record in the database
    const { data: newFile, error: newFileError } = await supabase
      .from('files')
      .insert({
        name: archiveName,
        type: 'application/zip',
        size: zipContent.byteLength,
        user_id: userId,
        encrypted: false,
        storage_path: storagePath,
        parent_folder: parentFolder || null
      })
      .select('*')
      .single()
    
    if (newFileError) {
      console.error('Database insert error:', newFileError)
      throw new Error(`Error creating new file: ${newFileError.message}`)
    }
    
    console.log('Compression completed successfully')
    
    return new Response(
      JSON.stringify({ 
        file: newFile,
        success: true
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error compressing files:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown compression error'
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}
