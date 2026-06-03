import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
    const { messages, context } = await req.json()
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured')
    }

    // Build system prompt with context
    let systemPrompt = `You are Squid AI, an intelligent, cute assistant for SquidCloud storage system. You help users organize files, create content, and manage their cloud storage.

Available Actions:
- CREATE_FOLDER: Create new folders
- MOVE_FILES: Move files to folders
- ORGANIZE_FILES: Automatically organize files by type
- GENERATE_CONTENT: Generate file content (README, documentation, etc.)
- ANALYZE_FILE: Analyze file content and provide insights

When user asks you to perform actions, respond in JSON format with:
{
  "action": "ACTION_NAME",
  "parameters": { ... },
  "message": "Human-readable response"
}

For general questions, just respond normally in a friendly and helpful way.`

    if (context) {
      systemPrompt += `\n\nCurrent Context:
- File: ${context.fileName || 'N/A'}
- Type: ${context.fileType || 'N/A'}
- Path: ${context.filePath || 'N/A'}`
      
      if (context.fileContent) {
        systemPrompt += `\n- Content Preview: ${context.fileContent.substring(0, 500)}...`
      }
    }

    // Prepare messages array with system prompt
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ]

    console.log('Calling Lovable AI with messages:', fullMessages.length)

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: fullMessages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Lovable AI error:', response.status, errorText)
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your Lovable workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      throw new Error(`Lovable AI error: ${response.statusText}`)
    }

    const data = await response.json()
    const assistantMessage = data.choices[0].message.content

    console.log('Received response from Lovable AI')

    // Try to parse action from response
    let action = null
    try {
      const jsonMatch = assistantMessage.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        action = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.log('No action found in response')
    }

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        action: action
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in squid-ai-chat function:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Sorry, I encountered an error. Please try again.'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})