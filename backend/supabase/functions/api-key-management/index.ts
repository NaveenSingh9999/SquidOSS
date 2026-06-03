
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
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
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Invalid authentication')
    }

    const { action, name, scopes } = await req.json()

    if (action === 'generate') {
      // Check if user already has 10 keys
      const { data: existingKeys, error: countError } = await supabase
        .from('api_keys')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (countError) throw countError

      if (existingKeys && existingKeys.length >= 10) {
        return new Response(
          JSON.stringify({ error: 'Maximum of 10 API keys allowed' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // Generate API key using PostgreSQL function or fallback to client-side generation
      let apiKey: string
      
      try {
        const { data: keyResult, error: keyError } = await supabase.rpc('generate_api_key')
        if (keyError) throw keyError
        apiKey = keyResult as string
      } catch (error) {
        // Fallback: Generate API key client-side if PostgreSQL function fails
        console.log('PostgreSQL function failed, using client-side generation:', error)
        const randomBytes = new Uint8Array(32)
        crypto.getRandomValues(randomBytes)
        const hexString = Array.from(randomBytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
        apiKey = `cb_${hexString}`
      }
      
      const keyPrefix = apiKey.substring(0, 8)
      
      // Generate a cryptographically secure salt
      const salt = new Uint8Array(32)
      crypto.getRandomValues(salt)
      const saltBase64 = btoa(String.fromCharCode.apply(null, Array.from(salt)))
      
      // Hash the API key with salt using Web Crypto API
      const encoder = new TextEncoder()
      const apiKeyBytes = encoder.encode(apiKey)
      
      // Combine salt + API key for salted hash
      const combined = new Uint8Array(salt.length + apiKeyBytes.length)
      combined.set(salt)
      combined.set(apiKeyBytes, salt.length)
      
      const hashBuffer = await crypto.subtle.digest('SHA-256', combined)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      // Store the API key with salt
      const { data: keyData, error: insertError } = await supabase
        .from('api_keys')
        .insert({
          user_id: user.id,
          name,
          key_hash: keyHash,
          key_salt: saltBase64,
          key_prefix: keyPrefix,
          scopes: scopes || ['read', 'write', 'delete']
        })
        .select()
        .single()

      if (insertError) throw insertError

      console.log(`Generated API key for user ${user.id}: ${keyPrefix}...`)

      return new Response(
        JSON.stringify({ 
          apiKey,
          keyData: keyData
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
