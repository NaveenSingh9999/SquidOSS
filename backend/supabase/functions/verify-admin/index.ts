import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kza-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? new URL(req.url).origin;

  // Allow preflight requests without KZA enforcement.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // KZA Guard — must be first
  const kzaResponse = await fetch(`${supabaseUrl}/functions/v1/kza-sentinel`, {
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseServiceKey) {
    return new Response("Missing SUPABASE_SERVICE_ROLE_KEY secret", { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const token = authHeader.replace("Bearer ", "");

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ verified: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
