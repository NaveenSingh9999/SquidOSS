import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SecureFilePayload = {
  name: string;
  type: string;
  size: number;
  storagePath: string;
  encrypted: boolean;
  encryptionKeyLabel: string;
  metadata?: string | null;
  parentFolder?: string | null;
  workspaceId?: string | null;
  storageProviderId?: string | null;
  externalObjectKey?: string | null;
  processor?: string | null;
  encryptionKey?: string | null;
};

let cachedFileColumns: Set<string> | null = null;
let fileColumnsChecked = false;

const getFileColumns = async (supabase: ReturnType<typeof createClient>) => {
  if (fileColumnsChecked) return cachedFileColumns;
  fileColumnsChecked = true;

  const { data: columnsData, error } = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "files");

  if (error || !Array.isArray(columnsData)) {
    return null;
  }

  cachedFileColumns = new Set(columnsData.map((col: any) => col.column_name));
  return cachedFileColumns;
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

  let payload: SecureFilePayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON payload", { status: 400, headers: corsHeaders });
  }

  if (!payload?.name || !payload?.type || !payload?.storagePath || !Number.isFinite(payload?.size)) {
    return new Response(JSON.stringify({ success: false, error: "Invalid file metadata" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const workspaceId = payload.workspaceId || null;
  let resolvedWorkspaceId = workspaceId;

  if (!resolvedWorkspaceId) {
    const { data: defaultWorkspace, error: workspaceError } = await supabase.rpc(
      "get_or_create_default_workspace",
      { p_user_id: user.id }
    );
    if (workspaceError) {
      return new Response(JSON.stringify({ success: false, error: workspaceError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    resolvedWorkspaceId = defaultWorkspace as string;
  } else {
    const { data: hasAccess, error: accessError } = await supabase.rpc("has_workspace_role", {
      p_workspace_id: resolvedWorkspaceId,
      p_user_id: user.id,
      p_min_role: "editor",
    });

    if (accessError || !hasAccess) {
      return new Response(JSON.stringify({ success: false, error: "Insufficient workspace access" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let encryptedKey: string | null = null;
  let encryptedKeyNonce: string | null = null;

  if (payload.encryptionKey) {
    const { data: encryptedData, error: encryptError } = await supabase.rpc(
      "encrypt_keyring_secret",
      {
        p_key_name: "file_encryption_keys",
        p_plaintext: payload.encryptionKey,
      }
    );

    if (encryptError || !Array.isArray(encryptedData) || encryptedData.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Failed to encrypt file key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [encryptedEntry] = encryptedData;
    encryptedKey = encryptedEntry?.ciphertext ?? null;
    encryptedKeyNonce = encryptedEntry?.nonce ?? null;
    if (!encryptedKey || !encryptedKeyNonce) {
      return new Response(JSON.stringify({ success: false, error: "Failed to encrypt file key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const columnSet = await getFileColumns(supabase);
  const hasColumn = (columnName: string) => columnSet?.has(columnName) ?? false;

  const insertPayload: Record<string, unknown> = {
    name: payload.name,
    type: payload.type,
    size: payload.size,
    storage_path: payload.storagePath,
    user_id: user.id,
    encrypted: payload.encrypted,
    shared: false,
    encryption_key: payload.encryptionKeyLabel,
    tags: payload.metadata ? [payload.metadata] : null,
  };

  if (hasColumn("workspace_id")) {
    insertPayload.workspace_id = resolvedWorkspaceId;
  }
  if (hasColumn("parent_folder")) {
    insertPayload.parent_folder = payload.parentFolder ?? null;
  }
  if (hasColumn("storage_provider_id")) {
    insertPayload.storage_provider_id = payload.storageProviderId ?? null;
  }
  if (hasColumn("external_object_key")) {
    insertPayload.external_object_key = payload.externalObjectKey ?? null;
  }
  if (payload.processor && hasColumn("processor")) {
    insertPayload.processor = payload.processor;
  }
  if (encryptedKey && hasColumn("encrypted_key")) {
    insertPayload.encrypted_key = encryptedKey;
  }
  if (encryptedKeyNonce && hasColumn("encrypted_key_nonce")) {
    insertPayload.encrypted_key_nonce = encryptedKeyNonce;
  }

  const { data: fileData, error: insertError } = await supabase
    .from("files")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError || !fileData) {
    return new Response(JSON.stringify({ success: false, error: insertError?.message || "Failed to save file" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, file: fileData }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
