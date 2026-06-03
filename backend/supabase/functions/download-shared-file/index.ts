
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests immediately (before any auth or KZA checks)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // KZA Guard
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

  try {
    // Get the request body
    const { shareId, password } = await req.json();
    
    if (!shareId) {
      return new Response(
        JSON.stringify({ error: "Share ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Create a Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Use the proper get_shared_file_info function to validate and get file info
    const { data, error: shareError } = await supabase
      .rpc('get_shared_file_info', { share_id_param: shareId });
      
    if (shareError || !data || data.length === 0) {
      console.error('Share validation error:', shareError);
      return new Response(
        JSON.stringify({ error: "Share not found or has been revoked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const shareInfo = data[0];

    // Check if share has expired
    if (shareInfo.share_expires_at) {
      const expiresAt = new Date(shareInfo.share_expires_at);
      if (expiresAt < new Date()) {
        return new Response(
          JSON.stringify({ error: "This share link has expired" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
        );
      }
    }

    // Check password if required
    if (shareInfo.access_code && shareInfo.access_code.trim() !== '') {
      if (!password || password !== shareInfo.access_code) {
        return new Response(
          JSON.stringify({ error: "Invalid password", requiresPassword: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }
    }
    
    // Look up the file record to get storage path and user info
    const { data: fileRecord, error: fileError } = await supabase
      .from('files')
      .select('storage_path, user_id, type, name')
      .eq('id', shareInfo.file_id)
      .single();
    
    if (fileError || !fileRecord) {
      console.error('File lookup error:', fileError);
      return new Response(
        JSON.stringify({ error: "File not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }
    
    // Find a repo for the file owner
    const { data: userRepos, error: repoError } = await supabase
      .from('repositories')
      .select('repo_name, node_id')
      .eq('user_id', fileRecord.user_id);
    
    if (repoError || !userRepos || userRepos.length === 0) {
      console.error('Repo lookup error:', repoError);
      return new Response(
        JSON.stringify({ error: "Storage repository not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
    
    const repo = userRepos[0];
    const storagePath = fileRecord.storage_path || `${fileRecord.user_id}/${shareInfo.file_name || fileRecord.name}`;
    
    // Get the file content from GitHub storage
    const response = await supabase.functions.invoke('github-storage', {
      body: { 
        action: 'download', 
        path: storagePath,
        repo: repo.repo_name,
        nodeId: repo.node_id
      }
    });
    
    if (response.error || !response.data) {
      console.error('Storage download error:', response.error);
      return new Response(
        JSON.stringify({ error: "Failed to download file from storage" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
    
    // Return the file content
    return new Response(
      JSON.stringify({ 
        content: response.data.content, 
        contentType: shareInfo.file_type || fileRecord.type,
        fileName: shareInfo.file_name || fileRecord.name,
        fileSize: shareInfo.file_size
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Error downloading shared file:", error);
    
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
