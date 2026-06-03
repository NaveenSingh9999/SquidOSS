import { S3Client, HeadBucketCommand, ListBucketsCommand } from "npm:@aws-sdk/client-s3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

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

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { accountId, accessKeyId, secretAccessKey, bucketName, providerType } = await req.json();

    // Validate required fields
    if (!accessKeyId || !secretAccessKey || !bucketName) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Set endpoint based on provider type
    let endpoint = undefined;
    if (providerType === 'r2') {
      if (!accountId) {
        return new Response(
          JSON.stringify({ success: false, error: "Account ID is required for R2" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    } else if (providerType === 'tebi') {
      endpoint = `https://s3.tebi.io`;
    }

    // Create S3 client with provided credentials
    const s3Client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Try HeadBucket first (most efficient)
    try {
      await s3Client.send(
        new HeadBucketCommand({ Bucket: bucketName })
      );

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (headError) {
      console.error("HeadBucket error:", headError.message);

      // Fallback to ListBuckets
      try {
        const listResult = await s3Client.send(new ListBucketsCommand({}));
        const bucketExists = listResult.Buckets?.some((b) => b.Name === bucketName);

        if (bucketExists) {
          return new Response(
            JSON.stringify({ success: true }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        } else {
          return new Response(
            JSON.stringify({ success: false, error: `Bucket ${bucketName} not found` }),
            {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      } catch (listError) {
        console.error("ListBuckets error:", listError.message);
        return new Response(
          JSON.stringify({ success: false, error: "Invalid credentials or bucket does not exist" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});