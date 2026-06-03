
// CloudBliss API v2.0 - File Operations API
// Deployed: 2025-10-05
// CloudBliss API v3.0 - Full file management with RES54 encryption
// Updated: 2025-10-05 - Added RES54 encryption/decryption support
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-squidcloud-key, x-squidcloud-encryption-key, x-encryption-key',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

// RES54 Configuration
const MAX_PARALLEL_OPERATIONS = 3
const MAX_RETRIES = 8
const RETRY_DELAY_BASE = 1000
const CHUNK_SIZE_SMALL = 512 * 1024  // 512KB
const CHUNK_SIZE_MEDIUM = 1 * 1024 * 1024  // 1MB
const CHUNK_SIZE_LARGE = 2 * 1024 * 1024  // 2MB
const LARGE_FILE_THRESHOLD = 128 * 1024 * 1024 // 128MB

console.log('CloudBliss API v3.0 loaded with RES54 encryption')

function getOptionalEncryptionKey(req: Request, queryParams?: URLSearchParams): string | null {
  const headerKey = req.headers.get('x-squidcloud-encryption-key') || req.headers.get('x-encryption-key')
  const queryKey = queryParams?.get('encryption_key') || queryParams?.get('encryptionKey')
  const value = (headerKey || queryKey || '').trim()
  return value.length > 0 ? value : null
}

function validateEncryptionKeyFormat(key: string): boolean {
  return key.length >= 8 && key.length <= 512
}

// Encryption/Decryption utilities (matching frontend format)
async function generateEncryptionKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
  const exported = await crypto.subtle.exportKey('raw', key)
  return Array.from(new Uint8Array(exported))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function encryptData(data: ArrayBuffer, key: string): Promise<string> {
  // Match frontend encryption format exactly
  const keyBytes = new TextEncoder().encode(key.slice(0, 32).padEnd(32, '0'))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  
  const keyBuffer = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  // Add AEAD additional data for integrity (matching frontend)
  const additionalData = new TextEncoder().encode(`res54-v2-${Date.now()}`)
  
  const encryptedContent = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData },
    keyBuffer,
    data
  )

  // Combine in frontend format: [4 bytes dataLength][additionalData][IV][encrypted content]
  const combined = new Uint8Array(iv.length + encryptedContent.byteLength + additionalData.length + 4)
  
  // Store additionalData length as first 4 bytes (little-endian)
  const dataLengthView = new DataView(combined.buffer, 0, 4)
  dataLengthView.setUint32(0, additionalData.length, true)
  
  // Copy additionalData after length
  combined.set(additionalData, 4)
  
  // Copy IV after additionalData
  combined.set(iv, 4 + additionalData.length)
  
  // Copy encrypted content after IV
  combined.set(new Uint8Array(encryptedContent), 4 + additionalData.length + iv.length)
  
  // Convert to base64
  return btoa(String.fromCharCode(...combined))
}

async function decryptData(encryptedData: string, key: string): Promise<ArrayBuffer> {
  // Match frontend decryption format exactly
  const binaryData = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0))
  
  // Read additionalData length (first 4 bytes, little-endian)
  const dataLengthView = new DataView(binaryData.buffer, 0, 4)
  const additionalDataLength = dataLengthView.getUint32(0, true)
  
  // Extract additionalData
  const additionalData = binaryData.slice(4, 4 + additionalDataLength)
  
  // Extract IV (12 bytes after additionalData)
  const iv = binaryData.slice(4 + additionalDataLength, 4 + additionalDataLength + 12)
  
  // Extract encrypted content (everything after IV)
  const encryptedContent = binaryData.slice(4 + additionalDataLength + 12)
  
  // Import key
  const keyBytes = new TextEncoder().encode(key.slice(0, 32).padEnd(32, '0'))
  const keyBuffer = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  
  // Decrypt
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData },
    keyBuffer,
    encryptedContent
  )
}

async function calculateSHA256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function backoffDelay(attempt: number): number {
  return Math.min(RETRY_DELAY_BASE * Math.pow(2, attempt), 30000)
}

async function hmacHex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

const ROLE_RANK: Record<string, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 }

async function requireWorkspaceRole(supabase: any, workspaceId: string, userId: string, minRole: string): Promise<{ allowed: boolean; role: string | null }> {
  const { data: role, error } = await supabase.rpc('get_workspace_role', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  })
  if (error || !role) return { allowed: false, role: null }
  const userRank = ROLE_RANK[role as string] || 0
  const minRank = ROLE_RANK[minRole] || 0
  return { allowed: userRank >= minRank, role }
}

async function resolveWorkspaceId(supabase: any, userId: string, workspaceId?: string): Promise<string | null> {
  if (workspaceId) return workspaceId
  const { data, error } = await supabase.rpc('get_or_create_default_workspace', { p_user_id: userId })
  if (error || !data) return null
  return data
}

serve(async (req) => {
  // Handle CORS preflight requests immediately (before any auth or KZA checks)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('CloudBliss API function invoked');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const internalToken = await hmacHex(serviceKey, 'kza-internal-v1');

  const kzaResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/kza-sentinel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': '',  // Empty for internal KZA calls - authentication via x-kza-internal header
      'x-kza-internal': internalToken,
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
    const errorBody = await kzaResponse.text();
    return new Response(errorBody, { 
      status: kzaResponse.status, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  let supabase: any
  let keyData: any = null

  try {
    supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get API key from custom header (case-insensitive)
    const apiKey = req.headers.get('x-squidcloud-key') || 
                   req.headers.get('X-SquidCloud-Key') || 
                   req.headers.get('Authorization')?.replace('Bearer ', '')
    
     console.log('CloudBliss API request received', {
       hasApiKey: !!apiKey,
       apiKeyPrefix: apiKey ? apiKey.substring(0, 8) : 'none',
       method: req.method,
       pathname: new URL(req.url).pathname,
       allHeaders: Object.fromEntries(req.headers.entries())
     })
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'SquidCloud API key required. Include it in X-SquidCloud-Key header.',
          success: false,
          code: 401,
          message: 'Missing authorization header'
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Verify API key using salt-based hashing
    const keyPrefix = apiKey.substring(0, 8) // Extract cb_xxxxxx prefix (8 chars)
    
    // Get all active keys with this prefix
    const { data: candidateKeys, error: keyError } = await supabase
      .from('api_keys')
      .select('id, user_id, is_active, scopes, key_hash, key_salt')
      .eq('key_prefix', keyPrefix)
      .eq('is_active', true)

    if (keyError || !candidateKeys || candidateKeys.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid SquidCloud API key',
          success: false 
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check each candidate key by computing salted hash
    const encoder = new TextEncoder()
    
    for (const candidate of candidateKeys) {
      // Decode the base64 salt back to bytes
      const saltBase64 = candidate.key_salt || ''
      const saltBytes = saltBase64 ? Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0)) : new Uint8Array(0)
      
      // Encode API key to bytes
      const apiKeyBytes = encoder.encode(apiKey)
      
      // Combine salt bytes + API key bytes (same as generation)
      const combined = new Uint8Array(saltBytes.length + apiKeyBytes.length)
      combined.set(saltBytes)
      combined.set(apiKeyBytes, saltBytes.length)
      
      // Hash the combined bytes
      const hashBuffer = await crypto.subtle.digest('SHA-256', combined)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
      if (computedHash === candidate.key_hash) {
        keyData = candidate
        break
      }
    }

    if (!keyData) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid SquidCloud API key',
          success: false 
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyData.key_hash)

    const url = new URL(req.url)
    const workspaceId = url.searchParams.get('workspace_id') || undefined
    
    // Extract path after /cloudbliss-api
    let path = url.pathname
      .replace('/cloudbliss-api', '')
      .replace(/\/+/g, '/') // Replace multiple slashes with single slash
      .replace(/\/$/, '') // Remove trailing slash
    
    // Ensure path starts with / or set to /
    if (!path || path === '') path = '/'
    
    // Route to appropriate handler - check path components
    const pathParts = path.split('/').filter(p => p.length > 0)
    const firstPathSegment = pathParts[0] || ''

    // Track request for api_request_logs
    const startTime = Date.now()
    let apiResponse: Response
    let apiError = ''

    try {
      if (firstPathSegment === 'files') {
        apiResponse = await handleFilesAPI(req, supabase, keyData.user_id, path, workspaceId)
      } else if (firstPathSegment === 'keys') {
        apiResponse = await handleKeysAPI(req, supabase, keyData.user_id, path)
      } else if (firstPathSegment === 'storage') {
        apiResponse = await handleStorageAPI(req, supabase, keyData.user_id, workspaceId)
      } else if (firstPathSegment === 'user' || firstPathSegment === 'whoami') {
        apiResponse = await handleUserAPI(req, supabase, keyData.user_id)
      } else {
        apiResponse = new Response(
          JSON.stringify({ 
            message: 'SquidCloud API v2.3',
            version: '2.3',
            endpoints: ['/files', '/keys', '/storage', '/user', '/whoami'],
            workspace_support: 'Add ?workspace_id=<uuid> to scope operations to a workspace',
            success: true 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    } catch (error) {
      console.error('SquidCloud API handler error:', error)
      apiError = error instanceof Error ? error.message : 'Internal server error'
      apiResponse = new Response(
        JSON.stringify({ error: apiError, success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } finally {
      try {
        await supabase.from('api_request_logs').insert({
          api_key_id: keyData.id,
          user_id: keyData.user_id,
          endpoint: url.pathname,
          method: req.method,
          ip_address: req.headers.get('x-forwarded-for') || null,
          user_agent: req.headers.get('user-agent') || null,
          status_code: apiResponse.status,
          response_time_ms: Date.now() - startTime,
          error_message: apiError || null,
        })
      } catch (logError) {
        console.error('Failed to log API request:', logError)
      }
    }

    return apiResponse

  } catch (error) {
    console.error('SquidCloud API Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function handleFilesAPI(req: Request, supabase: any, userId: string, path: string, workspaceId?: string) {
  const method = req.method
  
  // Resolve workspace and check viewer+ access for all file operations
  const wsId = await resolveWorkspaceId(supabase, userId, workspaceId)
  if (!wsId) {
    return new Response(
      JSON.stringify({ error: 'No workspace found', success: false }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  
  const viewerCheck = await requireWorkspaceRole(supabase, wsId, userId, 'viewer')
  const editorCheck = viewerCheck.allowed ? { allowed: ROLE_RANK[(viewerCheck.role || 'viewer')] >= ROLE_RANK.editor, role: viewerCheck.role } : { allowed: false, role: null }
  const adminCheck = viewerCheck.allowed ? { allowed: ROLE_RANK[(viewerCheck.role || 'viewer')] >= ROLE_RANK.admin, role: viewerCheck.role } : { allowed: false, role: null }
  
  if (!viewerCheck.allowed) {
    return new Response(
      JSON.stringify({ error: 'Insufficient workspace permissions', success: false, code: 403 }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  
  // GET /files - List all files and folders in workspace
  if (method === 'GET' && path === '/files') {
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('*')
      .eq('workspace_id', wsId)
      .is('is_deleted', false)
      .order('created_at', { ascending: false })

    const { data: folders, error: foldersError } = await supabase
      .from('folders')
      .select('*')
      .eq('workspace_id', wsId)
      .order('created_at', { ascending: false })

    if (filesError || foldersError) {
      throw filesError || foldersError
    }

    return new Response(
      JSON.stringify({ 
        files: files || [], 
        folders: folders || [],
        total_files: files?.length || 0,
        total_folders: folders?.length || 0,
        success: true 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  
  // GET /files/:id/metadata - Get file metadata by ID
  if (method === 'GET' && path.match(/^\/files\/[a-f0-9-]+\/metadata$/)) {
    const fileId = path.split('/')[2]
    
    const { data: file, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .eq('workspace_id', wsId)
      .single()

    if (error || !file) {
      return new Response(
        JSON.stringify({ error: 'File not found', success: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ file, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // GET /files/:id/download - Download file with RES54 decryption
  if (method === 'GET' && path.match(/^\/files\/[a-f0-9-]+\/download$/)) {
    const fileId = path.split('/')[2]
    const providedEncryptionKey = getOptionalEncryptionKey(req, new URL(req.url).searchParams)

    if (providedEncryptionKey && !validateEncryptionKeyFormat(providedEncryptionKey)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid encryption key format',
          success: false,
          code: 400,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .eq('workspace_id', wsId)
      .single()

    if (fileError || !file) {
      return new Response(
        JSON.stringify({ error: 'File not found', success: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if file uses RES54 encryption
    if (file.storage_path === 'res54_distributed' && file.encrypted) {
      // Parse metadata from tags
      let metadata
      try {
        metadata = Array.isArray(file.tags) && file.tags.length > 0 
          ? JSON.parse(file.tags[0])
          : null
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'Invalid file metadata', success: false }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!metadata || !metadata.chunks) {
        return new Response(
          JSON.stringify({ error: 'File metadata not found', success: false }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const decryptionKey = providedEncryptionKey || file.encryption_key

      if (!decryptionKey) {
        return new Response(
          JSON.stringify({ error: 'Encryption key missing for encrypted file', success: false, code: 422 }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Download and decrypt chunks
      const chunks: ArrayBuffer[] = []
      for (const chunkMeta of metadata.chunks) {
        try {
          // Download chunk from GitHub storage
          const response = await supabase.functions.invoke('github-storage', {
            body: { action: 'download', path: chunkMeta.path, repo: chunkMeta.repo }
          })

          if (response.error) {
            throw new Error(`Failed to download chunk ${chunkMeta.index}`)
          }

          // Decode and parse chunk data
          const cleanContent = response.data.content.replace(/\s/g, '')
          const decodedContent = atob(cleanContent)
          const parsedChunk = JSON.parse(decodedContent)

          // Decrypt chunk
          const decryptedChunk = await decryptData(parsedChunk.chunkData, decryptionKey)
          chunks.push(decryptedChunk)
        } catch (error) {
          console.error(`Error processing chunk ${chunkMeta.index}:`, error)

          if (providedEncryptionKey) {
            return new Response(
              JSON.stringify({
                error: 'Provided encryption key mismatch. Unable to decrypt file.',
                success: false,
                code: 422,
              }),
              { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ error: `Failed to decrypt file chunk ${chunkMeta.index}`, success: false }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // Combine chunks
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
      const combined = new Uint8Array(totalSize)
      let offset = 0
      for (const chunk of chunks) {
        combined.set(new Uint8Array(chunk), offset)
        offset += chunk.byteLength
      }

      // Return decrypted file
      return new Response(combined, {
        headers: {
          ...corsHeaders,
          'Content-Type': file.type || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${file.name}"`,
        }
      })
    } else {
      // Regular file without RES54 encryption
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('files')
        .download(file.storage_path)

      if (downloadError) {
        throw downloadError
      }

      return new Response(fileData, {
        headers: {
          ...corsHeaders,
          'Content-Type': file.type || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${file.name}"`,
        }
      })
    }
  }
  
  // POST /files/upload - Upload a file with RES54 encryption
  if (method === 'POST' && path === '/files/upload') {
    if (!editorCheck.allowed) {
      return new Response(
        JSON.stringify({ error: 'Editor role required to upload files', success: false, code: 403 }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const folderId = formData.get('folderId') as string | null
    const formEncryptionKey = (formData.get('encryption_key') || formData.get('encryptionKey')) as string | null
    const headerEncryptionKey = getOptionalEncryptionKey(req)
    const providedEncryptionKey = (formEncryptionKey || headerEncryptionKey || '').trim() || null
    
    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (providedEncryptionKey && !validateEncryptionKeyFormat(providedEncryptionKey)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid encryption key format',
          success: false,
          code: 400,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const fileName = file.name
    const fileSize = file.size
    const fileType = file.type

    // Check if user has repositories
    const { data: repos } = await supabase
      .from('repositories')
      .select('repo_name')
      .eq('user_id', userId)

    if (!repos?.length) {
      return new Response(
        JSON.stringify({ error: 'Please create a Storage Vault before uploading files', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use caller-provided encryption key if present; otherwise generate server key
    const encryptionKey = providedEncryptionKey || await generateEncryptionKey()

    // Determine chunk size based on file size
    let chunkSize = CHUNK_SIZE_SMALL
    if (fileSize > 10 * 1024 * 1024) { // > 10MB
      chunkSize = CHUNK_SIZE_MEDIUM
    }
    if (fileSize > 50 * 1024 * 1024) { // > 50MB
      chunkSize = CHUNK_SIZE_LARGE
    }

    // Read file data
    const fileBuffer = await file.arrayBuffer()
    const fileData = new Uint8Array(fileBuffer)

    // Create chunks
    const chunks: ArrayBuffer[] = []
    const chunkMetadata: any[] = []
    let offset = 0

    while (offset < fileSize) {
      const end = Math.min(offset + chunkSize, fileSize)
      const chunk = fileData.slice(offset, end)
      chunks.push(chunk.buffer)

      chunkMetadata.push({
        index: chunks.length - 1,
        totalChunks: Math.ceil(fileSize / chunkSize),
        size: chunk.length,
        offset,
        sha256: await calculateSHA256(chunk)
      })

      offset = end
    }

    // Encrypt and upload chunks
    const uploadedChunks: any[] = []
    for (let i = 0; i < chunks.length; i++) {
      try {
        // Encrypt chunk
        const encryptedChunk = await encryptData(chunks[i], encryptionKey)

        // Select repository (round-robin)
        const repoIndex = i % repos.length
        const repo = repos[repoIndex].repo_name
        const chunkId = `res54_${Date.now().toString(36)}_${i}`
        const path = `${userId}/${chunkId}.json`

        // Prepare chunk metadata
        const chunkData = {
          version: '3.0',
          chunkIndex: i,
          totalChunks: chunks.length,
          fileName,
          fileType,
          fileSize,
          chunkData: encryptedChunk,
          chunkSize: encryptedChunk.length,
          checksum: await calculateSHA256(new TextEncoder().encode(encryptedChunk)),
          repo,
          path
        }

        // Upload to GitHub storage
        const response = await supabase.functions.invoke('github-storage', {
          body: {
            action: 'upload',
            fileName: `${chunkId}.json`,
            fileType: 'application/json',
            data: JSON.stringify(chunkData),
            userId,
            path,
            repo
          }
        })

        if (response.error) {
          throw new Error(`Failed to upload chunk ${i}: ${response.error.message}`)
        }

        // Store chunk location
        chunkMetadata[i].repo = repo
        chunkMetadata[i].path = path
        uploadedChunks.push({ index: i, repo, path })
      } catch (error) {
        console.error(`Error uploading chunk ${i}:`, error)
        return new Response(
          JSON.stringify({ error: `Failed to upload chunk ${i}`, success: false }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Create file metadata
    const metadata = {
      fileName,
      fileType,
      fileSize,
      chunks: chunkMetadata,
      encryptionKey,
      created: new Date().toISOString(),
      previewAvailable: false
    }

    // Create file record in database
    const { data: fileRecord, error: fileError } = await supabase
      .from('files')
      .insert({
        user_id: userId,
        name: fileName,
        type: fileType,
        size: fileSize,
        storage_path: 'res54_distributed',
        parent_folder: folderId || null,
        workspace_id: wsId,
        encrypted: true,
        encryption_key: encryptionKey,
        tags: [JSON.stringify(metadata)],
        is_deleted: false
      })
      .select()
      .single()

    if (fileError) {
      console.error('Database error:', fileError)
      return new Response(
        JSON.stringify({ error: 'Failed to create file record', success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        file: fileRecord, 
        success: true,
        message: 'File uploaded and encrypted successfully',
        encryption: {
          mode: providedEncryptionKey ? 'provided' : 'generated',
          key_required_for_download: true,
        },
      }),
      { 
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // DELETE /files/:id - Delete a file
  if (method === 'DELETE' && path.match(/^\/files\/[a-f0-9-]+$/)) {
    const fileId = path.split('/')[2]
    
    if (!editorCheck.allowed) {
      return new Response(
        JSON.stringify({ error: 'Editor role required to delete files', success: false, code: 403 }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .eq('workspace_id', wsId)
      .single()

    if (fetchError || !file) {
      return new Response(
        JSON.stringify({ error: 'File not found', success: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Editors can only delete their own files; admins can delete any
    if (!adminCheck.allowed && file.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete another user\'s file', success: false, code: 403 }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Soft delete - mark as deleted
    const { error: deleteError } = await supabase
      .from('files')
      .update({ 
        is_deleted: true,
        deleted_at: new Date().toISOString()
      })
      .eq('id', fileId)

    if (deleteError) throw deleteError

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'File deleted successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ error: 'Endpoint not found', success: false }),
    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleKeysAPI(req: Request, supabase: any, userId: string, path: string) {
  if (req.method === 'GET' && path === '/keys') {
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, scopes, created_at, last_used_at, is_active')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return new Response(
      JSON.stringify({ keys, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ error: 'Endpoint not found', success: false }),
    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleStorageAPI(req: Request, supabase: any, userId: string, workspaceId?: string) {
  const wsId = await resolveWorkspaceId(supabase, userId, workspaceId)

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('storage_used')
    .eq('id', userId)
    .single()

  if (error) throw error

  const filesQuery = supabase.from('files').select('size')
  if (wsId) {
    filesQuery.eq('workspace_id', wsId)
  } else {
    filesQuery.eq('user_id', userId)
  }
  const { data: files, error: filesError } = await filesQuery

  if (filesError) throw filesError

  const totalFiles = files.length
  const totalSize = files.reduce((sum: number, file: any) => sum + file.size, 0)

  return new Response(
    JSON.stringify({ 
      storage_used: profile.storage_used,
      total_files: totalFiles,
      total_size: totalSize,
      success: true 
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleUserAPI(req: Request, supabase: any, userId: string) {
  if (req.method === 'GET') {
    // Get user profile and auth info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, created_at, storage_used')
      .eq('id', userId)
      .single()

    if (profileError) {
      // Fallback to auth.users if profile doesn't exist
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId)
      
      if (authError) throw authError
      
      return new Response(
        JSON.stringify({ 
          id: authUser.user.id,
          email: authUser.user.email,
          created_at: authUser.user.created_at,
          success: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        created_at: profile.created_at,
        storage_used: profile.storage_used,
        success: true 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ error: 'Method not allowed', success: false }),
    { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
