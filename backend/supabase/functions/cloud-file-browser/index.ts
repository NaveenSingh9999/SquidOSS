
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId, path = '', action = 'list' } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Invalid auth token');
    }

    // Get migration job with tokens
    const { data: job, error: jobError } = await supabase
      .from('migration_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();

    if (jobError || !job) {
      throw new Error('Migration job not found');
    }

    const tokens = job.settings?.oauth_tokens;
    if (!tokens) {
      throw new Error('No OAuth tokens found');
    }

    let files;
    switch (job.source_platform) {
      case 'google-drive':
        files = await listGoogleDriveFiles(tokens, path);
        break;
      case 'dropbox':
        files = await listDropboxFiles(tokens, path);
        break;
      case 'onedrive':
        files = await listOneDriveFiles(tokens, path);
        break;
      default:
        throw new Error(`Unsupported platform: ${job.source_platform}`);
    }

    return new Response(
      JSON.stringify({ files }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Cloud file browser error:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function listGoogleDriveFiles(tokens: any, folderId: string = 'root') {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,mimeType,size,createdTime,parents)&pageSize=100`,
    {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Google Drive API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.files.map((file: any) => ({
    id: file.id,
    name: file.name,
    type: file.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
    size: file.size ? parseInt(file.size) : 0,
    created: file.createdTime,
    mimeType: file.mimeType
  }));
}

async function listDropboxFiles(tokens: any, path: string = '') {
  const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: path || '',
      recursive: false,
      include_media_info: false,
      include_deleted: false,
      include_has_explicit_shared_members: false
    })
  });

  if (!response.ok) {
    throw new Error(`Dropbox API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.entries.map((entry: any) => ({
    id: entry.id,
    name: entry.name,
    type: entry['.tag'] === 'folder' ? 'folder' : 'file',
    size: entry.size || 0,
    created: entry.client_modified,
    path: entry.path_lower
  }));
}

async function listOneDriveFiles(tokens: any, path: string = '') {
  const endpoint = path 
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${path}/children`
    : 'https://graph.microsoft.com/v1.0/me/drive/root/children';
    
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`OneDrive API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.value.map((item: any) => ({
    id: item.id,
    name: item.name,
    type: item.folder ? 'folder' : 'file',
    size: item.size || 0,
    created: item.createdDateTime,
    downloadUrl: item['@microsoft.graph.downloadUrl']
  }));
}
