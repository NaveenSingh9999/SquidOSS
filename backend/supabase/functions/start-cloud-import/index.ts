
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
    const { jobId, selectedFiles, platform } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Invalid auth token');
    }

    // Update migration job with selected files
    await supabase
      .from('migration_jobs')
      .update({
        status: 'in_progress',
        total_files: selectedFiles.length,
        processed_files: 0,
        failed_files: 0,
        settings: {
          selectedFiles,
          platform
        }
      })
      .eq('id', jobId);

    // Start background import process
    EdgeRuntime.waitUntil(processCloudImport(jobId, selectedFiles, platform, user.id, supabase));

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error starting cloud import:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function processCloudImport(jobId: string, selectedFiles: any[], platform: string, userId: string, supabase: any) {
  try {
    let processedCount = 0;
    let failedCount = 0;

    // Get job with OAuth tokens
    const { data: job } = await supabase
      .from('migration_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    const tokens = job.settings?.oauth_tokens;

    for (const file of selectedFiles) {
      try {
        if (file.type === 'folder') {
          await processFolder(file, tokens, platform, userId, supabase, jobId);
        } else {
          await processFile(file, tokens, platform, userId, supabase, jobId);
        }
        
        processedCount++;
        
        // Update progress
        await supabase
          .from('migration_jobs')
          .update({ processed_files: processedCount })
          .eq('id', jobId);

        await supabase
          .from('migration_logs')
          .insert({
            migration_job_id: jobId,
            user_id: userId,
            level: 'info',
            message: `Imported: ${file.name}`,
            file_name: file.name
          });

      } catch (error) {
        failedCount++;
        console.error(`Failed to import ${file.name}:`, error);
        
        await supabase
          .from('migration_logs')
          .insert({
            migration_job_id: jobId,
            user_id: userId,
            level: 'error',
            message: `Failed to import: ${file.name} - ${error.message}`,
            file_name: file.name
          });
      }
    }

    // Mark as completed
    await supabase
      .from('migration_jobs')
      .update({ 
        status: 'completed',
        processed_files: processedCount,
        failed_files: failedCount,
        completed_at: new Date().toISOString() 
      })
      .eq('id', jobId);

  } catch (error) {
    console.error('Import processing error:', error);
    
    await supabase
      .from('migration_jobs')
      .update({ 
        status: 'failed',
        error_message: error.message
      })
      .eq('id', jobId);
  }
}

async function processFile(file: any, tokens: any, platform: string, userId: string, supabase: any, jobId: string) {
  let fileData;
  let fileName = file.name;
  
  // Download file from cloud service
  switch (platform) {
    case 'google-drive':
      fileData = await downloadGoogleDriveFile(file.id, tokens);
      break;
    case 'dropbox':
      fileData = await downloadDropboxFile(file.path || file.id, tokens);
      break;
    case 'onedrive':
      fileData = await downloadOneDriveFile(file.downloadUrl || file.id, tokens);
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  // Upload to Supabase storage
  const filePath = `${userId}/imported/${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from('files')
    .upload(filePath, fileData, {
      contentType: file.mimeType || 'application/octet-stream',
      upsert: true
    });

  if (uploadError) {
    throw uploadError;
  }

  // Create file record in database
  await supabase
    .from('files')
    .insert({
      user_id: userId,
      name: fileName,
      storage_path: filePath,
      size: fileData.size || file.size,
      type: file.mimeType || 'application/octet-stream',
      parent_folder: 'imported'
    });
}

async function processFolder(folder: any, tokens: any, platform: string, userId: string, supabase: any, jobId: string) {
  // Create folder record
  await supabase
    .from('folders')
    .insert({
      user_id: userId,
      name: folder.name,
      path: `imported/${folder.name}`,
      parent_folder: 'imported'
    });

  // Note: In a full implementation, you would recursively process folder contents
  console.log(`Created folder: ${folder.name}`);
}

async function downloadGoogleDriveFile(fileId: string, tokens: any) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download from Google Drive: ${response.statusText}`);
  }

  return await response.arrayBuffer();
}

async function downloadDropboxFile(filePath: string, tokens: any) {
  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Dropbox-API-Arg': JSON.stringify({ path: filePath })
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download from Dropbox: ${response.statusText}`);
  }

  return await response.arrayBuffer();
}

async function downloadOneDriveFile(downloadUrl: string, tokens: any) {
  const response = await fetch(downloadUrl, {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download from OneDrive: ${response.statusText}`);
  }

  return await response.arrayBuffer();
}
