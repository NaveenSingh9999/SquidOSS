import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DownloadRequest {
  action: 'create' | 'update_status' | 'update_progress';
  fileId: string;
  status?: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed';
  progress?: number;
  downloadSpeed?: number;
  estimatedTime?: number;
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

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the JWT and get user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader);
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, fileId, status, progress, downloadSpeed, estimatedTime }: DownloadRequest = await req.json();

    switch (action) {
      case 'create':
        // Get file info
        const { data: fileData, error: fileError } = await supabaseClient
          .from('files')
          .select('size')
          .eq('id', fileId)
          .eq('user_id', user.id)
          .single();

        if (fileError || !fileData) {
          return new Response(
            JSON.stringify({ error: 'File not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create download record
        const { data: downloadData, error: downloadError } = await supabaseClient
          .from('downloads')
          .insert({
            user_id: user.id,
            file_id: fileId,
            total_bytes: fileData.size,
            status: 'queued',
            started_at: new Date().toISOString()
          })
          .select()
          .single();

        if (downloadError) throw downloadError;

        return new Response(
          JSON.stringify({ download: downloadData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'update_status':
        const updateData: any = { status };
        
        if (status === 'downloading' && !progress) {
          updateData.started_at = new Date().toISOString();
        }
        
        if (status === 'completed') {
          updateData.completed_at = new Date().toISOString();
          updateData.progress = 100;
        }

        const { error: statusError } = await supabaseClient
          .from('downloads')
          .update(updateData)
          .eq('file_id', fileId)
          .eq('user_id', user.id);

        if (statusError) throw statusError;

        return new Response(
          JSON.stringify({ message: 'Status updated successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'update_progress':
        const progressData: any = { 
          progress: progress || 0,
          download_speed: downloadSpeed || 0,
          estimated_time: estimatedTime || 0,
          bytes_downloaded: Math.floor((progress || 0) / 100 * (await getFileSize(supabaseClient, fileId, user.id)))
        };

        const { error: progressError } = await supabaseClient
          .from('downloads')
          .update(progressData)
          .eq('file_id', fileId)
          .eq('user_id', user.id);

        if (progressError) throw progressError;

        return new Response(
          JSON.stringify({ message: 'Progress updated successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('Download manager error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getFileSize(supabaseClient: any, fileId: string, userId: string): Promise<number> {
  const { data } = await supabaseClient
    .from('files')
    .select('size')
    .eq('id', fileId)
    .eq('user_id', userId)
    .single();
  
  return data?.size || 0;
}