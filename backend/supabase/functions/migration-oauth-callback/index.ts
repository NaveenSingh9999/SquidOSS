
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
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      return new Response(
        `<html><body><script>window.close();</script><p>Authorization failed: ${error}</p></body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    if (!code || !state) {
      throw new Error('Missing authorization code or state');
    }

    // Parse state to get user_id and platform
    const [stateToken, userId, platform] = state.split(':');
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify state matches stored state
    const { data: job } = await supabase
      .from('migration_jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('source_platform', platform)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!job || job.settings?.oauth_state !== stateToken) {
      throw new Error('Invalid state parameter');
    }

    // Exchange code for tokens based on platform
    let tokenData;
    switch (platform) {
      case 'google-drive':
        tokenData = await exchangeGoogleCode(code);
        break;
      case 'dropbox':
        tokenData = await exchangeDropboxCode(code);
        break;
      case 'onedrive':
        tokenData = await exchangeOneDriveCode(code);
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    // Store tokens in migration job
    await supabase
      .from('migration_jobs')
      .update({
        status: 'authenticated',
        settings: {
          ...job.settings,
          oauth_tokens: tokenData,
          oauth_state: null // Clear state after use
        }
      })
      .eq('id', job.id);

    // Close popup and redirect parent
    return new Response(
      `<html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth_success',
                platform: '${platform}',
                jobId: '${job.id}'
              }, '*');
              window.close();
            } else {
              window.location.href = '/dashboard?oauth_success=true';
            }
          </script>
          <p>Authorization successful! You can close this window.</p>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );

  } catch (error) {
    console.error("OAuth callback error:", error);
    
    return new Response(
      `<html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth_error',
                error: '${error.message}'
              }, '*');
              window.close();
            }
          </script>
          <p>Authorization failed: ${error.message}</p>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
});

async function exchangeGoogleCode(code: string) {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: `https://aouqcwbdoyrccjcrhzzi.supabase.co/functions/v1/migration-oauth-callback`
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed: ${tokenResponse.statusText}`);
  }

  return await tokenResponse.json();
}

async function exchangeDropboxCode(code: string) {
  const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('DROPBOX_APP_KEY') || '',
      client_secret: Deno.env.get('DROPBOX_APP_SECRET') || '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: `https://aouqcwbdoyrccjcrhzzi.supabase.co/functions/v1/migration-oauth-callback`
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`Dropbox token exchange failed: ${tokenResponse.statusText}`);
  }

  return await tokenResponse.json();
}

async function exchangeOneDriveCode(code: string) {
  const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('MICROSOFT_CLIENT_ID') || '',
      client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET') || '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: `https://aouqcwbdoyrccjcrhzzi.supabase.co/functions/v1/migration-oauth-callback`
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`OneDrive token exchange failed: ${tokenResponse.statusText}`);
  }

  return await tokenResponse.json();
}
