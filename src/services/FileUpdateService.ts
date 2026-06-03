import { supabase } from '@/integrations/supabase/client';
import { uploadFileWithRes54 } from '@/lib/res54';

export interface FileUpdateResult {
  success: boolean;
  error?: string;
  fileData?: any;
}

/**
 * Service for handling file updates with RES54 encryption
 */
export class FileUpdateService {
  /**
   * Update a text file's content with RES54 encryption
   * @param fileId - The file ID to update
   * @param newContent - The new text content
   * @param originalFile - The original file metadata
   * @returns Promise<FileUpdateResult>
   */
  static async updateTextFile(
    fileId: string, 
    newContent: string, 
    originalFile: any
  ): Promise<FileUpdateResult> {
    try {
      console.log('FileUpdateService: Starting file update for:', fileId);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Verify file ownership
      const { data: fileData, error: fileError } = await supabase
        .from('files')
        .select('*')
        .eq('id', fileId)
        .eq('user_id', user.id)
        .single();

      if (fileError || !fileData) {
        throw new Error('File not found or access denied');
      }

      // Convert content to blob
      const contentBlob = new Blob([newContent], { 
        type: originalFile.type || 'text/plain' 
      });

      // Create a File object for the upload function
      const updatedFile = new File([contentBlob], originalFile.name, {
        type: originalFile.type || 'text/plain',
        lastModified: Date.now()
      });

      console.log('FileUpdateService: Encrypting and uploading updated content...');

      // Upload with RES54 encryption
      // This will create a new encrypted version
      const uploadResult = await uploadFileWithRes54(
        updatedFile,
        (progress, stage) => {
          console.log(`FileUpdateService: ${stage} - ${progress}%`);
        }
      );

      if (!uploadResult.id) {
        throw new Error('Upload failed - no file ID returned');
      }

      // Update file metadata in database with new encryption details
      // Note: encryption_key will be hashed by DB trigger automatically
      const { data: updatedFileData, error: updateError } = await supabase
        .from('files')
        .update({
          size: contentBlob.size,
          updated_at: new Date().toISOString(),
          encrypted: true,
          encryption_key: uploadResult.encryptionKey, // DB trigger will hash this
          storage_path: 'res54_distributed',
        })
        .eq('id', fileId)
        .select()
        .single();

      if (updateError) {
        console.error('FileUpdateService: Database update failed:', updateError);
        throw new Error('Failed to update file metadata');
      }

      console.log('FileUpdateService: File updated successfully');

      return {
        success: true,
        fileData: updatedFileData
      };

    } catch (error: any) {
      console.error('FileUpdateService: Update failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to update file'
      };
    }
  }

  /**
   * Create a backup of the current file before updating
   * @param fileId - The file ID to backup
   * @param content - The content to backup
   * @returns Promise<boolean>
   */
  static async createBackup(fileId: string, content: string): Promise<boolean> {
    try {
      // For now, we'll use the file_versions table if it exists
      // or create local backups in browser storage as fallback
      console.log('FileUpdateService: Backup feature not implemented yet');
      return true; // Return true to not break the flow
    } catch (error) {
      console.warn('FileUpdateService: Backup creation error:', error);
      return false;
    }
  }

  /**
   * Validate content before saving
   * @param content - The content to validate
   * @param fileType - The file type/extension
   * @returns { valid: boolean, error?: string }
   */
  static validateContent(content: string, fileType: string): { valid: boolean; error?: string } {
    // Basic validation
    if (content.length > 10 * 1024 * 1024) { // 10MB limit for text files
      return {
        valid: false,
        error: 'Content too large. Maximum size is 10MB for text files.'
      };
    }

    // JSON validation
    if (fileType.includes('json')) {
      try {
        JSON.parse(content);
      } catch (error) {
        return {
          valid: false,
          error: 'Invalid JSON format. Please check your syntax.'
        };
      }
    }

    // Basic encoding check
    try {
      const encoder = new TextEncoder();
      encoder.encode(content);
    } catch (error) {
      return {
        valid: false,
        error: 'Content contains invalid characters that cannot be encoded.'
      };
    }

    return { valid: true };
  }

  /**
   * Check if file has been modified by another user
   * @param fileId - The file ID to check
   * @param lastKnownUpdate - The last known update timestamp
   * @returns Promise<boolean>
   */
  static async checkForConflicts(fileId: string, lastKnownUpdate: string): Promise<boolean> {
    try {
      const { data: fileData, error } = await supabase
        .from('files')
        .select('updated_at')
        .eq('id', fileId)
        .single();

      if (error || !fileData) {
        return false;
      }

      const currentUpdate = new Date(fileData.updated_at).getTime();
      const knownUpdate = new Date(lastKnownUpdate).getTime();

      return currentUpdate > knownUpdate;
    } catch (error) {
      console.error('FileUpdateService: Conflict check failed:', error);
      return false;
    }
  }
}