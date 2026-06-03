
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
    const { shareId, password } = await req.json();
    
    if (!shareId) {
      return new Response(
        JSON.stringify({ success: false, message: "Share ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Use the proper get_shared_file_info function from database
    const { data, error } = await supabase
      .rpc('get_shared_file_info', { share_id_param: shareId });

    if (error || !data || data.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "Share not found or may have been removed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const shareInfo = data[0];

    // Check if share has expired
    if (shareInfo.share_expires_at) {
      const expiresAt = new Date(shareInfo.share_expires_at);
      if (expiresAt < new Date()) {
        return new Response(
          JSON.stringify({ success: false, message: "This share link has expired" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
        );
      }
    }

    // Check password if required
    if (shareInfo.access_code && shareInfo.access_code.trim() !== '') {
      if (!password || password !== shareInfo.access_code) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: "Password required",
            requiresPassword: true 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
        );
      }
    }

    // Return success with file data
    return new Response(
      JSON.stringify({ 
        success: true, 
        file: {
          id: shareInfo.file_id,
          name: shareInfo.file_name,
          type: shareInfo.file_type,
          size: shareInfo.file_size,
          created_at: shareInfo.file_created_at,
          updated_at: shareInfo.file_updated_at,
          encrypted: shareInfo.is_encrypted,
          storage_path: shareInfo.storage_path,
          user_id: shareInfo.owner_id,
          share_created_at: shareInfo.share_created_at,
          share_expires_at: shareInfo.share_expires_at
        },
        message: "Share link is valid" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Error validating share:", error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: "Internal server error while validating share link" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
