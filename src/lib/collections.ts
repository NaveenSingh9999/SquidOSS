import { supabase } from "@/integrations/supabase/client";

export interface Collection {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  file_count?: number;
}

export interface SmartCollection {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  filter: (file: any) => boolean;
}

// Smart Collections - Virtual collections based on file types
export const SMART_COLLECTIONS: SmartCollection[] = [
  {
    id: 'docs',
    name: 'Documents',
    icon: 'FileText',
    color: '#3B82F6',
    description: 'PDFs, Word docs, text files, and documents',
    filter: (file) => {
      const docTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
        'application/rtf',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      const docExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.csv', '.xls', '.xlsx'];
      
      return docTypes.includes(file.type) || 
             docExtensions.some(ext => file.name?.toLowerCase().endsWith(ext));
    }
  },
  {
    id: 'media',
    name: 'Media',
    icon: 'Image',
    color: '#10B981',
    description: 'Images, videos, and audio files',
    filter: (file) => {
      return file.type?.startsWith('image/') || 
             file.type?.startsWith('video/') || 
             file.type?.startsWith('audio/');
    }
  },
  {
    id: 'archives',
    name: 'Archives',
    icon: 'Archive',
    color: '#F59E0B',
    description: 'ZIP, RAR, 7Z, and compressed files',
    filter: (file) => {
      const archiveTypes = [
        'application/zip',
        'application/x-zip-compressed',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
        'application/gzip',
        'application/x-tar'
      ];
      const archiveExtensions = ['.zip', '.rar', '.7z', '.gz', '.tar', '.tar.gz'];
      
      return archiveTypes.includes(file.type) || 
             archiveExtensions.some(ext => file.name?.toLowerCase().endsWith(ext));
    }
  },
  {
    id: 'code',
    name: 'Code',
    icon: 'Code',
    color: '#8B5CF6',
    description: 'Source code and development files',
    filter: (file) => {
      const codeTypes = [
        'application/javascript',
        'application/typescript',
        'text/javascript',
        'application/json',
        'application/xml',
        'text/html',
        'text/css'
      ];
      const codeExtensions = [
        '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
        '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.r',
        '.html', '.css', '.scss', '.sass', '.less', '.json', '.xml', '.yaml', '.yml',
        '.sql', '.sh', '.bat', '.ps1', '.dockerfile', '.gitignore', '.env'
      ];
      
      return codeTypes.includes(file.type) || 
             codeExtensions.some(ext => file.name?.toLowerCase().endsWith(ext));
    }
  },
  {
    id: 'others',
    name: 'Others',
    icon: 'FileQuestion',
    color: '#6B7280',
    description: 'Uncategorized files',
    filter: (file) => {
      // This will be the default for files that don't match other categories
      return true;
    }
  }
];

// Get files categorized by smart collections
export function categorizeFilesBySmartCollections(files: any[]): Record<string, any[]> {
  const categorized: Record<string, any[]> = {};
  
  // Initialize all smart collections
  SMART_COLLECTIONS.forEach(collection => {
    categorized[collection.id] = [];
  });
  
  files.forEach(file => {
    let categorized_file = false;
    
    // Check each smart collection (except 'others')
    for (const collection of SMART_COLLECTIONS.slice(0, -1)) {
      if (collection.filter(file)) {
        categorized[collection.id].push(file);
        categorized_file = true;
        break; // File goes into first matching category only
      }
    }
    
    // If not categorized, put in 'others'
    if (!categorized_file) {
      categorized['others'].push(file);
    }
  });
  
  return categorized;
}

// API Functions for Custom Collections

// Get all user collections with file counts
export async function getUserCollections(): Promise<Collection[]> {
  try {
    const { data, error } = await supabase.rpc('get_user_collections');
    
    if (error) {
      console.error("Error fetching collections:", error);
      throw error;
    }
    
    return data || [];
  } catch (error: any) {
    console.error("Error getting user collections:", error);
    throw new Error(error.message || "Failed to get collections");
  }
}

// Create a new collection
export async function createCollection(
  name: string,
  color?: string,
  icon?: string,
  description?: string
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('create_collection', {
      collection_name: name,
      collection_color: color,
      collection_icon: icon,
      collection_description: description
    });
    
    if (error) {
      console.error("Error creating collection:", error);
      throw error;
    }
    
    return data;
  } catch (error: any) {
    console.error("Error creating collection:", error);
    throw new Error(error.message || "Failed to create collection");
  }
}

// Update a collection
export async function updateCollection(
  id: string,
  updates: Partial<Pick<Collection, 'name' | 'color' | 'icon' | 'description'>>
): Promise<void> {
  throw new Error('Collections feature not yet available');
}

// Delete a collection
export async function deleteCollection(id: string): Promise<void> {
  throw new Error('Collections feature not yet available');
}

// Add file to collection
export async function addFileToCollection(collectionId: string, fileId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('add_file_to_collection', {
      collection_id_param: collectionId,
      file_id_param: fileId
    });
    
    if (error) {
      console.error("Error adding file to collection:", error);
      throw error;
    }
  } catch (error: any) {
    console.error("Error adding file to collection:", error);
    throw new Error(error.message || "Failed to add file to collection");
  }
}

// Remove file from collection
export async function removeFileFromCollection(collectionId: string, fileId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('remove_file_from_collection', {
      collection_id_param: collectionId,
      file_id_param: fileId
    });
    
    if (error) {
      console.error("Error removing file from collection:", error);
      throw error;
    }
  } catch (error: any) {
    console.error("Error removing file from collection:", error);
    throw new Error(error.message || "Failed to remove file from collection");
  }
}

// Get files in a collection
export async function getCollectionFiles(collectionId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('get_collection_files', {
      collection_id_param: collectionId
    });
    
    if (error) {
      console.error("Error fetching collection files:", error);
      throw error;
    }
    
    return data || [];
  } catch (error: any) {
    console.error("Error getting collection files:", error);
    throw new Error(error.message || "Failed to get collection files");
  }
}

// Get file's collections
export async function getFileCollections(fileId: string): Promise<Collection[]> {
  return [];
}

// Bulk operations
export async function addFilesToCollection(collectionId: string, fileIds: string[]): Promise<void> {
  try {
    const promises = fileIds.map(fileId => addFileToCollection(collectionId, fileId));
    await Promise.all(promises);
  } catch (error: any) {
    console.error("Error adding files to collection:", error);
    throw new Error(error.message || "Failed to add files to collection");
  }
}

export async function removeFilesFromCollection(collectionId: string, fileIds: string[]): Promise<void> {
  try {
    const promises = fileIds.map(fileId => removeFileFromCollection(collectionId, fileId));
    await Promise.all(promises);
  } catch (error: any) {
    console.error("Error removing files from collection:", error);
    throw new Error(error.message || "Failed to remove files from collection");
  }
}