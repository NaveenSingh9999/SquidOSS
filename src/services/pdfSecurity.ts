import { supabase } from '@/integrations/supabase/client';
import { SimplePDFLoader } from '@/api/simple-pdf-loader';

export class PDFSecurityService {
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  /**
   * Generate a secure PDF URL for viewing using simple data URL method
   */
  static async generateSecurePDFUrl(fileData: any): Promise<string> {
    try {
      console.log('PDFSecurityService: Generating secure PDF URL for file:', fileData.id);
      
      // Use the simple PDF loader that creates data URLs
      const pdfUrl = await SimplePDFLoader.getPDFDataUrl(fileData.id);
      
      console.log('PDFSecurityService: Generated PDF URL successfully');
      return pdfUrl;
    } catch (error) {
      console.error('PDFSecurityService: Error generating secure PDF URL:', error);
      throw new Error('Failed to generate secure PDF access');
    }
  }

  /**
   * Clean up any cached data for the file
   */
  static cleanupPDFUrl(url: string, fileId?: string): void {
    if (fileId) {
      SimplePDFLoader.clearFile(fileId);
    }
    // Data URLs don't need cleanup like blob URLs
  }

  /**
   * Check if user has access to the file
   */
  static async verifyFileAccess(fileId: string, userId: string): Promise<boolean> {
    try {
      // Check if user owns the file
      const { data: fileData, error: fileError } = await supabase
        .from('files')
        .select('id, user_id, shared')
        .eq('id', fileId)
        .single();

      if (fileError || !fileData) {
        return false;
      }

      // User owns the file
      if (fileData.user_id === userId) {
        return true;
      }

      // Check if file is shared with the user
      if (fileData.shared) {
        // For now, if file is marked as shared, allow access
        // TODO: Implement proper file sharing table when available
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error verifying file access:', error);
      return false;
    }
  }

  /**
   * Get the current user's access token for PDF requests
   * @deprecated - No longer needed with direct proxy approach
   */
  static async getAccessToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('User not authenticated');
    }
    
    return session.access_token;
  }
}

export default PDFSecurityService;