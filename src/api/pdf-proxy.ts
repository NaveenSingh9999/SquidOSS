// PDF Proxy API - Direct PDF serving to bypass CORS/CSP issues
import { supabase } from '@/integrations/supabase/client';
import { downloadFileWithRes54 } from '@/lib/res54';

interface PDFProxyRequest {
  fileId: string;
  userId: string;
}

interface PDFProxyResponse {
  success: boolean;
  data?: Blob;
  error?: string;
}

/**
 * Direct PDF proxy that bypasses all CORS/CSP issues by serving content directly
 */
export class PDFProxy {
  private static cache = new Map<string, { blob: Blob; timestamp: number }>();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get PDF content directly as a blob
   */
  static async getPDFBlob(fileId: string): Promise<Blob> {
    try {
      console.log('PDFProxy: Getting PDF blob for file:', fileId);

      // Check cache first
      const cacheKey = fileId;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log('PDFProxy: Returning cached PDF blob');
        return cached.blob;
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

      // Check if it's a PDF
      if (!fileData.type?.includes('pdf') && !fileData.name?.toLowerCase().endsWith('.pdf')) {
        throw new Error('File is not a PDF');
      }

      let pdfBlob: Blob;

      // Handle encrypted files
      if (fileData.encrypted || fileData.storage_path === 'res54_distributed') {
        console.log('PDFProxy: Decrypting RES54 file...');
        pdfBlob = await downloadFileWithRes54(fileData.id, (progress, stage) => {
          console.log(`PDFProxy: Decryption progress - ${progress}% (${stage})`);
        });
      } else {
        console.log('PDFProxy: Downloading regular file...');
        // Download regular file
        const { data: fileContent, error: downloadError } = await supabase.storage
          .from('files')
          .download(fileData.storage_path);

        if (downloadError || !fileContent) {
          throw new Error('Failed to download file');
        }

        pdfBlob = fileContent;
      }

      // Ensure it's a PDF blob
      if (pdfBlob.type !== 'application/pdf') {
        pdfBlob = new Blob([pdfBlob], { type: 'application/pdf' });
      }

      // Cache the result
      this.cache.set(cacheKey, { blob: pdfBlob, timestamp: Date.now() });

      console.log('PDFProxy: PDF blob ready, size:', pdfBlob.size);
      return pdfBlob;

    } catch (error) {
      console.error('PDFProxy: Error getting PDF blob:', error);
      throw error;
    }
  }

  /**
   * Create a blob URL for the PDF (works in all environments)
   */
  static async createBlobURL(fileId: string): Promise<string> {
    try {
      const blob = await this.getPDFBlob(fileId);
      const blobUrl = URL.createObjectURL(blob);
      
      console.log('PDFProxy: Created blob URL:', blobUrl);
      return blobUrl;
    } catch (error) {
      console.error('PDFProxy: Error creating blob URL:', error);
      throw error;
    }
  }

  /**
   * Get PDF as base64 data URL (fallback method)
   */
  static async getDataURL(fileId: string): Promise<string> {
    try {
      const blob = await this.getPDFBlob(fileId);
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to convert to data URL'));
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('PDFProxy: Error creating data URL:', error);
      throw error;
    }
  }

  /**
   * Smart PDF URL generation - tries multiple methods for maximum compatibility
   */
  static async getSmartPDFUrl(fileId: string): Promise<string> {
    try {
      console.log('PDFProxy: Starting smart PDF URL generation for:', fileId);
      
      // Get the PDF blob first
      const blob = await this.getPDFBlob(fileId);
      
      // Method 1: Try data URL first (most compatible with CSP)
      try {
        console.log('PDFProxy: Trying data URL method...');
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to convert to data URL'));
          reader.readAsDataURL(blob);
        });
        
        console.log('PDFProxy: Data URL created successfully, length:', dataUrl.length);
        return dataUrl;
      } catch (dataError) {
        console.warn('PDFProxy: Data URL failed, trying blob URL:', dataError);
      }

      // Method 2: Fallback to blob URL
      try {
        const blobUrl = URL.createObjectURL(blob);
        console.log('PDFProxy: Created blob URL:', blobUrl);
        
        // Store the blob URL for later cleanup
        this.activeBlobUrls.set(fileId, blobUrl);
        
        return blobUrl;
      } catch (blobError) {
        console.warn('PDFProxy: Blob URL failed:', blobError);
        throw blobError;
      }

    } catch (error) {
      console.error('PDFProxy: All URL generation methods failed:', error);
      throw new Error('Failed to generate PDF URL');
    }
  }

  private static activeBlobUrls = new Map<string, string>();

  /**
   * Clean up blob URLs to prevent memory leaks
   */
  static revokeBlobURL(url: string): void {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
      console.log('PDFProxy: Revoked blob URL');
    }
  }

  /**
   * Clean up blob URL for specific file
   */
  static cleanupFileUrl(fileId: string): void {
    const blobUrl = this.activeBlobUrls.get(fileId);
    if (blobUrl) {
      this.revokeBlobURL(blobUrl);
      this.activeBlobUrls.delete(fileId);
    }
  }

  /**
   * Clear cache
   */
  static clearCache(): void {
    this.cache.clear();
    console.log('PDFProxy: Cache cleared');
  }
}
