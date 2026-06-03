/**
 * Archive Service
 * Handles extraction of archive files (.zip, .rar, .7z, .tar, .gz) in SquidCloud
 */

import { supabase } from '@/integrations/supabase/client';
import { downloadFileWithRes54 } from '@/lib/res54';
import JSZip from 'jszip';

interface ExtractionProgress {
  extractionId: string;
  progress: number;
  extractedFiles: number;
  totalFiles: number;
  status: 'pending' | 'extracting' | 'completed' | 'failed';
}

class ArchiveService {
  /**
   * Extract an archive file to a destination folder
   */
  async extractArchive(
    extractionId: string,
    fileId: string,
    destinationFolder: string | null
  ): Promise<void> {
    try {
      // Update status to extracting
      await this.updateExtractionStatus(extractionId, 'extracting', 0);

      // Get file info
      const { data: fileData, error: fileError } = await supabase
        .from('files')
        .select('*')
        .eq('id', fileId)
        .single();

      if (fileError || !fileData) {
        throw new Error('File not found');
      }

      console.log('Starting extraction for file:', fileData.name);
      console.log('File metadata:', {
        id: fileData.id,
        size: fileData.size,
        type: fileData.type,
        hasTags: !!fileData.tags,
        hasEncryptionKey: !!fileData.encryption_key,
        storagePath: (fileData as any).storage_path
      });

      let blob: Blob;

      // Try downloading with Res54 (GitHub chunks) first
      try {
        blob = await downloadFileWithRes54(fileId, (progress, stage, details) => {
          console.log(`Download progress: ${progress}% - ${stage}`, details);
          
          // Update extraction progress (download is 0-70% of total process)
          const downloadProgress = Math.round(progress * 0.7);
          this.updateExtractionStatus(extractionId, 'extracting', downloadProgress);
        });
        console.log('Archive downloaded successfully via Res54, size:', blob.size);
      } catch (res54Error: any) {
        console.warn('Res54 download failed, trying direct Supabase storage:', res54Error.message);
        
        // Fallback: Try downloading from Supabase storage bucket
        if ((fileData as any).storage_path) {
          const storagePath = (fileData as any).storage_path;
          console.log('Attempting download from storage path:', storagePath);
          
          const { data: storageData, error: storageError } = await supabase.storage
            .from('files')
            .download(storagePath);
          
          if (storageError || !storageData) {
            throw new Error(`Failed to download file: ${res54Error.message}. Storage fallback also failed: ${storageError?.message || 'No storage data'}`);
          }
          
          blob = storageData;
          console.log('Archive downloaded successfully from storage, size:', blob.size);
        } else {
          throw new Error(`Failed to download file: ${res54Error.message}. No storage_path available for fallback.`);
        }
      }

      console.log('Archive ready for extraction, size:', blob.size);

      // Check file type and extract accordingly
      if (fileData.name.toLowerCase().endsWith('.zip')) {
        await this.extractZip(extractionId, blob, fileData, destinationFolder);
      } else {
        throw new Error('Unsupported archive format. Currently only .zip files are supported.');
      }

      // Mark as completed
      await this.updateExtractionStatus(extractionId, 'completed', 100);

    } catch (error: any) {
      console.error('Extraction error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      
      // Mark as failed
      await supabase
        .from('archive_extractions' as any)
        .update({
          status: 'failed',
          error_message: error.message || 'Unknown error occurred',
          completed_at: new Date().toISOString(),
        })
        .eq('id', extractionId);

      throw error;
    }
  }

  /**
   * Extract ZIP archive
   */
  private async extractZip(
    extractionId: string,
    blob: Blob,
    sourceFile: any,
    destinationFolder: string | null
  ): Promise<void> {
    try {
      const zip = await JSZip.loadAsync(blob);
      const fileNames = Object.keys(zip.files);
      const totalFiles = fileNames.filter(name => !zip.files[name].dir).length;

      // Update total files count
      await supabase
        .from('archive_extractions' as any)
        .update({ total_files: totalFiles })
        .eq('id', extractionId);

      const extractedFileIds: string[] = [];
      let extractedCount = 0;

      // Get user ID from source file
      const userId = sourceFile.user_id;

      // Extract each file
      for (const fileName of fileNames) {
        const file = zip.files[fileName];
        
        // Skip directories
        if (file.dir) continue;

        try {
          // Get file content as blob
          const fileBlob = await file.async('blob');
          
          // Determine MIME type from extension
          const mimeType = this.getMimeType(fileName);
          
          // Create File object
          const fileObject = new File([fileBlob], fileName.split('/').pop() || fileName, {
            type: mimeType,
          });

          // Upload file to storage
          const uploadedFileId = await this.uploadExtractedFile(
            fileObject,
            userId,
            destinationFolder,
            sourceFile.encryption_key
          );

          if (uploadedFileId) {
            extractedFileIds.push(uploadedFileId);
          }

          extractedCount++;
          const progress = Math.round((extractedCount / totalFiles) * 100);

          // Update progress
          await supabase
            .from('archive_extractions' as any)
            .update({
              progress,
              extracted_files: extractedCount,
              extracted_file_ids: extractedFileIds,
            })
            .eq('id', extractionId);

        } catch (fileError) {
          console.error(`Error extracting ${fileName}:`, fileError);
          // Continue with other files even if one fails
        }
      }

    } catch (error) {
      console.error('ZIP extraction error:', error);
      throw new Error('Failed to extract ZIP archive');
    }
  }

  /**
   * Upload extracted file to storage
   */
  private async uploadExtractedFile(
    file: File,
    userId: string,
    destinationFolder: string | null,
    encryptionKey?: string
  ): Promise<string | null> {
    try {
      // Generate unique file path
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(7);
      const storagePath = `${userId}/${timestamp}-${randomString}-${file.name}`;

      // Upload to storage bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('files')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Create file record in database
      const { data: fileRecord, error: fileError } = await supabase
        .from('files')
        .insert({
          user_id: userId,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          storage_path: storagePath,
          parent_folder: destinationFolder,
          encrypted: !!encryptionKey,
          encryption_key: encryptionKey,
        })
        .select()
        .single();

      if (fileError) throw fileError;

      return fileRecord.id;

    } catch (error) {
      console.error('Error uploading extracted file:', error);
      return null;
    }
  }

  /**
   * Update extraction status
   */
  private async updateExtractionStatus(
    extractionId: string,
    status: 'pending' | 'extracting' | 'completed' | 'failed',
    progress: number
  ): Promise<void> {
    const updates: any = {
      status,
      progress,
    };

    if (status === 'extracting' && progress === 0) {
      updates.started_at = new Date().toISOString();
    }

    if (status === 'completed' || status === 'failed') {
      updates.completed_at = new Date().toISOString();
    }

    await supabase
      .from('archive_extractions' as any)
      .update(updates)
      .eq('id', extractionId);
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      // Images
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      
      // Documents
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      
      // Text
      txt: 'text/plain',
      md: 'text/markdown',
      json: 'application/json',
      xml: 'application/xml',
      csv: 'text/csv',
      
      // Code
      js: 'application/javascript',
      ts: 'application/typescript',
      html: 'text/html',
      css: 'text/css',
      
      // Video
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      
      // Audio
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      
      // Archives
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',
      tar: 'application/x-tar',
      gz: 'application/gzip',
    };

    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * Check if file is an archive
   */
  isArchiveFile(fileName: string): boolean {
    const archiveExtensions = /\.(zip|rar|7z|tar|gz|tgz|bz2|tar\.gz|tar\.bz2)$/i;
    return archiveExtensions.test(fileName);
  }

  /**
   * Get extraction history for user
   */
  async getExtractionHistory(userId: string, limit: number = 10): Promise<any[]> {
    const { data, error } = await supabase
      .from('archive_extractions' as any)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching extraction history:', error);
      return [];
    }

    return data || [];
  }
}

const archiveService = new ArchiveService();
export default archiveService;
