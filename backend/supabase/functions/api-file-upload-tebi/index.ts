import { S3Client, PutObjectCommand, GetObjectCommand, PutBucketCorsCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

const MAX_PROXY_UPLOAD_BYTES = 20 * 1024 * 1024;

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function tryConfigureBucketCors(s3Client: S3Client, bucketName: string): Promise<boolean> {
  try {
    await s3Client.send(new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ["*"],
            AllowedMethods: ["GET", "PUT", "POST", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag", "x-amz-request-id", "x-amz-id-2"],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    }));
    return true;
  } catch (error) {
    console.warn("Bucket CORS update skipped:", error?.message ?? error);
    return false;
  }
}

Deno.serve(async (req) => {
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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, fileName, fileType, path, fileBase64, providerId } = await req.json();
    if (!providerId) {
      return new Response(
        JSON.stringify({ success: false, error: "Provider ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: providerRow, error: providerError } = await supabase
      .from("storage_providers")
      .select("encrypted_credentials")
      .eq("id", providerId)
      .eq("user_id", user.id)
      .single();

    if (providerError || !providerRow) {
      return new Response(
        JSON.stringify({ success: false, error: "Provider credentials not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let decryptedCredentials;
    try {
      const parsed = JSON.parse(providerRow.encrypted_credentials);
      const { ciphertext, nonce } = parsed || {};
      if (!ciphertext || !nonce) throw new Error("Invalid encrypted payload");

      const { data: decrypted, error: decryptError } = await supabase.rpc("decrypt_keyring_secret", {
        p_key_name: "storage_provider_credentials",
        p_ciphertext: ciphertext,
        p_nonce: nonce,
      });

      if (decryptError || !decrypted) throw new Error("Decrypt failed");
      decryptedCredentials = JSON.parse(decrypted as string);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Provider credentials are invalid. Please reconfigure provider." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { accessKeyId, secretAccessKey, bucketName } = decryptedCredentials || {};

    if (!accessKeyId || !secretAccessKey || !bucketName) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing provider credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const objectKey = path || fileName;

    if (!objectKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing object path or file name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const s3Client = new S3Client({
      region: "auto",
      endpoint: "https://s3.tebi.io",
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    if (action === "upload") {
      const corsConfigured = await tryConfigureBucketCors(s3Client, bucketName);

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ContentType: fileType || "application/octet-stream",
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      return new Response(
        JSON.stringify({ success: true, uploadUrl, objectKey, corsConfigured }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "upload-proxy") {
      if (!fileBase64) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing file payload" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fileBytes = decodeBase64ToUint8Array(fileBase64);
      if (fileBytes.byteLength > MAX_PROXY_UPLOAD_BYTES) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Proxy upload size limit exceeded (${MAX_PROXY_UPLOAD_BYTES} bytes max)`,
            code: "PAYLOAD_TOO_LARGE",
          }),
          { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: fileBytes,
        ContentType: fileType || "application/octet-stream",
      }));

      return new Response(
        JSON.stringify({ success: true, proxied: true, objectKey }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "download") {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });

      const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      return new Response(
        JSON.stringify({ success: true, downloadUrl, objectKey }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
