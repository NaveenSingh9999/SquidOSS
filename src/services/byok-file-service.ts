/**
 * BYOK File Service
 * Integrates BYOK encryption with file upload/download operations
 */

import { supabase } from '@/integrations/supabase/client';
import {
  deriveKeyWithArgon2id,
  encryptWithAESGCM,
  decryptWithAESGCM,
  verifyKeyHash,
  base64ToArrayBuffer,
  arrayBufferToBase64,
  type EncryptedPayload,
  type EncryptionMetadata,
} from './byok-encryption';
import { sessionKeyManager } from './session-key-manager';

export interface FileEncryptionInfo {
  isEncrypted: boolean;
  encryptionMode?: 'account' | 'per-file';
  hasKey?: boolean;
  metadata?: EncryptionMetadata;
}

/**
 * Encrypt file data using BYOK
 */
export async function encryptFileWithBYOK(
  fileData: ArrayBuffer,
  mode: 'account' | 'per-file' = 'account',
  perFilePassword?: string
): Promise<{
  encryptedData: ArrayBuffer;
  metadata: EncryptionMetadata;
}> {
  let key: CryptoKey;
  let keyHash: string;
  let salt: Uint8Array;

  if (mode === 'account') {
    // Use account key from session
    const sessionKey = sessionKeyManager.getAccountKey();
    if (!sessionKey) {
      throw new Error('Account encryption key not available. Please unlock your key first.');
    }
    key = sessionKey.key;
    keyHash = sessionKey.keyHash;
    salt = sessionKey.salt;
  } else {
    // Use per-file key
    if (!perFilePassword) {
      throw new Error('Per-file encryption requires a password');
    }
    const derived = await deriveKeyWithArgon2id(perFilePassword);
    key = derived.key;
    keyHash = derived.keyHash;
    salt = derived.salt;
  }

  // Encrypt the file
  const encrypted = await encryptWithAESGCM(fileData, key, salt, keyHash, mode);

  // Convert encrypted data back to ArrayBuffer for storage
  const encryptedBuffer = base64ToArrayBuffer(encrypted.data);

  return {
    encryptedData: encryptedBuffer.buffer as ArrayBuffer,
    metadata: encrypted.metadata,
  };
}

/**
 * Decrypt file data using BYOK
 */
export async function decryptFileWithBYOK(
  encryptedData: ArrayBuffer,
  metadata: EncryptionMetadata,
  password?: string
): Promise<ArrayBuffer> {
  const mode = metadata.encryptionMode;
  let key: CryptoKey;

  if (mode === 'account') {
    // Try session key first
    const sessionKey = sessionKeyManager.getAccountKey();
    if (sessionKey) {
      key = sessionKey.key;
    } else if (password) {
      // Derive key from password
      const salt = base64ToArrayBuffer(metadata.salt);
      const isValid = await verifyKeyHash(password, salt, metadata.keyVerificationHash);
      if (!isValid) {
        throw new Error('Invalid encryption key');
      }
      const derived = await deriveKeyWithArgon2id(password, salt);
      key = derived.key;
      // Store in session for future use
      sessionKeyManager.setAccountKey(key, derived.keyHash, salt);
    } else {
      throw new Error('UNLOCK_REQUIRED');
    }
  } else {
    // Per-file key
    if (!password) {
      throw new Error('UNLOCK_REQUIRED');
    }
    const salt = base64ToArrayBuffer(metadata.salt);
    const isValid = await verifyKeyHash(password, salt, metadata.keyVerificationHash);
    if (!isValid) {
      throw new Error('Invalid encryption key');
    }
    const derived = await deriveKeyWithArgon2id(password, salt);
    key = derived.key;
  }

  // Decrypt
  const iv = base64ToArrayBuffer(metadata.iv);
  const decrypted = await decryptWithAESGCM(
    arrayBufferToBase64(encryptedData),
    key,
    iv
  );

  return decrypted;
}

/**
 * Check if a file requires BYOK decryption
 */
export async function getFileEncryptionInfo(fileId: string): Promise<FileEncryptionInfo> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { isEncrypted: false };

    const { data: file, error } = await supabase
      .from('files')
      .select('encrypted, encryption_key')
      .eq('id', fileId)
      .single();

    if (error || !file) {
      return { isEncrypted: false };
    }

    if (!file.encrypted) {
      return { isEncrypted: false };
    }

    // Check if we have metadata for BYOK
    const { data: encryptionData } = await supabase
      .from('encrypted_keys')
      .select('wrapped_key, key_iv')
      .eq('file_id', fileId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (encryptionData) {
      // BYOK encrypted file
      const hasAccountKey = sessionKeyManager.hasAccountKey();
      return {
        isEncrypted: true,
        encryptionMode: 'account',
        hasKey: hasAccountKey,
      };
    }

    // Regular encryption
    return {
      isEncrypted: true,
      encryptionMode: undefined,
      hasKey: !!file.encryption_key,
    };
  } catch (error) {
    console.error('Failed to get file encryption info:', error);
    return { isEncrypted: false };
  }
}

/**
 * Store BYOK encryption metadata for a file
 */
export async function storeFileEncryptionMetadata(
  fileId: string,
  metadata: EncryptionMetadata
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Store metadata in encrypted_keys table
  const { error } = await supabase
    .from('encrypted_keys')
    .upsert({
      file_id: fileId,
      user_id: user.id,
      wrapped_key: JSON.stringify(metadata),
      key_iv: metadata.iv,
      key_version: metadata.version,
    });

  if (error) {
    throw new Error(`Failed to store encryption metadata: ${error.message}`);
  }

  // Update file record
  await supabase
    .from('files')
    .update({ encrypted: true })
    .eq('id', fileId);
}

/**
 * Get BYOK encryption metadata for a file
 */
export async function getFileEncryptionMetadata(
  fileId: string
): Promise<EncryptionMetadata | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('encrypted_keys')
    .select('wrapped_key')
    .eq('file_id', fileId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;

  try {
    return JSON.parse(data.wrapped_key) as EncryptionMetadata;
  } catch {
    return null;
  }
}

/**
 * Check if user has BYOK enabled
 */
export async function isBYOKEnabled(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('user_encryption_settings')
    .select('settings')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return false;

  const settings = data.settings as any;
  return settings?.byok_enabled ?? false;
}

/**
 * Check if account key is unlocked in session
 */
export function isAccountKeyUnlocked(): boolean {
  return sessionKeyManager.hasAccountKey();
}
