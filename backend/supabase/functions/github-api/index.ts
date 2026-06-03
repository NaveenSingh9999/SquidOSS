
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_ENDPOINT_PATTERNS = [
  /^users\/[A-Za-z0-9-]+$/,
  /^users\/[A-Za-z0-9-]+\/repos$/,
  /^repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
  /^rate_limit$/,
];

function isAllowedEndpoint(endpoint: string): boolean {
  if (!endpoint || endpoint.includes('://') || endpoint.startsWith('/') || endpoint.includes('..') || endpoint.includes('?')) {
    return false;
  }
  return ALLOWED_ENDPOINT_PATTERNS.some((pattern) => pattern.test(endpoint));
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

  const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!GITHUB_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Required edge configuration missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Authorization header required' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const isInternalServiceCall = token === SUPABASE_SERVICE_ROLE_KEY;
  if (!isInternalServiceCall) {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  try {
    const { endpoint, params } = await req.json();
    
    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'GitHub API endpoint is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedEndpoint = String(endpoint).trim();
    if (!isAllowedEndpoint(normalizedEndpoint)) {
      return new Response(
        JSON.stringify({ error: 'Endpoint is not allowed by policy' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Construct the URL for the GitHub API request
    const url = new URL(`https://api.github.com/${normalizedEndpoint}`);
    
    // Add query parameters if they exist
    if (params) {
      const entries = Object.entries(params as Record<string, unknown>);
      for (const [key, value] of entries) {
        if (['string', 'number', 'boolean'].includes(typeof value)) {
          url.searchParams.append(key, String(value));
        } else {
          return new Response(
            JSON.stringify({ error: `Invalid query param type for key: ${key}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }
    
    console.log(`Making GitHub API request to: ${url.toString()}`);
    
    // Make the request to GitHub API
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Squid-App'
      }
    });
    
    // Parse the response
    const data = await response.json();
    
    // Return the GitHub API response
    return new Response(
      JSON.stringify(data),
      { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in GitHub API function:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
