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
    const { source_platform, settings } = await req.json();
    
    if (!source_platform) {
      return new Response(
        JSON.stringify({ error: "Source platform is required" }),
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

    // Create migration job
    const { data: job, error: jobError } = await supabase
      .from('migration_jobs')
      .insert({
        user_id: user.id,
        source_platform,
        status: 'in_progress',
        total_files: settings.files?.length || 0,
        settings
      })
      .select()
      .single();

    if (jobError) {
      throw jobError;
    }

    // Log migration start
    await supabase
      .from('migration_logs')
      .insert({
        migration_job_id: job.id,
        user_id: user.id,
        level: 'info',
        message: `Migration started from ${source_platform}`,
        metadata: { settings }
      });

    // Start background migration process
    EdgeRuntime.waitUntil(processmigration(job, supabase));

    return new Response(
      JSON.stringify({ job }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error starting migration:", error);
    
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function processMigration(job: any, supabase: any) {
  try {
    const { source_platform, settings } = job;

    switch (source_platform) {
      case 'local-upload':
        await processLocalUpload(job, supabase);
        break;
      case 's3':
        await processS3Migration(job, supabase);
        break;
      case 'google-drive':
      case 'dropbox':
      case 'onedrive':
        await processCloudMigration(job, supabase);
        break;
      default:
        throw new Error(`Unsupported platform: ${source_platform}`);
    }

    // Mark as completed
    await supabase
      .from('migration_jobs')
      .update({ 
        status: 'completed', 
        completed_at: new Date().toISOString() 
      })
      .eq('id', job.id);

    await supabase
      .from('migration_logs')
      .insert({
        migration_job_id: job.id,
        user_id: job.user_id,
        level: 'success',
        message: 'Migration completed successfully'
      });

  } catch (error) {
    console.error('Migration processing error:', error);
    
    await supabase
      .from('migration_jobs')
      .update({ 
        status: 'failed',
        error_message: error.message
      })
      .eq('id', job.id);

    await supabase
      .from('migration_logs')
      .insert({
        migration_job_id: job.id,
        user_id: job.user_id,
        level: 'error',
        message: `Migration failed: ${error.message}`
      });
  }
}

async function processLocalUpload(job: any, supabase: any) {
  const { settings } = job;
  let processedFiles = 0;

  for (const fileInfo of settings.files || []) {
    try {
      // In a real implementation, you would:
      // 1. Accept file uploads in the request
      // 2. Process each file (unzip if needed)
      // 3. Encrypt if auto-encrypt is enabled
      // 4. Store in Supabase storage
      // 5. Create file records in database

      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      processedFiles++;

      await supabase
        .from('migration_jobs')
        .update({ processed_files: processedFiles })
        .eq('id', job.id);

      await supabase
        .from('migration_logs')
        .insert({
          migration_job_id: job.id,
          user_id: job.user_id,
          level: 'info',
          message: `Processed file: ${fileInfo.name}`,
          file_name: fileInfo.name
        });

    } catch (error) {
      await supabase
        .from('migration_logs')
        .insert({
          migration_job_id: job.id,
          user_id: job.user_id,
          level: 'error',
          message: `Failed to process file: ${fileInfo.name} - ${error.message}`,
          file_name: fileInfo.name
        });

      await supabase
        .from('migration_jobs')
        .update({ 
          failed_files: job.failed_files + 1 
        })
        .eq('id', job.id);
    }
  }
}

async function processS3Migration(job: any, supabase: any) {
  const { settings } = job;
  const { region, accessKey, secretKey, bucketName } = settings;

  // In a real implementation, you would:
  // 1. Initialize AWS S3 client with credentials
  // 2. List objects in bucket
  // 3. Download each object
  // 4. Encrypt if needed
  // 5. Upload to Supabase storage
  // 6. Create file records

  // Simulate S3 processing
  const simulatedFiles = ['file1.txt', 'file2.jpg', 'folder/file3.pdf'];
  let processedFiles = 0;

  await supabase
    .from('migration_jobs')
    .update({ total_files: simulatedFiles.length })
    .eq('id', job.id);

  for (const fileName of simulatedFiles) {
    try {
      // Simulate S3 download and processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      processedFiles++;

      await supabase
        .from('migration_jobs')
        .update({ processed_files: processedFiles })
        .eq('id', job.id);

      await supabase
        .from('migration_logs')
        .insert({
          migration_job_id: job.id,
          user_id: job.user_id,
          level: 'info',
          message: `Migrated from S3: ${fileName}`,
          file_name: fileName
        });

    } catch (error) {
      await supabase
        .from('migration_logs')
        .insert({
          migration_job_id: job.id,
          user_id: job.user_id,
          level: 'error',
          message: `Failed to migrate S3 file: ${fileName} - ${error.message}`,
          file_name: fileName
        });
    }
  }
}

async function processCloudMigration(job: any, supabase: any) {
  // In a real implementation, you would:
  // 1. Use OAuth tokens to access cloud storage APIs
  // 2. List files and folders
  // 3. Download each file
  // 4. Process according to settings
  // 5. Upload to SquidCloud

  // Simulate cloud migration
  const simulatedFiles = ['Document.docx', 'Photo.jpg', 'Presentation.pptx'];
  let processedFiles = 0;

  await supabase
    .from('migration_jobs')
    .update({ total_files: simulatedFiles.length })
    .eq('id', job.id);

  for (const fileName of simulatedFiles) {
    try {
      // Simulate cloud download and processing
      await new Promise(resolve => setTimeout(resolve, 1500));
      processedFiles++;

      await supabase
        .from('migration_jobs')
        .update({ processed_files: processedFiles })
        .eq('id', job.id);

      await supabase
        .from('migration_logs')
        .insert({
          migration_job_id: job.id,
          user_id: job.user_id,
          level: 'info',
          message: `Migrated from ${job.source_platform}: ${fileName}`,
          file_name: fileName
        });

    } catch (error) {
      await supabase
        .from('migration_logs')
        .insert({
          migration_job_id: job.id,
          user_id: job.user_id,
          level: 'error',
          message: `Failed to migrate file: ${fileName} - ${error.message}`,
          file_name: fileName
        });
    }
  }
}