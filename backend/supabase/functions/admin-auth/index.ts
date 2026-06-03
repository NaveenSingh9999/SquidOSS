import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kza-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AdminAuthPayload = {
  step: number;
  accessKey?: string;
  adminUserId?: string;
  adminPassword?: string;
  accessPurpose?: string;
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

  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseServiceKey) {
    return new Response("Missing SUPABASE_SERVICE_ROLE_KEY secret", { status: 500, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const token = authHeader.replace("Bearer ", "");

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  let payload: AdminAuthPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON payload", { status: 400, headers: corsHeaders });
  }

  const step = Number(payload.step);
  if (!Number.isFinite(step) || step < 1 || step > 4) {
    return new Response("Invalid step", { status: 400, headers: corsHeaders });
  }

  const logAccess = async (stepCompleted: number, success: boolean, reason: string) => {
    await supabase.from("admin_access_logs").insert({
      user_id: user.id,
      access_purpose: reason,
      step_completed: stepCompleted,
      ip_address: req.headers.get("x-forwarded-for") || "unknown",
      user_agent: req.headers.get("user-agent"),
      session_id: crypto.randomUUID(),
    });
    return success;
  };

  if (step === 1) {
    const expectedKey = Deno.env.get("ADMIN_ACCESS_KEY");
    if (!expectedKey) {
      return new Response("Missing ADMIN_ACCESS_KEY secret", { status: 500, headers: corsHeaders });
    }

    if (!payload.accessKey || payload.accessKey !== expectedKey) {
      await logAccess(1, false, "Failed access key verification");
      return new Response(JSON.stringify({ success: false, message: "Invalid access key" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logAccess(1, true, "Passed access key verification");
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (step === 2) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      await logAccess(2, false, "Failed admin privilege check");
      return new Response(JSON.stringify({ success: false, message: "Admin privileges required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logAccess(2, true, "Passed admin privilege check");
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (step === 3) {
    const expectedAdminUser = Deno.env.get("ADMIN_USER_ID");
    const expectedAdminPassword = Deno.env.get("ADMIN_PASSWORD");
    const missingSecrets = [
      ...(expectedAdminUser ? [] : ["ADMIN_USER_ID"]),
      ...(expectedAdminPassword ? [] : ["ADMIN_PASSWORD"]),
    ];
    if (missingSecrets.length) {
      const secretWord = missingSecrets.length === 1 ? "secret" : "secrets";
      return new Response(`Missing ${missingSecrets.join(", ")} ${secretWord}`, { status: 500, headers: corsHeaders });
    }

    if (
      !payload.adminUserId ||
      !payload.adminPassword ||
      payload.adminUserId !== expectedAdminUser ||
      payload.adminPassword !== expectedAdminPassword
    ) {
      await logAccess(3, false, "Failed admin credentials verification");
      return new Response(JSON.stringify({ success: false, message: "Invalid admin credentials" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logAccess(3, true, "Passed admin credentials verification");
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const accessPurpose = payload.accessPurpose?.trim();
  if (!accessPurpose) {
    return new Response(JSON.stringify({ success: false, message: "Access purpose required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await logAccess(4, true, accessPurpose);
  return new Response(JSON.stringify({ success: true, verified: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
