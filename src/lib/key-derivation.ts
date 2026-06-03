/**
 * Secure Key Derivation and Management
 * Implements PBKDF2 for password-based key derivation
 * Provides key wrapping/unwrapping for zero-knowledge encryption
 */

// Constants for PBKDF2
const PBKDF2_ITERATIONS = 100000; // 100k iterations (NIST recommendation)
const KEY_LENGTH = 256; // 256 bits
const SALT_LENGTH = 32; // 32 bytes = 256 bits

/**
 * Generate a cryptographically secure random salt
 */
export const generateSalt = (): Uint8Array => {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
};

/**
 * Convert Uint8Array to base64 string
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }
  
  return btoa(chunks.join(''));
};

/**
 * Convert base64 string to Uint8Array
 */
export const base64ToArrayBuffer = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Derive a cryptographic key from a password using PBKDF2
 * @param password - User's password
 * @param salt - Random salt (will be generated if not provided)
 * @param iterations - Number of PBKDF2 iterations (default: 100,000)
 * @returns Object containing the derived key and salt
 */
export const deriveKeyFromPassword = async (
  password: string,
  salt?: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<{ key: CryptoKey; salt: Uint8Array; saltBase64: string }> => {
  try {
    // Generate salt if not provided
    const actualSalt = salt || generateSalt();
    
    // Import password as key material
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    // Derive key using PBKDF2
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: actualSalt.buffer as ArrayBuffer,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: KEY_LENGTH },
      true, // extractable (for wrapping other keys)
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
    
    return {
      key: derivedKey,
      salt: actualSalt,
      saltBase64: arrayBufferToBase64(actualSalt)
    };
  } catch (error: any) {
    console.error('Key derivation error:', error);
    throw new Error(`Failed to derive key from password: ${error.message}`);
  }
};

/**
 * Generate a master encryption key
 */
export const generateMasterKey = async (): Promise<CryptoKey> => {
  return await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: KEY_LENGTH
    },
    true, // extractable
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
};

/**
 * Wrap (encrypt) a key with another key
 * @param keyToWrap - The key to protect
 * @param wrappingKey - The key used for protection
 * @returns Object containing wrapped key and IV
 */
export const wrapKey = async (
  keyToWrap: CryptoKey,
  wrappingKey: CryptoKey
): Promise<{ wrappedKey: string; iv: string }> => {
  try {
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Wrap the key
    const wrappedKeyBuffer = await crypto.subtle.wrapKey(
      'raw',
      keyToWrap,
      wrappingKey,
      {
        name: 'AES-GCM',
        iv
      }
    );
    
    return {
      wrappedKey: arrayBufferToBase64(wrappedKeyBuffer),
      iv: arrayBufferToBase64(iv)
    };
  } catch (error: any) {
    console.error('Key wrapping error:', error);
    throw new Error(`Failed to wrap key: ${error.message}`);
  }
};

/**
 * Unwrap (decrypt) a previously wrapped key
 * @param wrappedKeyBase64 - The wrapped key (base64)
 * @param ivBase64 - The IV used during wrapping (base64)
 * @param unwrappingKey - The key used to unwrap
 * @returns The unwrapped CryptoKey
 */
export const unwrapKey = async (
  wrappedKeyBase64: string,
  ivBase64: string,
  unwrappingKey: CryptoKey
): Promise<CryptoKey> => {
  try {
    const wrappedKeyBuffer = base64ToArrayBuffer(wrappedKeyBase64);
    const iv = base64ToArrayBuffer(ivBase64);
    
    // Unwrap the key
    const unwrappedKey = await crypto.subtle.unwrapKey(
      'raw',
      wrappedKeyBuffer.buffer as ArrayBuffer,
      unwrappingKey,
      {
        name: 'AES-GCM',
        iv: iv.buffer as ArrayBuffer
      },
      {
        name: 'AES-GCM',
        length: KEY_LENGTH
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
    
    return unwrappedKey;
  } catch (error: any) {
    console.error('Key unwrapping error:', error);
    throw new Error(`Failed to unwrap key: ${error.message}`);
  }
};

/**
 * Export a CryptoKey to base64 string
 */
export const exportKey = async (key: CryptoKey): Promise<string> => {
  const exported = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(exported);
};

/**
 * Import a key from base64 string
 */
export const importKey = async (keyBase64: string): Promise<CryptoKey> => {
  const keyBuffer = base64ToArrayBuffer(keyBase64);
  
  return await crypto.subtle.importKey(
    'raw',
    keyBuffer.buffer as ArrayBuffer,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH
    },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
};

/**
 * Encrypt a string with a CryptoKey
 */
export const encryptString = async (
  data: string,
  key: CryptoKey
): Promise<{ encrypted: string; iv: string }> => {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer as ArrayBuffer
      },
      key,
      dataBuffer.buffer as ArrayBuffer
    );
    
    return {
      encrypted: arrayBufferToBase64(encrypted),
      iv: arrayBufferToBase64(iv)
    };
  } catch (error: any) {
    console.error('String encryption error:', error);
    throw new Error(`Failed to encrypt string: ${error.message}`);
  }
};

/**
 * Decrypt a string with a CryptoKey
 */
export const decryptString = async (
  encryptedBase64: string,
  ivBase64: string,
  key: CryptoKey
): Promise<string> => {
  try {
    const encrypted = base64ToArrayBuffer(encryptedBase64);
    const iv = base64ToArrayBuffer(ivBase64);
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer as ArrayBuffer
      },
      key,
      encrypted.buffer as ArrayBuffer
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error: any) {
    console.error('String decryption error:', error);
    throw new Error(`Failed to decrypt string: ${error.message}`);
  }
};

/**
 * Hash a password using SHA-256 with salt
 * Used for API key hashing
 */
export const hashWithSalt = async (
  data: string,
  salt: Uint8Array
): Promise<string> => {
  try {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    
    // Combine salt and data
    const combined = new Uint8Array(salt.length + dataBytes.length);
    combined.set(salt);
    combined.set(dataBytes, salt.length);
    
    // Hash using SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined.buffer as ArrayBuffer);
    return arrayBufferToBase64(hashBuffer);
  } catch (error: any) {
    console.error('Hashing error:', error);
    throw new Error(`Failed to hash with salt: ${error.message}`);
  }
};

/**
 * Verify a hash
 */
export const verifyHash = async (
  data: string,
  salt: Uint8Array,
  hash: string
): Promise<boolean> => {
  try {
    const computed = await hashWithSalt(data, salt);
    return computed === hash;
  } catch (error) {
    console.error('Hash verification error:', error);
    return false;
  }
};
