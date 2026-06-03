
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { action, ...params } = await req.json()

    let result

    switch (action) {
      case 'get_user_stats':
        result = await getUserStats(supabase, user.id)
        break
      case 'get_file_analytics':
        result = await getFileAnalytics(supabase, user.id)
        break
      case 'create_api_key':
        result = await createAPIKey(supabase, user.id, params)
        break
      case 'list_api_keys':
        result = await listAPIKeys(supabase, user.id)
        break
      case 'revoke_api_key':
        result = await revokeAPIKey(supabase, user.id, params.keyId)
        break
      case 'get_activity_logs':
        result = await getActivityLogs(supabase, user.id)
        break
      case 'backup_files':
        result = await initiateBackup(supabase, user.id)
        break
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('CLI operations error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function getUserStats(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  const { data: files, count: fileCount } = await supabase
    .from('files')
    .select('size', { count: 'exact' })
    .eq('user_id', userId)

  const totalSize = files?.reduce((sum: number, file: any) => sum + file.size, 0) || 0

  return {
    profile,
    fileCount,
    totalSize,
    storageUsed: profile?.storage_used || 0
  }
}

async function getFileAnalytics(supabase: any, userId: string) {
  const { data: files } = await supabase
    .from('files')
    .select('name, size, type, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10)

  const { data: typeStats } = await supabase
    .from('files')
    .select('type')
    .eq('user_id', userId)

  const typeCount = typeStats?.reduce((acc: any, file: any) => {
    acc[file.type] = (acc[file.type] || 0) + 1
    return acc
  }, {}) || {}

  return {
    recentFiles: files,
    typeDistribution: typeCount
  }
}

async function createAPIKey(supabase: any, userId: string, params: any) {
  const { name, scopes } = params

  // Generate API key
  const { data: apiKey } = await supabase.rpc('generate_api_key')
  
  // Hash the key for storage
  const encoder = new TextEncoder()
  const data = encoder.encode(apiKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  const { data: newKey, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: userId,
      name: name || 'CLI Generated Key',
      key_hash: keyHash,
      key_prefix: apiKey.substring(0, 8),
      scopes: scopes || ['read', 'write', 'delete']
    })
    .select()
    .single()

  if (error) throw error

  return { ...newKey, key: apiKey }
}

async function listAPIKeys(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, scopes, created_at, last_used_at, is_active')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

async function revokeAPIKey(supabase: any, userId: string, keyId: string) {
  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', keyId)
    .eq('user_id', userId)

  if (error) throw error
  return { success: true }
}

async function getActivityLogs(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('api_request_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return data
}

async function initiateBackup(supabase: any, userId: string) {
  // This would trigger a backup process
  // For now, return a placeholder
  return {
    message: 'Backup process initiated',
    status: 'pending'
  }
}
