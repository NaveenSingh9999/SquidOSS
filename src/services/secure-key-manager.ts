/**
 * Secure Key Management Service
 * Handles master key creation, file key wrapping, and secure storage
 * Implements zero-knowledge encryption architecture
 */

import { supabase } from '@/integrations/supabase/client';
import {
  deriveKeyFromPassword,
  generateMasterKey,
  wrapKey,
  unwrapKey,
  exportKey,
  importKey,
  arrayBufferToBase64,
  base64ToArrayBuffer
} from '@/lib/key-derivation';

/**
 * Initialize user's master key on first login/signup
 * This should be called after successful authentication
 */
export const initializeMasterKey = async (password: string): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    
    // Check if master key already exists
    const { data: existing } = await supabase
      .from('master_keys')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (existing) {
      console.log('Master key already exists');
      return;
    }
    
    // Generate master key
    const masterKey = await generateMasterKey();
    
    // Derive key from password
    const { key: passwordKey, saltBase64 } = await deriveKeyFromPassword(password);
    
    // Wrap master key with password-derived key
    const { wrappedKey, iv } = await wrapKey(masterKey, passwordKey);
    
    // Store wrapped master key in database
    const { error } = await supabase
      .from('master_keys')
      .insert({
        user_id: user.id,
        encrypted_master_key: `${wrappedKey}:${iv}`,
        kdf_salt: saltBase64,
        kdf_iterations: 100000,
        key_version: 1
      });
    
    if (error) throw error;
    
    // Log key creation
    await supabase.rpc('log_key_access', {
      p_key_type: 'master_key',
      p_key_id: user.id,
      p_action: 'create',
      p_success: true
    });
    
    console.log('Master key initialized successfully');
  } catch (error: any) {
    console.error('Master key initialization error:', error);
    throw new Error(`Failed to initialize master key: ${error.message}`);
  }
};

/**
 * Retrieve and unwrap user's master key
 */
export const getMasterKey = async (password: string): Promise<CryptoKey> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    
    // Get master key from database
    const { data: masterKeyData, error } = await supabase
      .from('master_keys')
      .select('encrypted_master_key, kdf_salt, kdf_iterations')
      .eq('user_id', user.id)
      .order('key_version', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) throw error;
    if (!masterKeyData) throw new Error('Master key not found. Please initialize.');
    
    // Parse wrapped key and IV
    const [wrappedKeyBase64, ivBase64] = masterKeyData.encrypted_master_key.split(':');
    
    // Derive key from password
    const salt = base64ToArrayBuffer(masterKeyData.kdf_salt);
    const { key: passwordKey } = await deriveKeyFromPassword(
      password,
      salt,
      masterKeyData.kdf_iterations
    );
    
    // Unwrap master key
    const masterKey = await unwrapKey(wrappedKeyBase64, ivBase64, passwordKey);
    
    // Log key access
    await supabase.rpc('log_key_access', {
      p_key_type: 'master_key',
      p_key_id: user.id,
      p_action: 'access',
      p_success: true
    });
    
    return masterKey;
  } catch (error: any) {
    console.error('Master key retrieval error:', error);
    
    // Log failed access
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.rpc('log_key_access', {
          p_key_type: 'master_key',
          p_key_id: user.id,
          p_action: 'access',
          p_success: false,
          p_error_message: error.message
        });
      }
    } catch (logError) {
      console.error('Failed to log key access:', logError);
    }
    
    throw new Error(`Failed to retrieve master key: ${error.message}`);
  }
};

/**
 * Wrap a file encryption key with user's master key
 * Returns the wrapped key for secure storage
 */
export const wrapFileKey = async (
  fileEncryptionKey: string,
  masterKey: CryptoKey
): Promise<{ wrappedKey: string; iv: string }> => {
  try {
    // Import file encryption key
    const fileKey = await importKey(fileEncryptionKey);
    
    // Wrap with master key
    return await wrapKey(fileKey, masterKey);
  } catch (error: any) {
    console.error('File key wrapping error:', error);
    throw new Error(`Failed to wrap file key: ${error.message}`);
  }
};

/**
 * Unwrap a file encryption key using user's master key
 */
export const unwrapFileKey = async (
  wrappedKeyBase64: string,
  ivBase64: string,
  masterKey: CryptoKey
): Promise<string> => {
  try {
    // Unwrap the file key
    const fileKey = await unwrapKey(wrappedKeyBase64, ivBase64, masterKey);
    
    // Export to string format
    return await exportKey(fileKey);
  } catch (error: any) {
    console.error('File key unwrapping error:', error);
    throw new Error(`Failed to unwrap file key: ${error.message}`);
  }
};

/**
 * Store wrapped file encryption key for a file
 */
export const storeFileKey = async (
  fileId: string,
  fileEncryptionKey: string,
  masterKey: CryptoKey
): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    
    // Wrap the file key
    const { wrappedKey, iv } = await wrapFileKey(fileEncryptionKey, masterKey);
    
    // Store in database
    const { error } = await supabase
      .from('encrypted_keys')
      .upsert({
        file_id: fileId,
        user_id: user.id,
        wrapped_key: wrappedKey,
        key_iv: iv,
        key_version: 1
      });
    
    if (error) throw error;
    
    // Log key storage
    await supabase.rpc('log_key_access', {
      p_key_type: 'file_key',
      p_key_id: fileId,
      p_action: 'create',
      p_success: true
    });
  } catch (error: any) {
    console.error('File key storage error:', error);
    throw new Error(`Failed to store file key: ${error.message}`);
  }
};

/**
 * Retrieve and unwrap file encryption key
 */
export const getFileKey = async (
  fileId: string,
  masterKey: CryptoKey
): Promise<string> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    
    // Get wrapped key from database
    const { data: keyData, error } = await supabase
      .from('encrypted_keys')
      .select('wrapped_key, key_iv')
      .eq('file_id', fileId)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (error) throw error;
    if (!keyData) throw new Error('File key not found');
    
    // Unwrap the key
    const fileKey = await unwrapFileKey(keyData.wrapped_key, keyData.key_iv, masterKey);
    
    // Log key access
    await supabase.rpc('log_key_access', {
      p_key_type: 'file_key',
      p_key_id: fileId,
      p_action: 'access',
      p_success: true
    });
    
    return fileKey;
  } catch (error: any) {
    console.error('File key retrieval error:', error);
    throw new Error(`Failed to retrieve file key: ${error.message}`);
  }
};

/**
 * Rotate user's master key
 * Re-wraps all file keys with new master key
 */
export const rotateMasterKey = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    
    // Get current master key
    const currentMasterKey = await getMasterKey(currentPassword);
    
    // Generate new master key
    const newMasterKey = await generateMasterKey();
    
    // Derive new key from new password
    const { key: newPasswordKey, saltBase64 } = await deriveKeyFromPassword(newPassword);
    
    // Wrap new master key with new password
    const { wrappedKey, iv } = await wrapKey(newMasterKey, newPasswordKey);
    
    // Store new master key
    await supabase.rpc('rotate_master_key', {
      p_old_wrapped_key: '', // Not needed
      p_new_wrapped_key: `${wrappedKey}:${iv}`,
      p_new_salt: saltBase64
    });
    
    // Get all file keys
    const { data: fileKeys, error } = await supabase
      .from('encrypted_keys')
      .select('file_id, wrapped_key, key_iv')
      .eq('user_id', user.id);
    
    if (error) throw error;
    
    // Re-wrap all file keys with new master key
    for (const fileKeyData of fileKeys || []) {
      // Unwrap with old master key
      const fileKey = await unwrapFileKey(
        fileKeyData.wrapped_key,
        fileKeyData.key_iv,
        currentMasterKey
      );
      
      // Re-wrap with new master key
      await storeFileKey(fileKeyData.file_id, fileKey, newMasterKey);
    }
    
    console.log(`Successfully rotated master key and ${fileKeys?.length || 0} file keys`);
  } catch (error: any) {
    console.error('Master key rotation error:', error);
    throw new Error(`Failed to rotate master key: ${error.message}`);
  }
};
