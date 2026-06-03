
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { normalize } from "https://deno.land/std/path/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Define proper CORS headers to allow requests from any origin
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-upload-filename, x-upload-path, x-upload-repo, x-upload-nodeid, x-upload-userid, x-upload-chunkindex, x-upload-totalchunks, x-kza-session, x-forwarded-for',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Create a response with error information and CORS headers
const createErrorResponse = (message: string, status = 500, details?: any) => {
  console.error(`Error: ${message}`, details);
  return new Response(
    JSON.stringify({ 
      error: message,
      details: details ? JSON.stringify(details) : undefined
    }),
    { 
      status: status, 
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      } 
    }
  );
};

// Main serve function
serve(async (req) => {
  // Handle CORS preflight requests immediately (before any auth or KZA checks)
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  // KZA Guard — must be first after OPTIONS
  const reqContentType = req.headers.get('content-type') || '';
  const isBinaryUpload = reqContentType.includes('application/octet-stream');

  let bodySnapshot = '';
  if (!isBinaryUpload) {
    try { bodySnapshot = await req.clone().text(); } catch { bodySnapshot = '[unreadable]'; }
  } else {
    bodySnapshot = '[binary upload - skipped]';
  }

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
      body_snapshot: bodySnapshot
    })
  });

  if (!kzaResponse.ok) {
    return kzaResponse; // KZA blocked this request — return its response directly
  }

  try {
    // GitHub API Clustering - Load balance across 3 accounts
    const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');
    const GITHUB_USERNAME = Deno.env.get('GITHUB_USERNAME');
    const GITHUB_TOKEN_2 = Deno.env.get('GITHUB_TOKEN_2');
    const GITHUB_USERNAME_2 = Deno.env.get('GITHUB_USERNAME_2');
    const GITHUB_TOKEN_3 = Deno.env.get('GITHUB_TOKEN_3');
    const GITHUB_USERNAME_3 = Deno.env.get('GITHUB_USERNAME_3');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
      return createErrorResponse('GitHub configuration not complete. GITHUB_TOKEN and GITHUB_USERNAME are required.', 500);
    }
    
    // Build GitHub node cluster (1-3 nodes)
    const githubNodes = [
      { token: GITHUB_TOKEN, username: GITHUB_USERNAME, nodeId: 0 }
    ];
    if (GITHUB_TOKEN_2 && GITHUB_USERNAME_2) {
      githubNodes.push({ token: GITHUB_TOKEN_2, username: GITHUB_USERNAME_2, nodeId: 1 });
    }
    if (GITHUB_TOKEN_3 && GITHUB_USERNAME_3) {
      githubNodes.push({ token: GITHUB_TOKEN_3, username: GITHUB_USERNAME_3, nodeId: 2 });
    }
    
    console.log(`GitHub cluster initialized with ${githubNodes.length} node(s)`);

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return createErrorResponse('Supabase configuration not complete.', 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('Authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!bearerToken) {
      return createErrorResponse('Authorization header required', 401);
    }

    const isInternalServiceCall = bearerToken === SUPABASE_SERVICE_ROLE_KEY;
    let requesterUserId: string | null = null;

    if (!isInternalServiceCall) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken);
      if (authError || !user) {
        return createErrorResponse('Unauthorized', 401);
      }
      requesterUserId = user.id;
    }

    let requestData;

    if (isBinaryUpload) {
      // Binary upload path: read metadata from headers, body is raw encrypted bytes
      const binaryBody = await req.arrayBuffer();
      const chunkIndex = parseInt(req.headers.get('X-Upload-ChunkIndex') || '0');
      const totalChunks = parseInt(req.headers.get('X-Upload-TotalChunks') || '1');

      // Base64-encode the raw binary → this becomes the "d" field
      const binaryBytes = new Uint8Array(binaryBody);
      let dBinary = '';
      for (let i = 0; i < binaryBytes.length; i++) {
        dBinary += String.fromCharCode(binaryBytes[i]);
      }
      const dValue = btoa(dBinary);

      // Construct the {v, i, t, d} wrapper server-side (same format as before)
      const chunkData = JSON.stringify({ v: '2.3', i: chunkIndex, t: totalChunks, d: dValue });

      requestData = {
        action: 'upload',
        fileName: req.headers.get('X-Upload-FileName') || '',
        data: chunkData,
        fileType: 'application/json',
        userId: req.headers.get('X-Upload-UserId') || '',
        path: req.headers.get('X-Upload-Path') || '',
        repo: req.headers.get('X-Upload-Repo') || '',
        // The cluster returns 1-based nodeId (1,2,3) but githubNodes uses 0-based indexing (0,1,2)
        nodeId: (parseInt(req.headers.get('X-Upload-NodeId') || '1') - 1),
      };
    } else {
      try {
        requestData = await req.json();
      } catch (error) {
        return createErrorResponse('Invalid JSON in request body', 400, error);
      }
    }

    const { action, ...body } = requestData;

    const requestedUserId = typeof body.userId === 'string' ? body.userId : undefined;
    const userId = isInternalServiceCall
      ? requestedUserId
      : (requestedUserId || requesterUserId || undefined);

    if (!isInternalServiceCall && requestedUserId && requestedUserId !== requesterUserId) {
      return createErrorResponse('Forbidden: cannot act on another user', 403);
    }

    const safePath = (userId: string, requestedPath: string): string | null => {
      const normalized = normalize(requestedPath).replace(/^\/+/, '');
      if (normalized === userId || normalized.startsWith(`${userId}/`)) {
        return normalized;
      }
      return null;
    };

    if (!isInternalServiceCall && ['upload', 'download', 'delete', 'create_folder'].includes(action)) {
      const candidatePath = typeof body.path === 'string' && body.path.length > 0
        ? body.path
        : (action === 'upload' && userId && body.fileName ? `${userId}/${body.fileName}` : undefined);

      const normalizedPath = candidatePath ? safePath(requesterUserId, candidatePath) : null;
      if (candidatePath && !normalizedPath) {
        return createErrorResponse('Forbidden: path is outside your namespace', 403);
      }

      if (normalizedPath) {
        body.path = normalizedPath;
      }
    }

    if (!isInternalServiceCall && ['upload', 'list', 'create_folder', 'create-repos'].includes(action) && !userId) {
      return createErrorResponse('userId is required for this action', 400);
    }

    console.log(`[github-storage] action=${action}`, {
      requesterUserId,
      requestedUserId,
      repo: body.repo,
      hasPath: typeof body.path === 'string',
      hasData: typeof body.data === 'string',
      nodeId: body.nodeId,
    });

    if (!action) {
      return createErrorResponse('Action is required', 400);
    }

    // Add create-repos action handler
    if (action === 'create-repos') {
      const { count, userId } = body;
      
      if (!userId) {
        return createErrorResponse('User ID is required', 400);
      }

      try {
        // First check for existing repos
        const { data: existingRepos, error: repoError } = await supabase
          .from('repositories')
          .select('*')
          .eq('user_id', userId);

        if (repoError) {
          throw repoError;
        }
        
        // If user already has repos, return them
        if (existingRepos && existingRepos.length > 0) {
          console.log(`Found ${existingRepos.length} existing repos for user ${userId}`);
          return new Response(
            JSON.stringify({ 
              repos: existingRepos.map(repo => ({
                name: repo.repo_name,
                html_url: `https://github.com/${GITHUB_USERNAME}/${repo.repo_name}`
              }))
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Continue with creating new repos only if none exist
        const validCount = Math.min(Math.max(1, count || 2), 2); // Limit to 2 repos max
        const createdRepos = [];

        // Generate random repo names if Gemini is not available
        let repoNames = [];
        for (let i = 0; i < validCount; i++) {
          repoNames.push(`SquidCloud_${Math.random().toString(36).substring(2, 7)}`);
        }

        // Try to get creative names from Gemini if available
        if (GEMINI_API_KEY) {
          try {
            const genNames = await generateCreativeRepoNames(validCount, GEMINI_API_KEY);
            if (genNames && genNames.length === validCount) {
              repoNames = genNames;
            }
          } catch (e) {
            console.warn("Could not get creative names, using fallback names", e);
          }
        }

        // Create repos across all cluster nodes for distribution
        for (let i = 0; i < validCount; i++) {
          const baseName = repoNames[i];
          const uniqueSuffix = `${Date.now().toString(36)}_${i}`;
          const repoName = `${baseName}_${uniqueSuffix}`;
          
          // Select node for this repo (round-robin)
          const nodeIndex = i % githubNodes.length;
          const node = githubNodes[nodeIndex];

          // Create repository with retry logic
          const createRepoWithRetry = async (retries = 3): Promise<any> => {
            try {
              const createResponse = await fetch(
                'https://api.github.com/user/repos',
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `token ${node.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'CloudVault-Edge-Function',
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    name: repoName,
                    description: `Secure data vault - Node ${node.nodeId}`,
                    private: true,
                    auto_init: true
                  })
                }
              );

              if (!createResponse.ok) {
                const errorText = await createResponse.text();
                console.error(`GitHub API error (${createResponse.status}): ${errorText}`);
                
                if (retries > 0 && [429, 500, 502, 503, 504].includes(createResponse.status)) {
                  // Wait and retry for rate limits or server errors
                  const delay = (4 - retries) * 1000; // Increasing backoff
                  console.log(`Retrying repo creation for ${repoName} after ${delay}ms, ${retries} retries left`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                  return createRepoWithRetry(retries - 1);
                }
                
                throw new Error(`Failed to create repo: ${createResponse.status} - ${errorText}`);
              }

              return await createResponse.json();
            } catch (error) {
              if (retries > 0) {
                const delay = (4 - retries) * 1000;
                console.log(`Error creating repo, retrying after ${delay}ms: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return createRepoWithRetry(retries - 1);
              }
              throw error;
            }
          };

          try {
            const repoData = await createRepoWithRetry();
            
            // Store repo in database with node info
            const { error: insertError } = await supabase
              .from('repositories')
              .insert({
                user_id: userId,
                repo_name: repoName,
                github_username: node.username,
                node_id: node.nodeId,
                status: { 
                  created: new Date().toISOString(),
                  node: node.nodeId,
                  username: node.username
                }
              });

            if (insertError) {
              console.error(`Error storing repo in database: ${insertError.message}`);
            }

            createdRepos.push({
              name: repoName,
              html_url: repoData.html_url
            });

            // Update user's repo_count
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ repo_count: createdRepos.length })
              .eq('id', userId);

            if (updateError) {
              console.error(`Error updating repo count: ${updateError.message}`);
            }

          } catch (createError) {
            console.error(`Failed to create repo ${repoName}:`, createError);
            // Continue with next repo despite error
          }
        }

        if (createdRepos.length === 0) {
          return createErrorResponse('Failed to create any repositories', 500);
        }

        return new Response(
          JSON.stringify({ repos: createdRepos }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Error in create-repos:', error);
        return createErrorResponse('Failed to create repositories', 500, error);
      }
    }

    // Validate required parameters for file operations
    const { fileName, fileType, data, path, createRepo, repo, nodeId } = body;
    
    // Use the specified repo if provided, otherwise try to find a repo for this user
    let storageRepo = repo;
    
    // Select node based on provided nodeId (1-based from caller), or default to first node
    let selectedNode = githubNodes[0];
    if (nodeId !== undefined && nodeId >= 1 && nodeId <= githubNodes.length) {
      selectedNode = githubNodes[nodeId - 1];
      console.log(`Using specified node ${nodeId}: ${selectedNode.username}`);
    }
    
    if (!storageRepo) {
      // If no repo specified, get a list of repos for this user
      if (!userId) {
        return createErrorResponse('Either repo or userId is required', 400);
      }
      
      try {
        const { data: repos, error: repoError } = await supabase
          .from('repositories')
          .select('repo_name, node_id, github_username')
          .eq('user_id', userId);
        
        if (repoError) {
          throw repoError;
        }
        
        if (repos && repos.length > 0) {
          // Pick a random repo from the list for load balancing
          const randomIndex = Math.floor(Math.random() * repos.length);
          storageRepo = repos[randomIndex].repo_name;
        }
      } catch (dbError) {
        console.error("Error fetching repositories:", dbError);
        return createErrorResponse('Failed to fetch repositories', 500, dbError);
      }
    }
    
    // If we still don't have a repo and createRepo flag is true, we'll create a user-specific repository
    if (!storageRepo && createRepo) {
      // Generate a repository name for this user if not provided
      const userStorageRepo = `SquidCloud_${userId.slice(0, 8)}_${Date.now().toString(36)}`;
      
      // Create a new private repository for this user
      try {
        // Check if the repository already exists
        const repoExists = await checkRepoExists(userStorageRepo, GITHUB_USERNAME, GITHUB_TOKEN);
        
        if (!repoExists) {
          await createRepository(userStorageRepo, GITHUB_USERNAME, GITHUB_TOKEN);
          console.log(`Created new repository: ${userStorageRepo} for user ${userId}`);
          
          // Store in database
          const { error: insertError } = await supabase
            .from('repositories')
            .insert({
              user_id: userId,
              repo_name: userStorageRepo
            });
          
          if (insertError) {
            console.error(`Failed to store repo record: ${insertError.message}`);
          }
        }
        
        storageRepo = userStorageRepo;
      } catch (createError) {
        console.error("Error creating repository:", createError);
        return createErrorResponse('Failed to create repository', 500, createError);
      }
    }
    
    if (!storageRepo) {
      return createErrorResponse('No storage repository available', 400);
    }
    
    console.log(`Using repository: ${storageRepo} for action: ${action}`);
    
    // Before performing any operation, verify the repository exists
    try {
      const repoExists = await checkRepoExists(storageRepo, GITHUB_USERNAME, GITHUB_TOKEN);
      
      if (!repoExists) {
        if (createRepo) {
          console.log(`Repository ${storageRepo} does not exist, creating it now.`);
          await createRepository(storageRepo, GITHUB_USERNAME, GITHUB_TOKEN);
          console.log(`Successfully created repository: ${storageRepo}`);
        } else {
          return createErrorResponse(`Repository ${storageRepo} does not exist`, 404);
        }
      }
    } catch (repoCheckError) {
      console.error("Error checking repository:", repoCheckError);
      return createErrorResponse('Failed to verify repository', 500, repoCheckError);
    }
    
    // Handle different file operations
    switch (action) {
      case 'upload': {
        console.log(`[Upload] Received upload request for file: ${fileName}`);
        
        if (!fileName || !data || !userId) {
          return createErrorResponse('fileName, data, and userId are required for upload', 400);
          
        }
        
        // Log payload sizes
        const dataSize = data.length;
        console.log(`[Upload] Data size: ${dataSize} chars (${(dataSize / 1024).toFixed(2)} KB)`);
        console.log(`[Upload] Repo: ${repo}, NodeId: ${nodeId}`);
        
        // Create a file path for this user
        const filePath = path || `${userId}/${fileName}`;
        
        // Ensure user directory exists - create the directory if needed
        try {
          const dirExists = await checkPathExists(userId, storageRepo, GITHUB_USERNAME, GITHUB_TOKEN);
          if (!dirExists) {
            await createDirectory(userId, storageRepo, GITHUB_USERNAME, GITHUB_TOKEN);
            console.log(`Created directory for user ${userId} in repository ${storageRepo}`);
          }
        } catch (dirError) {
          try {
            console.log(`Creating directory for user ${userId} in repository ${storageRepo}`);
            await createDirectory(userId, storageRepo, GITHUB_USERNAME, GITHUB_TOKEN);
          } catch (createDirError) {
            console.error("Error creating directory:", createDirError);
            return createErrorResponse('Failed to create directory', 500, createDirError);
          }
        }
        
        try {
          // Convert data to base64 if it's not already
          let base64Content = data;
          
          // For JSON data (chunks), encode to base64 for GitHub API
          if (fileType && fileType.startsWith('application/json')) {
            try {
              console.log(`[Upload] Encoding JSON data (${data.length} chars) to base64...`);
              
              // JSON is pure ASCII — btoa() works directly, avoiding expensive TextEncoder+Array.from+join chain
              base64Content = btoa(data);
              
              const base64Size = base64Content.length;
              const base64MB = (base64Size / 1024 / 1024).toFixed(2);
              console.log(`[Upload] Base64 size: ${base64Size} chars (${base64MB} MB)`);
              
              // Check if payload is too large for edge function
              const totalPayloadSize = JSON.stringify({
                action: 'upload',
                fileName,
                data: base64Content,
                fileType,
                userId,
                path,
                repo,
                nodeId
              }).length;
              const totalPayloadMB = (totalPayloadSize / 1024 / 1024).toFixed(2);
              console.log(`[Upload] Total payload size: ${totalPayloadSize} bytes (${totalPayloadMB} MB)`);
              
              if (totalPayloadSize > 25 * 1024 * 1024) {
                console.error(`[Upload] PAYLOAD TOO LARGE! ${totalPayloadMB} MB exceeds 25MB limit!`);
                throw new Error(`Payload too large: ${totalPayloadMB} MB (max 25MB). Reduce chunk size.`);
              }
              
              console.log(`[Upload] Encoded ${data.length} chars to ${base64Content.length} chars base64`);
            } catch (encodeError) {
              console.error("Error encoding JSON content:", encodeError);
              throw new Error(`Failed to encode content: ${encodeError instanceof Error ? encodeError.message : 'Unknown error'}`);
            }
          }
          
          // Exponential backoff retry helper
          const exponentialBackoff = (attempt: number): number => {
            // 100ms, 200ms, 400ms, 800ms
            const base = 100 * Math.pow(2, attempt);
            // Add jitter (±25%) to prevent thundering herd
            const jitter = base * 0.25 * (Math.random() * 2 - 1);
            return Math.min(base + jitter, 5000); // Cap at 5s
          };
          
          // Check if error is retryable
          const isRetryableError = (error: any): boolean => {
            const retryableCodes = [429, 500, 502, 503, 504];
            const retryableMessages = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'timeout'];
            
            if (!error?.message) return false;
            
            return retryableCodes.some(code => error.message.includes(String(code))) ||
                   retryableMessages.some(msg => error.message.toLowerCase().includes(msg.toLowerCase()));
          };
          
          // Upload file to GitHub with optimized retries
          const uploadWithRetries = async (retries = 4) => {
            try {
              return await uploadToGitHub(filePath, base64Content, fileType, storageRepo, selectedNode.username, selectedNode.token);
            } catch (uploadError) {
              if (retries > 0 && isRetryableError(uploadError)) {
                const delay = exponentialBackoff(4 - retries);
                console.log(`Upload error, retrying after ${delay.toFixed(0)}ms: ${uploadError.message || uploadError}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return uploadWithRetries(retries - 1);
              }
              throw uploadError;
            }
          };
          
          const uploadResponse = await uploadWithRetries();
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              path: filePath, 
              repo: storageRepo,
              ...uploadResponse 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (uploadError) {
          console.error("Error uploading file:", uploadError);
          return createErrorResponse('Failed to upload file', 500, uploadError);
        }
      }
      
      case 'download': {
        try {
          if (!path || !repo) {
            return createErrorResponse('path and repo are required for download', 400);
          }
      
          // Exponential backoff for downloads
          const exponentialBackoff = (attempt: number): number => {
            const base = 100 * Math.pow(2, attempt);
            const jitter = base * 0.25 * (Math.random() * 2 - 1);
            return Math.min(base + jitter, 5000);
          };
          
          // Get file from GitHub with optimized retries
          const downloadWithRetries = async (retries = 4) => {
            try {
              const url = `https://api.github.com/repos/${selectedNode.username}/${repo}/contents/${path}`;
              console.log(`[Download] Fetching from GitHub: ${url}`);
              
              const response = await fetch(url, {
                headers: {
                  'Authorization': `Bearer ${selectedNode.token}`,
                  'Accept': 'application/vnd.github.v3+json',
                  'User-Agent': 'SquidCloud-Storage-App'
                }
              });
          
              console.log(`[Download] GitHub response status: ${response.status} ${response.statusText}`);
          
              if (!response.ok) {
                const errorBody = await response.text();
                console.error(`[Download] GitHub error response:`, errorBody);
                
                // Retry on server errors and rate limits
                if (retries > 0 && [429, 500, 502, 503, 504].includes(response.status)) {
                  const delay = exponentialBackoff(4 - retries);
                  console.log(`Download error (${response.status}), retrying after ${delay.toFixed(0)}ms`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                  return downloadWithRetries(retries - 1);
                }
                throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorBody}`);
              }
          
              const data = await response.json();
              console.log(`[Download] Response data keys:`, Object.keys(data || {}));
              return data;
            } catch (error: any) {
              // Don't retry 404s (file not found)
              if (error.message && error.message.includes('404')) {
                throw error;
              }
              
              // Retry other errors
              if (retries > 0) {
                const delay = exponentialBackoff(4 - retries);
                console.log(`Download error, retrying after ${delay.toFixed(0)}ms: ${error.message || error}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return downloadWithRetries(retries - 1);
              }
              throw error;
            }
          };
          
          const data = await downloadWithRetries();
      
          // For large files (>1MB), GitHub doesn't include content directly
          // Instead, use the download_url to fetch the content
          let content = data.content;
          
          if (!content && data.download_url) {
            console.log(`[Download] Content not inline, fetching from download_url: ${data.download_url}`);
            
            try {
              const downloadResponse = await fetch(data.download_url, {
                headers: {
                  'Authorization': `Bearer ${selectedNode.token}`,
                  'Accept': 'application/vnd.github.v3.raw',
                  'User-Agent': 'SquidCloud-Storage-App'
                }
              });
              
              if (!downloadResponse.ok) {
                throw new Error(`Failed to fetch from download_url: ${downloadResponse.status}`);
              }
              
              // Get the raw content and convert to base64
              const rawContent = await downloadResponse.text();
              content = btoa(rawContent);
              console.log(`[Download] Successfully fetched content via download_url (${content.length} chars base64)`);
            } catch (downloadError) {
              console.error('[Download] Error fetching from download_url:', downloadError);
              return createErrorResponse('Failed to fetch file content from download_url', 500, downloadError);
            }
          }
          
          // Validate content exists
          if (!content) {
            console.error('[Download] No content found after all attempts');
            return createErrorResponse('No content found in GitHub response', 404, { 
              hasDownloadUrl: !!data.download_url,
              responseKeys: Object.keys(data)
            });
          }
      
          return new Response(
            JSON.stringify({ 
              success: true, 
              content: content,
              size: data.size,
              sha: data.sha 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('Download error:', error);
          return createErrorResponse('Failed to download file', 500, error);
        }
      }
      
      case 'delete': {
        if (!path || !repo) {
          return createErrorResponse('path and repo are required for delete', 400);
        }
        
        try {
          // Delete file from GitHub with retries using the selected node
          const deleteWithRetries = async (retries = 3) => {
            try {
              await deleteFromGitHub(path, repo, selectedNode.username, selectedNode.token);
              return true;
            } catch (deleteError) {
              if (retries > 0 && deleteError.message && deleteError.message.includes('API')) {
                const delay = (4 - retries) * 1000;
                console.log(`Delete error, retrying after ${delay}ms: ${deleteError.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return deleteWithRetries(retries - 1);
              }
              throw deleteError;
            }
          };
          
          await deleteWithRetries();
          
          return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (deleteError) {
          console.error("Error deleting file:", deleteError);
          return createErrorResponse('Failed to delete file', 500, deleteError);
        }
      }
      
      case 'list': {
        if (!userId) {
          return createErrorResponse('userId is required for listing files', 400);
        }
        
        try {
          // List files for this user in the specific repo
          const files = await listUserFiles(userId, storageRepo, GITHUB_USERNAME, GITHUB_TOKEN);
          
          return new Response(
            JSON.stringify({ success: true, files }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (listError) {
          console.error("Error listing files:", listError);
          return createErrorResponse('Failed to list files', 500, listError);
        }
      }
      
      case 'create_folder': {
        if (!userId || !body.folderName) {
          return createErrorResponse('userId and folderName are required for creating a folder', 400);
        }
        
        try {
          const folderPath = path ? `${path}/${body.folderName}` : `${userId}/${body.folderName}`;
          
          // Create folder (directory)
          await createDirectory(folderPath, storageRepo, GITHUB_USERNAME, GITHUB_TOKEN);
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              path: folderPath,
              repo: storageRepo 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (folderError) {
          console.error("Error creating folder:", folderError);
          return createErrorResponse('Failed to create folder', 500, folderError);
        }
      }
      
      default:
        return createErrorResponse(`Unknown action: ${action}`, 400);
    }
  } catch (error) {
    console.error('Error in GitHub storage function:', error);
    return createErrorResponse('Internal server error', 500, error);
  }
});

// Check if repository exists
async function checkRepoExists(repo: string, username: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${username}/${repo}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SquidCloud-Storage-App'
        }
      }
    );
    
    return response.status === 200;
  } catch (error) {
    console.error('Error checking repository:', error);
    return false;
  }
}

// Create a new private GitHub repository
async function createRepository(repo: string, username: string, token: string): Promise<void> {
  const response = await fetch(
    'https://api.github.com/user/repos',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SquidCloud-Storage-App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: repo,
        description: 'SquidCloud secure storage vault',
        private: true,
        auto_init: true
      })
    }
  );
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to create repository: ${response.status} ${response.statusText} - ${errorData}`);
  }
}

// Check if a path exists in the repository
async function checkPathExists(path: string, repo: string, username: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${username}/${repo}/contents/${path}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SquidCloud-Storage-App'
        }
      }
    );
    
    return response.status === 200;
  } catch (error) {
    console.error('Error checking path:', error);
    return false;
  }
}

// Create a directory by adding a README.md file
async function createDirectory(dirPath: string, repo: string, username: string, token: string): Promise<void> {
  const readmePath = `${dirPath}/README.md`;
  const readmeContent = 'This directory contains encrypted storage chunks.';
  
  await uploadToGitHub(
    readmePath,
    btoa(readmeContent),
    'text/markdown',
    repo,
    username,
    token
  );
}

// List files for a specific user
async function listUserFiles(userId: string, repo: string, username: string, token: string): Promise<any[]> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${username}/${repo}/contents/${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SquidCloud-Storage-App'
        }
      }
    );
    
    if (response.status === 404) {
      // Directory doesn't exist yet, which is fine
      return [];
    }
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error listing files:', error);
    // Return empty array to avoid breaking the client
    return [];
  }
}

// Helper function to upload a file to GitHub
async function uploadToGitHub(
  path: string, 
  content: string, 
  contentType: string, 
  repo: string,
  username: string,
  token: string
): Promise<any> {
  console.log(`Uploading to GitHub: ${path} in repo ${repo}`);
  
  // Optimized upload: Try direct upload first (no SHA check for new files)
  // If file exists (409/422), fetch SHA and retry with update
  // This gives us 50% speedup for new files while handling edge cases
  
  let uploadBody: any = {
    message: `Upload file ${path.split('/').pop()}`,
    content: content, // Base64 encoded content
  };
  
  // Try direct upload first (assume new file)
  let response = await fetch(
    `https://api.github.com/repos/${username}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SquidCloud-Storage-App',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(uploadBody),
    }
  );
  
  // If file already exists (409 Conflict or 422 Unprocessable), get SHA and retry
  if (!response.ok && (response.status === 409 || response.status === 422)) {
    console.log(`File exists at ${path}, fetching SHA for update`);
    
    try {
      // Get existing file SHA
      const existingResponse = await fetch(
        `https://api.github.com/repos/${username}/${repo}/contents/${path}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'SquidCloud-Storage-App',
          },
        }
      );
      
      if (existingResponse.ok) {
        const existingData = await existingResponse.json();
        
        // Retry upload with SHA
        uploadBody.sha = existingData.sha;
        
        response = await fetch(
          `https://api.github.com/repos/${username}/${repo}/contents/${path}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'SquidCloud-Storage-App',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(uploadBody),
          }
        );
      }
    } catch (shaError) {
      console.error('Error fetching SHA for existing file:', shaError);
      // Continue with original error response
    }
  }
  
  if (!response.ok) {
    const errorData = await response.text();
    console.error('GitHub API error:', errorData);
    throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorData}`);
  }
  
  const data = await response.json();
  return { 
    url: data.content.download_url, 
    sha: data.content.sha,
    html_url: data.content.html_url 
  };
}

// Helper function to delete a file from GitHub
async function deleteFromGitHub(
  path: string,
  repo: string,
  username: string,
  token: string
): Promise<void> {
  console.log(`Deleting from GitHub: ${path} from repo ${repo}`);
  
  // First, get the current SHA
  const fileResponse = await fetch(
    `https://api.github.com/repos/${username}/${repo}/contents/${path}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SquidCloud-Storage-App',
      },
    }
  );
  
  if (!fileResponse.ok) {
    if (fileResponse.status === 404) {
      console.log(`File ${path} not found, already deleted`);
      return;
    }
    throw new Error(`GitHub API error: ${fileResponse.status} ${fileResponse.statusText}`);
  }
  
  const fileData = await fileResponse.json();
  
  // Now delete the file
  const response = await fetch(
    `https://api.github.com/repos/${username}/${repo}/contents/${path}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SquidCloud-Storage-App',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Delete file ${path}`,
        sha: fileData.sha,
      }),
    }
  );
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
}

// Helper function to generate creative repository names using Gemini API or fallback to defaults
async function generateCreativeRepoNames(count: number, apiKey: string): Promise<string[]> {
  try {
    // Simple hardcoded creative names as fallback
    const creativeNames = [
      "quantumVault", "cyberNexus", "dataForge", "byteHaven", "secureSphere", 
      "cryptoKeeper", "cloudArmor", "dataMatrix", "safeHarbor", "bitVault"
    ];
    
    // Use a simple trick - select random items from our predefined list
    const shuffled = [...creativeNames].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  } catch (error) {
    console.error('Error generating creative repo names:', error);
    return [];
  }
}
