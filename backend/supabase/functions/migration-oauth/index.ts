
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OAuthUrls {
  [key: string]: {
    authUrl: string;
    clientId: string;
    redirectUri: string;
    scope: string;
  };
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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { platform } = await req.json();
    
    if (!platform) {
      return new Response(
        JSON.stringify({ error: "Platform is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid auth token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Define OAuth configurations with correct redirect URIs
    const baseRedirectUri = `https://aouqcwbdoyrccjcrhzzi.supabase.co/functions/v1/migration-oauth-callback`;
    
    const oauthConfigs: OAuthUrls = {
      'google-drive': {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: Deno.env.get('GOOGLE_CLIENT_ID') || '',
        redirectUri: baseRedirectUri,
        scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email'
      },
      'dropbox': {
        authUrl: 'https://www.dropbox.com/oauth2/authorize',
        clientId: Deno.env.get('DROPBOX_APP_KEY') || '',
        redirectUri: baseRedirectUri,
        scope: 'files.metadata.read files.content.read'
      },
      'onedrive': {
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        clientId: Deno.env.get('MICROSOFT_CLIENT_ID') || '',
        redirectUri: baseRedirectUri,
        scope: 'Files.Read Files.Read.All User.Read offline_access'
      }
    };

    const config = oauthConfigs[platform];
    if (!config) {
      return new Response(
        JSON.stringify({ error: "Unsupported platform" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!config.clientId) {
      return new Response(
        JSON.stringify({ error: `${platform} client ID not configured` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Generate state parameter for security
    const state = crypto.randomUUID();

    // Create migration job
    const { data: job, error: jobError } = await supabase
      .from('migration_jobs')
      .insert({
        user_id: user.id,
        source_platform: platform,
        status: 'pending',
        settings: { oauth_state: state }
      })
      .select()
      .single();

    if (jobError) {
      throw jobError;
    }

    // Build OAuth URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scope,
      response_type: 'code',
      state: `${state}:${user.id}:${platform}`,
      access_type: 'offline',
      prompt: 'consent'
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;

    return new Response(
      JSON.stringify({ authUrl, state, job }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in migration-oauth:", error);
    
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
