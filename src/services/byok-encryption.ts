/**
 * BYOK (Bring Your Own Key) Encryption Service
 * Implements AES-256-GCM with PBKDF2 WebCrypto key derivation
 * Zero-knowledge architecture - server never sees raw keys
 */

// Constants
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for AES-GCM
const SALT_LENGTH = 32; // 256 bits
const KEY_VERIFICATION_TAG = 'SQUID_BYOK_V1';

export interface EncryptionMetadata {
  algorithm: 'AES-256-GCM';
  iv: string; // Base64
  salt: string; // Base64
  keyVerificationHash: string; // For verifying correct key
  encryptionMode: 'account' | 'per-file';
  version: number;
  createdAt: string;
}

export interface EncryptedPayload {
  data: string; // Base64 encrypted data
  metadata: EncryptionMetadata;
}

export interface KeyDerivationResult {
  key: CryptoKey;
  keyHash: string; // For verification (not the key itself)
  salt: Uint8Array;
}

/**
 * Derive encryption key from password using PBKDF2 WebCrypto
 * Replaces Argon2 browser implementation to fix WASM bundler errors in APK
 */
export async function deriveKeyWithArgon2id(
  password: string,
  salt?: Uint8Array
): Promise<KeyDerivationResult> {
  const actualSalt = salt || crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  
  try {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const derivedBuffer = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: actualSalt,
        iterations: 600000,
        hash: "SHA-256"
      },
      keyMaterial,
      KEY_LENGTH * 8 // 256 bits
    );
    const hashBytes = new Uint8Array(derivedBuffer);

    // Import the derived key for Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      hashBytes,
      { name: 'AES-GCM', length: 256 },
      false, // Not extractable - security measure
      ['encrypt', 'decrypt']
    );

    // Create verification hash (hash of hash with tag - not the key)
    const verificationData = new TextEncoder().encode(
      KEY_VERIFICATION_TAG + arrayBufferToBase64(hashBytes)
    );
    const verificationHashBuffer = await crypto.subtle.digest('SHA-256', verificationData);
    const keyHash = arrayBufferToBase64(verificationHashBuffer);

    // Zero out the raw hash from memory
    hashBytes.fill(0);

    return {
      key: cryptoKey,
      keyHash,
      salt: actualSalt,
    };
  } catch (error: any) {
    throw new Error(`Key derivation failed: ${error.message}`);
  }
}

/**
 * Generate a random encryption key
 */
export async function generateRandomKey(): Promise<{
  key: CryptoKey;
  keyString: string;
}> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    true, // Extractable for storage
    ['encrypt', 'decrypt']
  );

  const keyString = arrayBufferToBase64(keyBytes);
  
  // Zero out temporary buffer
  keyBytes.fill(0);

  return { key, keyString };
}

/**
 * Encrypt data with AES-256-GCM
 */
export async function encryptWithAESGCM(
  data: ArrayBuffer,
  key: CryptoKey,
  salt: Uint8Array,
  keyHash: string,
  mode: 'account' | 'per-file'
): Promise<EncryptedPayload> {
  // Generate unique IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  try {
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128, // 128-bit auth tag
      },
      key,
      data
    );

    return {
      data: arrayBufferToBase64(encrypted),
      metadata: {
        algorithm: 'AES-256-GCM',
        iv: arrayBufferToBase64(iv),
        salt: arrayBufferToBase64(salt),
        keyVerificationHash: keyHash,
        encryptionMode: mode,
        version: 1,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt data with AES-256-GCM
 */
export async function decryptWithAESGCM(
  encryptedData: string,
  key: CryptoKey,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  try {
    const data = base64ToArrayBuffer(encryptedData);
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer as ArrayBuffer,
        tagLength: 128,
      },
      key,
      data.buffer as ArrayBuffer
    );

    return decrypted;
  } catch (error: any) {
    throw new Error(`Decryption failed - invalid key or corrupted data`);
  }
}

/**
 * Verify if provided key matches stored hash
 * Uses constant-time comparison to prevent timing attacks
 */
export async function verifyKeyHash(
  password: string,
  salt: Uint8Array,
  storedHash: string
): Promise<boolean> {
  try {
    const { keyHash } = await deriveKeyWithArgon2id(password, salt);
    return constantTimeEqual(keyHash, storedHash);
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Create secure hash of key for storage (not the key itself)
 */
export async function createKeyVerificationHash(password: string): Promise<{
  hash: string;
  salt: string;
}> {
  const { keyHash, salt } = await deriveKeyWithArgon2id(password);
  
  return {
    hash: keyHash,
    salt: arrayBufferToBase64(salt),
  };
}

// Utility functions
export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }
  
  return btoa(chunks.join(''));
}

export function base64ToArrayBuffer(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Securely clear sensitive data from memory
 */
export function secureClear(data: Uint8Array | ArrayBuffer): void {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const safeBytes = new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  crypto.getRandomValues(safeBytes); // Overwrite with random data first
  safeBytes.fill(0); // Then zero it out
}
