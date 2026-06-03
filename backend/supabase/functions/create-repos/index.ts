
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration not complete' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isInternalServiceCall = token === SUPABASE_SERVICE_ROLE_KEY;
    let requesterUserId: string | null = null;
    if (!isInternalServiceCall) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      requesterUserId = user.id;
    }

    const { count, userId: requestedUserId } = await req.json();
    const userId = requestedUserId || requesterUserId;

    if (!isInternalServiceCall && requestedUserId && requestedUserId !== requesterUserId) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: cannot create repositories for another user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');
    const GITHUB_USERNAME = Deno.env.get('GITHUB_USERNAME');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    
    if (!GITHUB_TOKEN || !GITHUB_USERNAME) {
      return new Response(
        JSON.stringify({ error: 'Configuration not complete' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate and normalize count
    const repoCount = count ? parseInt(String(count), 10) : 5;
    const validCount = isNaN(repoCount) ? 5 : Math.min(Math.max(1, repoCount), 5);
    
    const createdRepos = [];
    
    // Generate creative names using Gemini API
    const repoNames = await generateCreativeRepoNames(validCount, GEMINI_API_KEY);
    
    // Create each repository
    for (let i = 0; i < validCount; i++) {
      // Use the generated name, or fall back to a standard pattern
      const baseName = repoNames[i] || `nexus_${Math.random().toString(36).substring(2, 7)}`;
      // Add a unique identifier to ensure uniqueness
      const uniqueSuffix = `${Date.now().toString(36)}_${i}`;
      const repoName = `${baseName}_${uniqueSuffix}`;
      
      // Check if repository already exists
      const existsResponse = await fetch(
        `https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}`,
        {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CloudVault-Edge-Function'
          }
        }
      );
      
      // If repo doesn't exist, create it
      if (existsResponse.status === 404) {
        // Generate a creative description
        const descriptions = await generateCreativeDescriptions(1, GEMINI_API_KEY);
        const description = descriptions[0] || "Secure data vault";
        
        const createResponse = await fetch(
          'https://api.github.com/user/repos',
          {
            method: 'POST',
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'CloudVault-Edge-Function',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: repoName,
              description: description,
              private: true,
              auto_init: true
            })
          }
        );
        
        if (!createResponse.ok) {
          console.error(`Failed to create repo ${repoName}:`, await createResponse.text());
          continue;
        }
        
        const repoData = await createResponse.json();
        
        // Store repository information in database
        try {
          const dbResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/rest/v1/repositories`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                user_id: userId,
                repo_name: repoName
              })
            }
          );
          
          if (!dbResponse.ok) {
            console.error(`Failed to store repo record for ${repoName}:`, await dbResponse.text());
          }
        } catch (dbError) {
          console.error(`Database error for ${repoName}:`, dbError);
        }
        
        createdRepos.push({
          name: repoName,
          html_url: repoData.html_url,
          description: description
        });
        
        console.log(`Created repository: ${repoName}`);
      } else if (existsResponse.ok) {
        // Repo already exists
        const repoData = await existsResponse.json();
        createdRepos.push({
          name: repoName,
          html_url: repoData.html_url,
          description: repoData.description
        });
        
        console.log(`Repository already exists: ${repoName}`);
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Created ${createdRepos.length} vaults`,
        repositories: createdRepos
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in create-repos function:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred while creating vaults' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to generate creative repository names using Gemini API
async function generateCreativeRepoNames(count: number, apiKey?: string): Promise<string[]> {
  if (!apiKey) {
    console.log("No Gemini API key provided, using fallback names");
    return generateFallbackNames(count);
  }
  
  try {
    const prompt = `Generate ${count} unique, creative names for private secure data repositories. 
    Each name should be a single word or two words connected by underscore, like "cosmic_nexus" or "phantom_matrix". 
    The names should be unique, memorable, and should NOT contain words like "storage", "repo", "github", "vault", "file", "data", or anything that suggests file storage. 
    Return only the names as a comma-separated list with no additional text.`;
    
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 100
        }
      })
    });
    
    const data = await response.json();
    
    // Parse the response to extract the names
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const text = data.candidates[0].content.parts[0].text;
      // Split by commas and clean up each name
      let names = text.split(',')
        .map(name => name.trim().toLowerCase())
        .filter(name => name.length > 0)
        // Replace spaces with underscores and remove any characters that aren't alphanumeric or underscore
        .map(name => name.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
      
      // Ensure we have the requested number of names and none contain the word "storage"
      names = names.filter(name => !name.includes('storage'));
      
      // Fill in if we don't have enough names
      while (names.length < count) {
        names.push(...generateFallbackNames(count - names.length));
      }
      
      // Return just the number of names requested
      return names.slice(0, count);
    }
    
    throw new Error("Failed to generate names with Gemini API");
  } catch (error) {
    console.error("Error generating names with Gemini:", error);
    // Fallback to basic names
    return generateFallbackNames(count);
  }
}

// Generate fallback repository names without using "storage" word
function generateFallbackNames(count: number): string[] {
  const adjectives = ["mystic", "arcane", "enigmatic", "cryptic", "phantom", "celestial", "quantum", "cosmic", "ethereal", "astral"];
  const nouns = ["nexus", "cipher", "sanctum", "citadel", "sentinel", "bastion", "matrix", "aegis", "paradox", "vortex"];
  
  return Array(count).fill("").map(() => {
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${randomAdj}_${randomNoun}`;
  });
}

// Generate creative descriptions for repositories
async function generateCreativeDescriptions(count: number, apiKey?: string): Promise<string[]> {
  if (!apiKey) {
    return ["Secure digital nexus for encrypted assets"];
  }
  
  try {
    const prompt = `Generate ${count} unique, creative descriptions for private secure data repositories.
    Each description should be a short phrase (under 50 characters) that sounds secure and professional,
    but does NOT directly mention storage, files, data, or anything that obviously suggests file storage.
    Return only the descriptions as a comma-separated list with no additional text.`;
    
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 100
        }
      })
    });
    
    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const text = data.candidates[0].content.parts[0].text;
      let descriptions = text.split(',')
        .map(desc => desc.trim())
        .filter(desc => desc.length > 0 && desc.length < 50);
      
      while (descriptions.length < count) {
        descriptions.push("Secure digital nexus for encrypted assets");
      }
      
      return descriptions.slice(0, count);
    }
    
    return ["Secure digital nexus for encrypted assets"];
  } catch (error) {
    console.error("Error generating descriptions with Gemini:", error);
    return ["Secure digital nexus for encrypted assets"];
  }
}
