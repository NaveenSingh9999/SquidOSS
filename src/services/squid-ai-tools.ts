import { supabase } from '@/integrations/supabase/client';
import { generateEncryptionKey, encryptData, decryptData } from '@/lib/encryption';

export interface FileOrganizationResult {
  foldersCreated: string[];
  filesMoved: { from: string; to: string }[];
  summary: string;
}

export interface FileAnalytics {
  totalFiles: number;
  totalSize: number;
  filesByType: Record<string, number>;
  largestFiles: Array<{ name: string; size: number }>;
  recentFiles: Array<{ name: string; created_at: string }>;
}

export interface SearchResult {
  files: any[];
  folders: any[];
  totalResults: number;
}

/**
 * AI Agent Tools for SquidAI
 * Provides real database operations and file management capabilities
 */
export class SquidAITools {
  
  // ==================== FILE ANALYTICS & QUERIES ====================
  
  /**
   * Get file statistics and analytics
   */
  static async getFileAnalytics(fileType?: string): Promise<FileAnalytics> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    let query = supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id);

    if (fileType) {
      query = query.ilike('name', `%.${fileType}`);
    }

    const { data: files, error } = await query;
    if (error) throw error;

    const analytics: FileAnalytics = {
      totalFiles: files?.length || 0,
      totalSize: files?.reduce((sum, f) => sum + (f.size || 0), 0) || 0,
      filesByType: {},
      largestFiles: [],
      recentFiles: []
    };

    // Group by type
    files?.forEach(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';
      analytics.filesByType[ext] = (analytics.filesByType[ext] || 0) + 1;
    });

    // Get largest files
    analytics.largestFiles = (files || [])
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, 10)
      .map(f => ({ name: f.name, size: f.size || 0 }));

    // Get recent files
    analytics.recentFiles = (files || [])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(f => ({ name: f.name, created_at: f.created_at }));

    return analytics;
  }

  /**
   * Count files by extension
   */
  static async countFilesByExtension(extension: string): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { count, error } = await supabase
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .ilike('name', `%.${extension}`);

    if (error) throw error;
    return count || 0;
  }

  /**
   * Search files and folders by name or content
   */
  static async searchFiles(query: string, searchContent: boolean = false): Promise<SearchResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Search files
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id)
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`);

    // Search folders
    const { data: folders, error: foldersError } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', user.id)
      .ilike('name', `%${query}%`);

    return {
      files: files || [],
      folders: folders || [],
      totalResults: (files?.length || 0) + (folders?.length || 0)
    };
  }

  /**
   * Get files in a specific folder
   */
  static async getFilesInFolder(folderPath: string): Promise<any[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id)
      .eq('parent_folder', folderPath);

    if (error) throw error;
    return data || [];
  }

  /**
   * Get total storage used
   */
  static async getStorageUsed(): Promise<{ used: number; total: number; percentage: number }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: files } = await supabase
      .from('files')
      .select('size')
      .eq('user_id', user.id);

    const used = files?.reduce((sum, f) => sum + (f.size || 0), 0) || 0;
    const total = 10 * 1024 * 1024 * 1024; // 10GB default
    const percentage = (used / total) * 100;

    return { used, total, percentage };
  }

  // ==================== FILE OPERATIONS ====================

  /**
   * Create a new file with content
   */
  static async createFile(
    fileName: string,
    content: string,
    parentFolder: string = '',
    fileType?: string
  ): Promise<{ success: boolean; fileId?: string; error?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    try {
      // Convert content to blob
      const blob = new Blob([content], { type: fileType || 'text/plain' });
      const file = new File([blob], fileName, { type: fileType || 'text/plain' });

      // Generate encryption key
      const encryptionKey = generateEncryptionKey();

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Encrypt the file content
      const encryptedData = await encryptData(arrayBuffer, encryptionKey);

      // Convert encrypted data to blob for upload
      const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });

      // Upload encrypted file to storage
      const filePath = `${user.id}/${Date.now()}_${fileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('files')
        .upload(filePath, encryptedBlob);

      if (uploadError) throw uploadError;

      // Create file record with encryption key
      const { data: fileRecord, error: dbError } = await supabase
        .from('files')
        .insert({
          user_id: user.id,
          name: fileName,
          size: blob.size, // Original size (not encrypted size)
          type: fileType || 'text/plain',
          storage_path: uploadData.path,
          parent_folder: parentFolder || null,
          is_deleted: false,
          encryption_key: encryptionKey // Database trigger will hash this
        })
        .select()
        .single();

      if (dbError) throw dbError;

      return { success: true, fileId: fileRecord.id };
    } catch (error: any) {
      console.error('Create file error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Read file content
   */
  static async readFileContent(fileId: string): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single();

    if (fileError) throw fileError;

    // Download encrypted file from storage
    const { data: encryptedContent, error: downloadError } = await supabase.storage
      .from('files')
      .download(file.storage_path);

    if (downloadError) throw downloadError;

    // Decrypt the file content
    const encryptedText = await encryptedContent.text();
    const decryptedBuffer = await decryptData(encryptedText, file.encryption_key);
    
    // Convert ArrayBuffer to text
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }

  /**
   * Update file content
   */
  static async updateFileContent(
    fileId: string,
    newContent: string
  ): Promise<{ success: boolean; error?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    try {
      const { data: file, error: fileError } = await supabase
        .from('files')
        .select('*')
        .eq('id', fileId)
        .eq('user_id', user.id)
        .single();

      if (fileError) throw fileError;

      // Convert new content to ArrayBuffer
      const encoder = new TextEncoder();
      const contentBuffer = encoder.encode(newContent).buffer;

      // Use existing encryption key or generate new one
      const encryptionKey = file.encryption_key || generateEncryptionKey();

      // Encrypt the new content
      const encryptedData = await encryptData(contentBuffer, encryptionKey);

      // Convert encrypted data to blob
      const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });

      // Update file in storage
      const { error: uploadError } = await supabase.storage
        .from('files')
        .update(file.storage_path, encryptedBlob, {
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Update metadata in database
      await supabase
        .from('files')
        .update({ 
          size: newContent.length, // Original size
          encrypted_size: encryptedBlob.size,
          encryption_key: encryptionKey // Update if new
        })
        .eq('id', fileId);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete file
   */
  static async deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    try {
      const { data: file } = await supabase
        .from('files')
        .select('*')
        .eq('id', fileId)
        .eq('user_id', user.id)
        .single();

      if (!file) throw new Error('File not found');

      // Delete from storage
      await supabase.storage
        .from('files')
        .remove([file.storage_path]);

      // Delete from database
      const { error } = await supabase
        .from('files')
        .delete()
        .eq('id', fileId)
        .eq('user_id', user.id);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Rename file
   */
  static async renameFile(fileId: string, newName: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('files')
      .update({ name: newName })
      .eq('id', fileId)
      .eq('user_id', user.id);

    return !error;
  }

  // ==================== FOLDER OPERATIONS ====================

  /**
   * Create a new folder
   */
  static async createFolder(folderName: string, parentPath: string = ''): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;

    const { error } = await supabase
      .from('folders')
      .insert({
        user_id: user.id,
        name: folderName,
        path: folderPath,
        parent_folder: parentPath || null
      });

    return !error;
  }

  /**
   * Delete folder and optionally its contents
   */
  static async deleteFolder(
    folderPath: string,
    deleteContents: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    try {
      if (deleteContents) {
        // Delete all files in folder
        const { data: files } = await supabase
          .from('files')
          .select('id')
          .eq('user_id', user.id)
          .eq('parent_folder', folderPath);

        for (const file of files || []) {
          await this.deleteFile(file.id);
        }
      }

      // Delete folder
      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('user_id', user.id)
        .eq('path', folderPath);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * List all folders
   */
  static async listFolders(parentPath: string = ''): Promise<any[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const query = parentPath
      ? supabase.from('folders').select('*').eq('user_id', user.id).eq('parent_folder', parentPath)
      : supabase.from('folders').select('*').eq('user_id', user.id).is('parent_folder', null);

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  }

  // ==================== ORGANIZATION ====================

  /**
   * Organize files by type into categorized folders
   */
  static async organizeFilesByType(files: any[], currentPath: string = ''): Promise<FileOrganizationResult> {
    const result: FileOrganizationResult = {
      foldersCreated: [],
      filesMoved: [],
      summary: ''
    };

    const categories: Record<string, string[]> = {
      'Code Files': ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.html', '.css', '.php', '.rb', '.go', '.rs', '.swift'],
      'Documents': ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.odt'],
      'Spreadsheets': ['.xlsx', '.xls', '.csv', '.ods'],
      'Images': ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico'],
      'Videos': ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv'],
      'Audio': ['.mp3', '.wav', '.ogg', '.m4a', '.flac'],
      'Archives': ['.zip', '.rar', '.7z', '.tar', '.gz'],
      'Data': ['.json', '.xml', '.yaml', '.yml', '.sql', '.db']
    };

    const filesByCategory: Record<string, any[]> = {};

    for (const file of files) {
      if (!file.name) continue;
      
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();

      let categorized = false;
      for (const [category, extensions] of Object.entries(categories)) {
        if (extensions.includes(ext)) {
          if (!filesByCategory[category]) {
            filesByCategory[category] = [];
          }
          filesByCategory[category].push(file);
          categorized = true;
          break;
        }
      }

      if (!categorized) {
        if (!filesByCategory['Others']) {
          filesByCategory['Others'] = [];
        }
        filesByCategory['Others'].push(file);
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    for (const [category, categoryFiles] of Object.entries(filesByCategory)) {
      if (categoryFiles.length === 0) continue;

      const folderPath = currentPath ? `${currentPath}/${category}` : category;
      
      const { error: folderError } = await supabase
        .from('folders')
        .insert({
          user_id: user.id,
          name: category,
          path: folderPath,
          parent_folder: currentPath || null
        });

      if (!folderError) {
        result.foldersCreated.push(category);
      }

      for (const file of categoryFiles) {
        const { error: moveError } = await supabase
          .from('files')
          .update({ parent_folder: folderPath })
          .eq('id', file.id)
          .eq('user_id', user.id);

        if (!moveError) {
          result.filesMoved.push({
            from: file.parent_folder || 'Root',
            to: folderPath
          });
        }
      }
    }

    result.summary = `Organized ${result.filesMoved.length} files into ${result.foldersCreated.length} categories`;
    return result;
  }

  /**
   * Move files to a specific folder
   */
  static async moveFilesToFolder(fileIds: string[], targetFolder: string): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    let movedCount = 0;

    for (const fileId of fileIds) {
      const { error } = await supabase
        .from('files')
        .update({ parent_folder: targetFolder })
        .eq('id', fileId)
        .eq('user_id', user.id);

      if (!error) movedCount++;
    }

    return movedCount;
  }

  // ==================== CONTENT GENERATION ====================

  /**
   * Generate file content based on reference text
   */
  static async generateContentFromReference(
    referenceText: string,
    outputType: 'markdown' | 'code' | 'text',
    instructions: string
  ): Promise<string> {
    // This would call Gemini API through edge function
    const prompt = `Based on this reference text:\n\n${referenceText}\n\nGenerate ${outputType} content with these instructions: ${instructions}`;
    
    // For now, return a template
    return `// Generated ${outputType} content\n// Instructions: ${instructions}\n\n${referenceText}`;
  }

  /**
   * Generate code from description
   */
  static async generateCode(
    language: string,
    description: string,
    context?: string
  ): Promise<string> {
    const prompt = `Generate ${language} code for: ${description}${context ? `\n\nContext: ${context}` : ''}`;
    
    // This would call Gemini API
    return `// ${language} code for: ${description}\n// TODO: Implement with Gemini API`;
  }

  // ==================== UTILITY ====================

  /**
   * Get file type icon/category
   */
  static getFileCategory(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const categories: Record<string, string[]> = {
      'code': ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'html', 'css'],
      'document': ['pdf', 'doc', 'docx', 'txt', 'md'],
      'image': ['jpg', 'jpeg', 'png', 'gif', 'svg'],
      'video': ['mp4', 'avi', 'mov', 'mkv'],
      'audio': ['mp3', 'wav', 'ogg'],
      'archive': ['zip', 'rar', '7z', 'tar'],
      'data': ['json', 'xml', 'csv', 'sql']
    };

    for (const [category, exts] of Object.entries(categories)) {
      if (exts.includes(ext)) return category;
    }
    return 'other';
  }

  /**
   * Format file size
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
