import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ProviderPayload = {
  providerType: string;
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
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

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response("Server configuration error", { status: 500, headers: corsHeaders });
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

  let payload: ProviderPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON payload", { status: 400, headers: corsHeaders });
  }

  const providerType = payload.providerType?.trim();
  if (!providerType) {
    return new Response(JSON.stringify({ success: false, error: "Provider type is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!payload.accessKeyId || !payload.secretAccessKey || !payload.bucketName) {
    return new Response(JSON.stringify({ success: false, error: "Missing provider credentials" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (providerType === "r2" && !payload.accountId) {
    return new Response(JSON.stringify({ success: false, error: "Account ID is required for R2" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const credentials = {
    accountId: payload.accountId,
    accessKeyId: payload.accessKeyId,
    secretAccessKey: payload.secretAccessKey,
    bucketName: payload.bucketName,
  };

  const { data: encryptedData, error: encryptError } = await supabase.rpc(
    "encrypt_keyring_secret",
    {
      p_key_name: "storage_provider_credentials",
      p_plaintext: JSON.stringify(credentials),
    }
  );

  if (encryptError || !Array.isArray(encryptedData) || encryptedData.length === 0) {
    return new Response(JSON.stringify({ success: false, error: "Failed to encrypt credentials" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const [encryptedEntry] = encryptedData;
  if (!encryptedEntry?.ciphertext || !encryptedEntry?.nonce) {
    return new Response(JSON.stringify({ success: false, error: "Failed to encrypt credentials" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const encryptedPayload = JSON.stringify({
    ciphertext: encryptedEntry.ciphertext,
    nonce: encryptedEntry.nonce,
    version: 1,
  });

  const { data: existingProvider } = await supabase
    .from("storage_providers")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider_type", providerType)
    .maybeSingle();

  let storedProvider;
  if (existingProvider?.id) {
    const { data, error } = await supabase
      .from("storage_providers")
      .update({
        encrypted_credentials: encryptedPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingProvider.id)
      .select("id, provider_type")
      .single();

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    storedProvider = data;
  } else {
    const { data, error } = await supabase
      .from("storage_providers")
      .insert({
        user_id: user.id,
        provider_type: providerType,
        encrypted_credentials: encryptedPayload,
        is_default: false,
      })
      .select("id, provider_type")
      .single();

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    storedProvider = data;
  }

  return new Response(JSON.stringify({ success: true, provider: storedProvider }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
