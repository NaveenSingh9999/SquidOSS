// Secure PDF Serving with Real AES-256-GCM Encryption
// Replaces insecure XOR cipher with production-grade encryption

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Utility functions
const base64ToArrayBuffer = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }
  
  return btoa(chunks.join(''));
};

/**
 * Decrypt data using AES-256-GCM (REAL ENCRYPTION)
 * @param encryptedData - The encrypted data as base64 string
 * @param key - The decryption key (32 bytes)
 * @returns Decrypted data as ArrayBuffer
 */
async function decryptAES256GCM(encryptedData: string, key: string): Promise<ArrayBuffer> {
  try {
    // Decode base64 encrypted data
    const binaryData = base64ToArrayBuffer(encryptedData);
    
    // Parse the encrypted data format: [IV_LENGTH(4)] + [IV] + [ENCRYPTED_DATA]
    const dataView = new DataView(binaryData.buffer);
    
    // Check for multi-chunk format or standard format
    const possibleIvLength = dataView.getUint32(0, true);
    
    let iv: Uint8Array;
    let encryptedContent: Uint8Array;
    let additionalData: Uint8Array | undefined;
    
    // Try to parse as standard format with additionalData
    const additionalDataLength = dataView.getUint32(0, true);
    
    if (additionalDataLength > 0 && additionalDataLength < 1000) {
      // Standard format: [ADDITIONAL_DATA_LENGTH(4)] + [ADDITIONAL_DATA] + [IV(12)] + [ENCRYPTED]
      additionalData = binaryData.slice(4, 4 + additionalDataLength);
      iv = binaryData.slice(4 + additionalDataLength, 4 + additionalDataLength + 12);
      encryptedContent = binaryData.slice(4 + additionalDataLength + 12);
    } else {
      // Fallback: Simple format [IV(12)] + [ENCRYPTED]
      iv = binaryData.slice(0, 12);
      encryptedContent = binaryData.slice(12);
    }
    
    // Prepare the key (ensure it's 32 bytes)
    const keyBytes = new TextEncoder().encode(key.slice(0, 32).padEnd(32, '0'));
    
    // Import the key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        ...(additionalData ? { additionalData } : {})
      },
      cryptoKey,
      encryptedContent
    );
    
    return decrypted;
  } catch (error) {
    console.error('AES-256-GCM decryption error:', error);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Encrypt data using AES-256-GCM (REAL ENCRYPTION)
 * @param data - The data to encrypt as Uint8Array
 * @param key - The encryption key (32 bytes)
 * @returns Encrypted data as base64 string
 */
async function encryptAES256GCM(data: Uint8Array, key: string): Promise<string> {
  try {
    // Generate random IV (12 bytes for GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Generate additional data for AEAD
    const additionalData = new TextEncoder().encode(`secure-pdf-${Date.now()}`);
    
    // Prepare the key (ensure it's 32 bytes)
    const keyBytes = new TextEncoder().encode(key.slice(0, 32).padEnd(32, '0'));
    
    // Import the key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData
      },
      cryptoKey,
      data
    );
    
    // Combine: [ADDITIONAL_DATA_LENGTH(4)] + [ADDITIONAL_DATA] + [IV(12)] + [ENCRYPTED]
    const result = new Uint8Array(4 + additionalData.length + iv.length + encrypted.byteLength);
    
    // Write additionalData length
    const lengthView = new DataView(result.buffer);
    lengthView.setUint32(0, additionalData.length, true);
    
    // Copy components
    result.set(additionalData, 4);
    result.set(iv, 4 + additionalData.length);
    result.set(new Uint8Array(encrypted), 4 + additionalData.length + iv.length);
    
    return arrayBufferToBase64(result.buffer);
  } catch (error) {
    console.error('AES-256-GCM encryption error:', error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
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

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Invalid authentication');
    }
    
    const { action, encrypted_data, key, data } = await req.json();
    
    // Decrypt action
    if (action === 'decrypt') {
      if (!encrypted_data || !key) {
        throw new Error('Missing encrypted_data or key');
      }
      
      const decrypted = await decryptAES256GCM(encrypted_data, key);
      const decryptedBase64 = arrayBufferToBase64(decrypted);
      
      return new Response(
        JSON.stringify({ 
          success: true,
          decrypted: decryptedBase64
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Encrypt action
    if (action === 'encrypt') {
      if (!data || !key) {
        throw new Error('Missing data or key');
      }
      
      const dataBytes = base64ToArrayBuffer(data);
      const encrypted = await encryptAES256GCM(dataBytes, key);
      
      return new Response(
        JSON.stringify({ 
          success: true,
          encrypted
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    throw new Error('Invalid action. Use "encrypt" or "decrypt"');
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
