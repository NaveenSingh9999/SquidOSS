// Simple PDF Loader - Direct approach for maximum compatibility
import { supabase } from '@/integrations/supabase/client';
import { downloadFileWithRes54 } from '@/lib/res54';

/**
 * Simple, reliable PDF loader that works in all environments
 */
export class SimplePDFLoader {
  private static cache = new Map<string, string>();

  /**
   * Get PDF as data URL - most compatible method
   */
  static async getPDFDataUrl(fileId: string): Promise<string> {
    try {
      console.log('SimplePDFLoader: Loading PDF as data URL for:', fileId);
      
      // Check cache first
      const cached = this.cache.get(fileId);
      if (cached) {
        console.log('SimplePDFLoader: Returning cached data URL');
        return cached;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get file metadata
      const { data: fileData, error: fileError } = await supabase
        .from('files')
        .select('*')
        .eq('id', fileId)
        .eq('user_id', user.id)
        .single();

      if (fileError || !fileData) {
        throw new Error('File not found or access denied');
      }

      let pdfBlob: Blob;

      // Handle encrypted vs regular files
      if (fileData.encrypted || fileData.storage_path === 'res54_distributed') {
        console.log('SimplePDFLoader: Decrypting RES54 file...');
        pdfBlob = await downloadFileWithRes54(fileData.id, (progress, stage) => {
          console.log(`SimplePDFLoader: ${progress}% - ${stage}`);
        });
      } else {
        console.log('SimplePDFLoader: Downloading regular file...');
        const { data: fileContent, error: downloadError } = await supabase.storage
          .from('files')
          .download(fileData.storage_path);

        if (downloadError || !fileContent) {
          throw new Error('Failed to download file');
        }
        pdfBlob = fileContent;
      }

      // Convert to data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = () => reject(new Error('Failed to convert to data URL'));
        reader.readAsDataURL(pdfBlob);
      });

      // Cache the result
      this.cache.set(fileId, dataUrl);
      
      console.log('SimplePDFLoader: Data URL created, length:', dataUrl.length);
      return dataUrl;

    } catch (error) {
      console.error('SimplePDFLoader: Error creating data URL:', error);
      throw error;
    }
  }

  /**
   * Clear cache for a specific file
   */
  static clearFile(fileId: string): void {
    this.cache.delete(fileId);
  }

  /**
   * Clear all cache
   */
  static clearAll(): void {
    this.cache.clear();
  }
}