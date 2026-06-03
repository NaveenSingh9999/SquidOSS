/**
 * Secure Upload Service with Master Key Integration
 * Wraps file encryption keys with user's master key for zero-knowledge storage
 */

import { supabase } from '@/integrations/supabase/client';
import { getMasterKey, storeFileKey } from './secure-key-manager';

/**
 * Securely store file encryption key wrapped with master key
 * Call this after uploading an encrypted file
 */
export const secureFileEncryptionKey = async (
  fileId: string,
  fileEncryptionKey: string,
  masterPassword: string
): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get or derive master key
    const masterKey = await getMasterKey(masterPassword);

    // Wrap and store file key
    await storeFileKey(fileId, fileEncryptionKey, masterKey);

    console.log(`Securely stored encryption key for file ${fileId}`);
  } catch (error: any) {
    console.error('Failed to secure file encryption key:', error);
    throw new Error(`Key storage failed: ${error.message}`);
  }
};

/**
 * Batch secure multiple file encryption keys
 */
export const secureMultipleFileKeys = async (
  files: Array<{ fileId: string; encryptionKey: string }>,
  masterPassword: string
): Promise<{ succeeded: string[]; failed: string[] }> => {
  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const file of files) {
    try {
      await secureFileEncryptionKey(file.fileId, file.encryptionKey, masterPassword);
      succeeded.push(file.fileId);
    } catch (error) {
      console.error(`Failed to secure key for ${file.fileId}:`, error);
      failed.push(file.fileId);
    }
  }

  return { succeeded, failed };
};
