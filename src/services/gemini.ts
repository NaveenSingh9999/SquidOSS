
import { supabase } from '@/integrations/supabase/client';

export interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
    finishReason: string;
    safetyRatings: {
      category: string;
      probability: string;
    }[];
  }[];
}

export interface GeminiOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}

export async function generateWithGemini(
  prompt: string, 
  model: string = 'gemini-1.5-flash',
  options: GeminiOptions = {}
): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke('gemini-api', {
      body: {
        prompt,
        model,
        options
      }
    });

    if (error) throw error;
    
    // Extract text from the response
    const response = data as GeminiResponse;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return text;
  } catch (error) {
    console.error('Error generating with Gemini:', error);
    throw error;
  }
}
