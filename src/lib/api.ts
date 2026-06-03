import { supabase } from "@/integrations/supabase/client";
import { uploadFileWithRes54, downloadFileWithRes54 } from "./res54";
import { decryptData, encryptData, generateEncryptionKey } from "./encryption";
import { buildPublicUrl } from "@/lib/appLinks";
import { createSecureFileRecord, fetchFileEncryptionKey } from "@/lib/secure-file-metadata";

const ACTIVE_WORKSPACE_STORAGE_KEY = 'squid_active_workspace_id';
const ACTIVE_PROVIDER_TYPE_STORAGE_KEY = 'squid_active_provider_type';
const ACTIVE_PROVIDER_ID_STORAGE_KEY = 'squid_active_provider_id';
const isProductionBuild = import.meta.env.PROD;

type ActiveProviderType = 'squidcloud' | 'r2' | 'tebi';

const TEBI_PROXY_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const TEBI_ENCRYPTED_CHUNK_SIZE = 2 * 1024 * 1024;

interface TebiEncryptedChunkMetadata {
  index: number;
  path: string;
  size: number;
  offset: number;
}

interface TebiEncryptedFileMetadata {
  format: 'tebi_encrypted_v1';
  fileName: string;
  fileType: string;
  fileSize: number;
  chunkSize: number;
  chunks: TebiEncryptedChunkMetadata[];
  // Stored as 'managed_key' when the actual key is kept server-side. Legacy files may omit this field.
  encryptionKey?: string;
  created: string;
}

const devLog = (...args: unknown[]) => {
  if (!isProductionBuild) {
    console.log(...args);
  }
};

export function getActiveWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
}

export function getActiveProviderType(): string {
  if (typeof window === 'undefined') return 'squidcloud';
  const providerType = localStorage.getItem(ACTIVE_PROVIDER_TYPE_STORAGE_KEY);
  return providerType || 'squidcloud';
}

export function getActiveProviderId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_PROVIDER_ID_STORAGE_KEY);
}

function applyProviderScope(query: any, providerType: string, providerId: string | null) {
  if (providerType === 'squidcloud') {
    return query.is('storage_provider_id', null);
  }

  if (providerId) {
    return query.eq('storage_provider_id', providerId);
  }

  // No configured provider id for selected external provider: return no rows.
  return query.eq('storage_provider_id', '00000000-0000-0000-0000-000000000000');
}

function buildExternalObjectKey(
  userId: string,
  workspaceId: string | null,
  folderPath: string,
  fileName: string,
): string {
  const safeFolder = (folderPath || '').replace(/^\/+|\/+$/g, '');
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const basePrefix = `${userId}/${workspaceId || 'default-workspace'}`;

  if (safeFolder) {
    return `${basePrefix}/${safeFolder}/${ts}_${rand}_${safeName}`;
  }

  return `${basePrefix}/${ts}_${rand}_${safeName}`;
}

function textToBase64Data(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

async function signTebiObjectUpload(
  providerId: string,
  fileName: string,
  path: string,
  fileType: string
): Promise<string> {
  const { data: presignData, error: presignError } = await supabase.functions.invoke('api-file-upload-tebi', {
    body: {
      action: 'upload',
      fileName,
      fileType,
      path,
      providerId,
    },
  });

  if (presignError || !presignData?.success || !presignData?.uploadUrl) {
    throw new Error(presignError?.message || presignData?.error || 'Failed to prepare Tebi upload');
  }

  return presignData.uploadUrl as string;
}

async function uploadTebiPayloadWithFallback(
  providerId: string,
  objectPath: string,
  fileName: string,
  fileType: string,
  payload: string,
  onProgress?: (progress: number, stage?: string, details?: any) => void,
): Promise<void> {
  const uploadUrl = await signTebiObjectUpload(providerId, fileName, objectPath, fileType);

  try {
    const putResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: payload,
    });

    if (!putResponse.ok) {
      throw new Error(`Tebi upload failed (${putResponse.status})`);
    }
  } catch (directUploadError: any) {
    const payloadBytes = new TextEncoder().encode(payload).byteLength;
    if (payloadBytes > TEBI_PROXY_UPLOAD_MAX_BYTES) {
      throw new Error(
        `Direct Tebi upload failed and proxy fallback supports up to ${formatBytes(TEBI_PROXY_UPLOAD_MAX_BYTES)}. ` +
        `Please enable bucket CORS for larger files. Original error: ${directUploadError?.message || 'unknown error'}`
      );
    }

    onProgress?.(45, 'uploading', { provider: 'tebi', mode: 'proxy-fallback' });
    const { data: proxyData, error: proxyError } = await supabase.functions.invoke('api-file-upload-tebi', {
      body: {
        action: 'upload-proxy',
        fileName,
        fileType,
        path: objectPath,
        fileBase64: textToBase64Data(payload),
        providerId,
      },
    });

    if (proxyError || !proxyData?.success) {
      throw new Error(
        proxyError?.message ||
        proxyData?.error ||
        `Tebi upload failed: ${directUploadError?.message || 'direct upload failed and proxy fallback failed'}`
      );
    }
  }
}

async function uploadFileToTebi(
  file: File,
  folderPath: string,
  workspaceId: string | null,
  providerId: string,
  onProgress?: (progress: number, stage?: string, details?: any) => void
): Promise<FileItem> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');

  onProgress?.(5, 'preparing', { provider: 'tebi' });
  const objectKey = buildExternalObjectKey(user.id, workspaceId, folderPath, file.name);

  const encryptionKey = generateEncryptionKey();
  const totalChunks = Math.max(1, Math.ceil(file.size / TEBI_ENCRYPTED_CHUNK_SIZE));
  const chunkMetadata: TebiEncryptedChunkMetadata[] = [];

  for (let index = 0; index < totalChunks; index++) {
    const start = index * TEBI_ENCRYPTED_CHUNK_SIZE;
    const end = Math.min(start + TEBI_ENCRYPTED_CHUNK_SIZE, file.size);
    const chunkBuffer = await file.slice(start, end).arrayBuffer();
    const encryptedChunk = await encryptData(chunkBuffer, encryptionKey);
    const chunkPath = `${objectKey}.chunks/${String(index).padStart(6, '0')}.enc`;

    onProgress?.(10 + ((index / totalChunks) * 70), 'encrypting', {
      provider: 'tebi',
      current: index + 1,
      total: totalChunks,
    });

    await uploadTebiPayloadWithFallback(
      providerId,
      chunkPath,
      `${file.name}.chunk.${index}.enc`,
      'text/plain',
      encryptedChunk,
      onProgress,
    );

    chunkMetadata.push({
      index,
      path: chunkPath,
      size: end - start,
      offset: start,
    });
  }

  const encryptedMetadata: TebiEncryptedFileMetadata = {
    format: 'tebi_encrypted_v1',
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
    fileSize: file.size,
    chunkSize: TEBI_ENCRYPTED_CHUNK_SIZE,
    chunks: chunkMetadata,
    encryptionKey: 'managed_key',
    created: new Date().toISOString(),
  };

  onProgress?.(85, 'saving-metadata');
  const inserted = await createSecureFileRecord({
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    storagePath: 'tebi_external_encrypted',
    encrypted: true,
    encryptionKeyLabel: 'managed_key',
    metadata: JSON.stringify(encryptedMetadata),
    parentFolder: folderPath || null,
    workspaceId,
    storageProviderId: providerId,
    externalObjectKey: objectKey,
    encryptionKey,
  });

  onProgress?.(100, 'complete');
  return inserted as FileItem;
}

function parseTebiEncryptedMetadata(tags: unknown): TebiEncryptedFileMetadata | null {
  if (!Array.isArray(tags) || tags.length === 0 || typeof tags[0] !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(tags[0]) as TebiEncryptedFileMetadata;
    if (parsed?.format !== 'tebi_encrypted_v1' || !Array.isArray(parsed.chunks)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
  updated_at: string;
  encrypted: boolean;
  shared: boolean;
  user_id: string;
  storage_path: string;
  tags: string[];
  encryption_key?: string;
  github_repo?: string;
  preview_available?: boolean;
  preview_type?: string;
  processor?: string;
  path?: string;
  parent_folder?: string;
  workspace_id?: string;
  storage_provider_id?: string | null;
  external_object_key?: string | null;
  is_folder?: boolean;
  is_public?: boolean;
}

export interface ShareOptions {
  shareType: 'public' | 'user_specific';
  allowedUsers?: string[];
  expiresAt?: string | null;
  accessCode?: string;
  downloadLimit?: number;
  viewOnly?: boolean;
  requireEmail?: boolean;
  customMessage?: string;
}

export interface FolderItem {
  id: string;
  name: string;
  path: string;
  created_at: string;
  is_folder: boolean;
  parent_folder?: string;
  user_id: string;
  workspace_id?: string;
}

// Utility function to format bytes to human-readable format
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Get all files including virtual folders for a user
export async function getAllFiles(parentFolder: string = ""): Promise<(FileItem | FolderItem)[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const activeWorkspaceId = getActiveWorkspaceId();
    const activeProviderType = getActiveProviderType();
    const activeProviderId = getActiveProviderId();

    devLog('Getting all files for parent folder:', parentFolder);

    // Get files from database with proper folder filtering
    let query: any = supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false });

    if (activeWorkspaceId) {
      query = query.eq('workspace_id', activeWorkspaceId);
    } else {
      query = query.eq('user_id', user.id);
    }

    query = applyProviderScope(query, activeProviderType, activeProviderId);

    // Filter by parent folder
    if (parentFolder === "") {
      query = query.or('parent_folder.is.null,parent_folder.eq.');
    } else {
      query = query.eq('parent_folder', parentFolder);
    }

    const { data: dbFiles, error: dbError } = await query;
    
    if (dbError) {
      console.error("Error fetching files:", dbError);
      throw dbError;
    }

    devLog('Database files fetched:', Array.isArray(dbFiles) ? dbFiles.length : 0);

    // Get folders from the folders table with direct query
    let foldersQuery: any = supabase
      .from('folders')
      .select('*')
      .order('created_at', { ascending: false });

    if (activeWorkspaceId) {
      foldersQuery = foldersQuery.eq('workspace_id', activeWorkspaceId);
    } else {
      foldersQuery = foldersQuery.eq('user_id', user.id);
    }

    foldersQuery = applyProviderScope(foldersQuery, activeProviderType, activeProviderId);

    const { data: dbFolders, error: folderError } = await foldersQuery;

    if (folderError) {
      console.error("Error fetching folders:", folderError);
      // Don't throw, just continue without folders
    }

    devLog('Database folders fetched:', Array.isArray(dbFolders) ? dbFolders.length : 0);

    const allItems: (FileItem | FolderItem)[] = [...(dbFiles as FileItem[] || [])];
    
    // Add folders from database with proper filtering
    if (dbFolders && Array.isArray(dbFolders)) {
      // Filter folders by parent folder client-side
      const filteredFolders = dbFolders.filter((folder: any) => {
        if (parentFolder === "") {
          return !folder.parent_folder || folder.parent_folder === '';
        } else {
          return folder.parent_folder === parentFolder;
        }
      });

      filteredFolders.forEach((folder: any) => {
        allItems.push({
          id: folder.id,
          name: folder.name,
          path: folder.path,
          created_at: folder.created_at,
          is_folder: true,
          parent_folder: folder.parent_folder,
          user_id: folder.user_id
        });
      });
    }
    
    devLog('Combined items:', allItems.length);
    return allItems;
  } catch (error) {
    console.error("Error getting files:", error);
    throw error;
  }
}

// Enhanced getFiles with connection pooling and pagination
export async function getFiles(parentFolder: string = ""): Promise<FileItem[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const activeWorkspaceId = getActiveWorkspaceId();
    const activeProviderType = getActiveProviderType();
    const activeProviderId = getActiveProviderId();
    
    let query: any = supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false });

    if (activeWorkspaceId) {
      query = query.eq('workspace_id', activeWorkspaceId);
    } else {
      query = query.eq('user_id', user.id);
    }

    query = applyProviderScope(query, activeProviderType, activeProviderId);

    // Filter by parent folder
    if (parentFolder === "") {
      query = query.or('parent_folder.is.null,parent_folder.eq.');
    } else {
      query = query.eq('parent_folder', parentFolder);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching files:", error);
      throw error;
    }
    
    return data as FileItem[];
  } catch (error) {
    console.error("Error getting files:", error);
    throw error;
  }
}

// Enhanced get folders function
export async function getFolders(parentFolder: string = ""): Promise<FolderItem[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const activeWorkspaceId = getActiveWorkspaceId();
    const activeProviderType = getActiveProviderType();
    const activeProviderId = getActiveProviderId();

    // Use direct query to the folders table
    let query: any = supabase
      .from('folders')
      .select('*')
      .order('created_at', { ascending: false });

    if (activeWorkspaceId) {
      query = query.eq('workspace_id', activeWorkspaceId);
    } else {
      query = query.eq('user_id', user.id);
    }

    query = applyProviderScope(query, activeProviderType, activeProviderId);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching folders:", error);
      return [];
    }

    // Filter by parent folder client-side
    const filteredFolders = (data || []).filter((folder: any) => {
      if (parentFolder === "") {
        return !folder.parent_folder || folder.parent_folder === '';
      } else {
        return folder.parent_folder === parentFolder;
      }
    });

    return filteredFolders.map((folder: any) => ({
      id: folder.id,
      name: folder.name,
      path: folder.path,
      created_at: folder.created_at,
      is_folder: true,
      parent_folder: folder.parent_folder,
      user_id: folder.user_id
    }));
  } catch (error) {
    console.error("Error getting folders:", error);
    return [];
  }
}

// Optimized getFileById with faster retrieval
export async function getFileById(id: string): Promise<FileItem | null> {
  try {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error("Error fetching file by ID:", error);
      return null;
    }

    return data as FileItem;
  } catch (error) {
    console.error("Error getting file by ID:", error);
    return null;
  }
}

// Create a new folder
export async function createFolder(folderName: string, parentFolder: string = ""): Promise<FolderItem> {
  if (!folderName) {
    throw new Error("Folder name is required");
  }
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const activeWorkspaceId = getActiveWorkspaceId();
    const activeProviderType = getActiveProviderType();
    const activeProviderId = getActiveProviderId();

    devLog('Creating folder:', folderName, 'in parent:', parentFolder);

    // Create the folder path
    const folderPath = parentFolder 
      ? `${parentFolder}/${folderName}` 
      : folderName;
    
    const folderInsertData: Record<string, unknown> = {
      user_id: user.id,
      name: folderName,
      path: folderPath,
      parent_folder: parentFolder || null
    };

    if (activeWorkspaceId) {
      folderInsertData.workspace_id = activeWorkspaceId;
    }

    if (activeProviderType !== 'squidcloud') {
      if (!activeProviderId) {
        throw new Error('Selected provider is not configured. Please complete provider setup first.');
      }
      folderInsertData.storage_provider_id = activeProviderId;
    }

    // Insert into folders table
    const { data: folderData, error: insertError } = await (supabase
      .from('folders')
      .insert(folderInsertData as any)
      .select()
      .single()) as any;

    if (insertError) {
      console.error("Error creating folder in database:", insertError);
      throw new Error("Failed to create folder");
    }

    devLog('Created folder in database:', folderData?.id);

    // Only mirror folder creation to legacy GitHub storage for SquidCloud provider.
    if (activeProviderType === 'squidcloud') {
      try {
        const { data: repos } = await supabase
          .from('repositories')
          .select('repo_name')
          .eq('user_id', user.id);

        if (repos && repos.length > 0) {
          const repo = repos[0].repo_name;

          await supabase.functions.invoke('github-storage', {
            body: {
              action: 'create_folder',
              userId: user.id,
              folderName,
              path: parentFolder || "",
              repo
            }
          });
        }
      } catch (githubError) {
        console.error('Error creating folder in GitHub storage:', githubError);
        // Don't fail the whole operation if GitHub storage fails
      }
    }

    // Return the new folder item
    return {
      id: folderData.id,
      name: folderData.name,
      path: folderData.path,
      created_at: folderData.created_at,
      is_folder: true,
      parent_folder: folderData.parent_folder,
      user_id: folderData.user_id
    };
  } catch (error) {
    console.error("Error creating folder:", error);
    throw error;
  }
}

// Improved upload with folder support
export const uploadFile = async (
  file: File, 
  folderPath: string = "", 
  onProgress?: (progress: number, stage?: string, details?: any) => void
): Promise<FileItem> => {
  if (!file) {
    throw new Error("No file provided");
  }
  
  try {
    const activeWorkspaceId = getActiveWorkspaceId();
    const activeProviderType = getActiveProviderType();
    const activeProviderId = getActiveProviderId();

    const activeProvider = activeProviderType as ActiveProviderType;

    // External provider routes (Tebi) upload directly to provider object storage.
    if (activeProvider === 'tebi') {
      if (!activeProviderId) {
        throw new Error('Selected provider is not configured. Please complete provider setup first.');
      }
      return await uploadFileToTebi(file, folderPath, activeWorkspaceId, activeProviderId, onProgress);
    }

    // Default SquidCloud route uses existing RES54 pipeline.
    const { id } = await uploadFileWithRes54(file, onProgress);
    
    // Update the file with parent folder information if provided
    if (folderPath || activeWorkspaceId || activeProviderType !== 'squidcloud') {
      const updatePayload: Record<string, unknown> = {};
      if (folderPath) {
        updatePayload.parent_folder = folderPath;
      }
      if (activeWorkspaceId) {
        updatePayload.workspace_id = activeWorkspaceId;
      }
      if (activeProviderType !== 'squidcloud') {
        if (!activeProviderId) {
          throw new Error('Selected provider is not configured. Please complete provider setup first.');
        }
        updatePayload.storage_provider_id = activeProviderId;
      }

      const { error: updateError } = await supabase
        .from('files')
        .update(updatePayload as any)
        .eq('id', id);
        
      if (updateError) {
        console.error("Error updating parent folder:", updateError);
      }
    }
    
    // Fetch the created file record with complete details
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .single();
      
    if (error) throw error;
    
    // Add processor info if not present in database response
    const fileItem = data as FileItem;
    if (!fileItem.processor && fileItem.storage_path === "github_distributed") {
      (fileItem as any).processor = "res54";
    }
    
    return fileItem;
  } catch (error: any) {
    console.error("Error uploading file:", error);
    throw new Error(error.message || "Failed to upload file");
  }
}

// Compress multiple files into an archive
export async function compressFiles(
  files: FileItem[], 
  archiveName: string,
  archiveType: 'zip' | 'tar',
  parentFolder: string = "",
  onProgress?: (progress: number, stage: string, details?: any) => void
): Promise<FileItem> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    
    if (files.length === 0) {
      throw new Error("No files selected for compression");
    }
    
    const fileIds = files.map(file => file.id);
    
    // Call the compression edge function
    const response = await supabase.functions.invoke('file-operations', {
      body: { 
        action: 'compress', 
        fileIds,
        userId: user.id,
        archiveName,
        archiveType,
        parentFolder
      }
    });
    
    if (response.error || !response.data?.file) {
      throw new Error(response.error?.message || "Failed to compress files");
    }
    
    return response.data.file as FileItem;
  } catch (error: any) {
    console.error("Error compressing files:", error);
    throw new Error(error.message || "Failed to compress files");
  }
}

// Extract archive file
export async function extractArchive(
  fileId: string,
  destinationFolder: string = "",
  onProgress?: (progress: number, stage: string, details?: any) => void
): Promise<FileItem[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    
    // Call the extraction edge function
    const response = await supabase.functions.invoke('file-operations', {
      body: { 
        action: 'extract', 
        fileId,
        userId: user.id,
        destinationFolder
      }
    });
    
    if (response.error || !response.data?.files) {
      throw new Error(response.error?.message || "Failed to extract archive");
    }
    
    return response.data.files as FileItem[];
  } catch (error: any) {
    console.error("Error extracting archive:", error);
    throw new Error(error.message || "Failed to extract archive");
  }
}

// Enhanced download with retries, parallel processing, and better streaming
export async function downloadFile(fileId: string, onProgress?: (progress: number, stage: string, details?: any) => void): Promise<Blob> {
  try {
    const { data: fileRow, error: fileError } = await supabase
      .from('files')
      .select('id, storage_path, storage_provider_id, external_object_key, name, type, tags')
      .eq('id', fileId)
      .single();

    if (fileError || !fileRow) {
      throw new Error(fileError?.message || 'File metadata not found');
    }

    if (fileRow.storage_path === 'tebi_external_encrypted') {
      if (!fileRow.storage_provider_id) {
        throw new Error('Tebi file metadata is incomplete.');
      }

      const metadata = parseTebiEncryptedMetadata(fileRow.tags);
      if (!metadata) {
        throw new Error('Encrypted Tebi metadata is invalid or missing.');
      }

      const decryptionKey = metadata.encryptionKey === 'managed_key' || !metadata.encryptionKey
        ? await fetchFileEncryptionKey(fileRow.id)
        : metadata.encryptionKey;
      const sortedChunks = [...metadata.chunks].sort((a, b) => a.index - b.index);
      const decryptedChunks: ArrayBuffer[] = [];

      for (let index = 0; index < sortedChunks.length; index++) {
        const chunk = sortedChunks[index];

        onProgress?.(15 + ((index / Math.max(sortedChunks.length, 1)) * 70), 'downloading', {
          provider: 'tebi',
          current: index + 1,
          total: sortedChunks.length,
        });

        const { data: presignData, error: presignError } = await supabase.functions.invoke('api-file-upload-tebi', {
          body: {
            action: 'download',
            fileName: fileRow.name,
            path: chunk.path,
            providerId: fileRow.storage_provider_id,
          },
        });

        if (presignError || !presignData?.success || !presignData?.downloadUrl) {
          throw new Error(presignError?.message || presignData?.error || 'Failed to prepare Tebi chunk download');
        }

        const chunkResponse = await fetch(presignData.downloadUrl);
        if (!chunkResponse.ok) {
          throw new Error(`Tebi chunk download failed (${chunkResponse.status})`);
        }

        const encryptedPayload = await chunkResponse.text();
        const decrypted = await decryptData(encryptedPayload, decryptionKey);
        decryptedChunks.push(decrypted);
      }

      onProgress?.(100, 'complete');
      return new Blob(decryptedChunks, { type: metadata.fileType || fileRow.type || 'application/octet-stream' });
    }

    if (fileRow.storage_path === 'tebi_external') {
      if (!fileRow.storage_provider_id || !fileRow.external_object_key) {
        throw new Error('Tebi file metadata is incomplete.');
      }

      onProgress?.(20, 'preparing');

      const { data: presignData, error: presignError } = await supabase.functions.invoke('api-file-upload-tebi', {
        body: {
          action: 'download',
          fileName: fileRow.name,
          path: fileRow.external_object_key,
          providerId: fileRow.storage_provider_id,
        },
      });

      if (presignError || !presignData?.success || !presignData?.downloadUrl) {
        throw new Error(presignError?.message || presignData?.error || 'Failed to prepare Tebi download');
      }

      onProgress?.(60, 'downloading');
      const fileResponse = await fetch(presignData.downloadUrl);
      if (!fileResponse.ok) {
        throw new Error(`Tebi download failed (${fileResponse.status})`);
      }

      const blob = await fileResponse.blob();
      onProgress?.(100, 'complete');
      return blob;
    }

    // Use optimized Res54 technology for parallel downloads
    const blob = await downloadFileWithRes54(fileId, onProgress);
    return blob;
  } catch (error: any) {
    console.error("Error downloading file:", error);
    throw new Error(error.message || "Failed to download file");
  }
}

export async function deleteFile(id: string): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('delete_file_secure', { file_uuid: id });

    if (error || !data) {
      console.error("Error deleting file:", error);
      throw new Error(error?.message || 'Failed to delete file');
    }
  } catch (error) {
    console.error("Error deleting file:", error);
    throw error;
  }
}

export async function updateFile(id: string, updates: Partial<FileItem>): Promise<FileItem | null> {
  try {
    const { data, error } = await supabase
      .from('files')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error("Error updating file:", error);
      return null;
    }

    return data as FileItem;
  } catch (error) {
    console.error("Error updating file:", error);
    return null;
  }
}

export async function shareFile(id: string, shared: boolean = true): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('files')
      .update({ shared })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error("Error sharing file:", error);
      throw error;
    }

    // Generate a shareable link
    const shareLink = buildPublicUrl(`/share/${id}`);
    return shareLink;
  } catch (error) {
    console.error("Error sharing file:", error);
    throw new Error("Failed to generate share link");
  }
}

// Create a secure share for a file with advanced options
export async function createFileShare(
  fileId: string, 
  options?: ShareOptions
): Promise<{ shareId: string; shareUrl: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Authentication required');

    // Call RPC to create basic share
    const { data, error } = await supabase
      .rpc('create_file_share', { file_id_param: fileId });

    if (error) {
      console.error("Error creating file share:", error);
      throw new Error(error.message);
    }

    const shareId = data[0].share_id;

    // Update share with additional options if provided
    if (options) {
      const updateData: any = {
        share_type: options.shareType || 'public',
        allowed_users: options.allowedUsers || [],
      };

      if (options.expiresAt) {
        updateData.expires_at = options.expiresAt;
      }

      if (options.accessCode) {
        updateData.access_code = options.accessCode;
      }

      if (options.downloadLimit !== undefined) {
        updateData.download_limit = options.downloadLimit;
      }

      if (options.viewOnly !== undefined) {
        updateData.view_only = options.viewOnly;
      }

      if (options.requireEmail !== undefined) {
        updateData.require_email = options.requireEmail;
      }

      if (options.customMessage) {
        updateData.custom_message = options.customMessage;
      }

      const { error: updateError } = await supabase
        .from('shares')
        .update(updateData)
        .eq('share_id', shareId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error("Error updating share options:", updateError);
        // Don't throw - share is created, just options weren't applied
      }
    }

    // Explicitly update the 'shared' state on the actual file record
    await supabase.from('files').update({ shared: true }).eq('id', fileId);

    const shareUrl = buildPublicUrl(`/s/${shareId}`);
    return { shareId, shareUrl };
  } catch (error: any) {
    console.error("Error creating file share:", error);
    throw error;
  }
}

// Revoke a file share
export async function revokeFileShare(fileId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Authentication required');

    const { error } = await supabase
      .rpc('revoke_file_share', { file_id_param: fileId });

    if (error) {
      console.error("Error revoking file share:", error);
      throw new Error(error.message);
    }
    
    // Explicitly unset the 'shared' state on the actual file record
    await supabase.from('files').update({ shared: false }).eq('id', fileId);

    return true;
  } catch (error) {
    console.error("Error revoking file share:", error);
    throw error;
  }
}

// Get file information by file ID or share ID (supports both public and private access)
export async function getFileInfoById(id: string): Promise<any> {
  try {
    // First try to get as a shared file (public access)
    try {
      const sharedFileInfo = await getSharedFileInfo(id);
      return {
        ...sharedFileInfo,
        isShared: true,
        accessType: 'public'
      };
    } catch (shareError) {
      // If not a share ID, try to get as a regular file (authenticated access)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Authentication required");
      }

      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error) {
        throw error;
      }

      return {
        file_id: data.id,
        file_name: data.name,
        file_type: data.type,
        file_size: data.size,
        file_created_at: data.created_at,
        file_updated_at: data.updated_at,
        is_encrypted: data.encrypted,
        storage_path: data.storage_path,
        owner_id: data.user_id,
        isShared: false,
        accessType: 'private'
      };
    }
  } catch (error: any) {
    console.error("Error getting file info:", error);
    throw new Error(error.message || "Failed to get file information");
  }
}



// Check if a file has an active share
export async function getFileShareId(fileId: string): Promise<string | null> {
  const getFallbackShareId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: shareRow, error: fallbackError } = await supabase
      .from('shares')
      .select('share_id, expires_at')
      .eq('file_id', fileId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackError || !shareRow) {
      if (fallbackError) {
        console.error('Fallback share lookup failed:', fallbackError);
      }
      return null;
    }

    if (shareRow.expires_at) {
      const expiresAt = new Date(shareRow.expires_at);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
        return null;
      }
    }

    return shareRow.share_id;
  };

  try {
    const { data, error } = await supabase
      .rpc('get_file_share_id', { file_id_param: fileId });

    if (error) {
      console.error("Error getting file share ID:", error);
      return await getFallbackShareId();
    }

    return data as string | null;
  } catch (error: any) {
    console.error("Error getting file share ID:", error);
    return await getFallbackShareId();
  }
}

// Get shared file information (for public access)
export async function getSharedFileInfo(shareId: string): Promise<any> {
  try {
    const { data, error } = await supabase
      .rpc('get_shared_file_info', { share_id_param: shareId });

    if (error) {
      console.error("Error getting shared file info:", error);
      throw error;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new Error("Shared file not found or expired");
    }

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid shared file payload');
    }

    const { encryption_key: _ignoredEncryptionKey, ...safePayload } = raw as Record<string, unknown>;
    return safePayload;
  } catch (error: any) {
    console.error("Error getting shared file info:", error);
    throw new Error(error.message || "Failed to get shared file information");
  }
}

// Added the missing initializeRepos function
export async function initializeRepos(count: number, password?: string): Promise<string[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    
    // Use the supabase edge function to create repos
    const response = await supabase.functions.invoke('github-storage', {
      body: { 
        action: 'create-repos', 
        count, 
        userId: user.id,
        password
      }
    });

    if (response.error) {
      throw new Error(response.error.message || 'Failed to create repositories');
    }

    if (!response.data?.repos) {
      throw new Error('Invalid response from server');
    }

    return response.data.repos.map((repo: any) => repo.name) || [];
  } catch (error: any) {
    console.error('Error initializing repos:', error);
    throw new Error(error.message || 'Failed to initialize secure repositories');
  }
}

// Mark file as recently viewed (for use in the file explorer)
export async function markFileViewed(id: string): Promise<void> {
  try {
    await supabase
      .from('files')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);
  } catch (error) {
    console.error("Error marking file as viewed:", error);
  }
}

// Function to determine if a file is an archive
export function isArchiveFile(file: FileItem): boolean {
  const archiveExtensions = ['.zip', '.tar', '.gz', '.rar', '.7z'];
  const fileName = file.name.toLowerCase();
  return archiveExtensions.some(ext => fileName.endsWith(ext));
}

// Function to get appropriate icon for file type
export function getFileIcon(file: FileItem | FolderItem): string {
  if ('is_folder' in file && file.is_folder) {
    return 'folder';
  }
  
  const fileItem = file as FileItem;
  if (fileItem.type.startsWith('image/')) {
    return 'file-image';
  } else if (fileItem.type.startsWith('video/')) {
    return 'file-video';
  } else if (fileItem.type.startsWith('audio/')) {
    return 'file-audio';
  } else if (fileItem.type.includes('pdf') || fileItem.type.includes('document') || fileItem.type.includes('text')) {
    return 'file-text';
  } else if (isArchiveFile(fileItem)) {
    return 'file-archive';
  } else {
    return 'file';
  }
}

// Streaming video API functions
export interface StreamingManifestRequest {
  fileId: string;
  userId: string;
  requestedMaxQuality?: string;
  playbackMode?: 'streaming' | 'download';
}

export interface VideoQualityVariant {
  qualityId: string;
  label: string;
  playlistUrl: string;
  bandwidth: number;
  resolution?: string;
  codecs?: string;
}

export interface StreamingManifestResponse {
  masterManifestUrl: string;
  variants: VideoQualityVariant[];
  ttl: number;
  duration?: number;
  segmentDuration: number;
}

// Request HLS manifest for video streaming
export async function requestVideoManifest(
  fileId: string, 
  requestedMaxQuality: string = '1080p',
  playbackMode: 'streaming' | 'download' = 'streaming'
): Promise<StreamingManifestResponse> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      throw new Error('User not authenticated');
    }

    const response = await supabase.functions.invoke('media-manifest', {
      body: {
        fileId,
        userId: userData.user.id,
        requestedMaxQuality,
        playbackMode,
      },
    });

    if (response.error) {
      throw new Error(response.error.message || 'Failed to get video manifest');
    }

    return response.data;
  } catch (error) {
    console.error('Failed to request video manifest:', error);
    throw error;
  }
}

// Check if file supports streaming
export function supportsVideoStreaming(file: FileItem): boolean {
  // Check if it's a video file and uses Res54 encryption
  return file.type.startsWith('video/') && 
         file.encrypted && 
         file.storage_path === 'res54_distributed';
}

// Get estimated video duration (placeholder - would be improved with actual metadata)
export function estimateVideoDuration(file: FileItem): number {
  // Rough estimation based on file size and typical bitrates
  const avgBitrate = file.type.includes('h264') ? 2000000 : 1500000; // 2Mbps for H.264
  return Math.round((file.size * 8) / avgBitrate);
}

export interface VideoStreamUrlResponse {
  url: string;
  ttl_seconds: number;
  qualities: {
    id: string;
    label: string;
    bandwidth: number;
    url: string;
    height?: number;
    width?: number;
  }[];
  sessionId?: string;
}

// Request direct streaming URL for byte-range playback (HLS fallback)
export async function requestVideoStreamUrl(
  fileId: string,
  playbackMode: 'stream' | 'download' = 'stream'
): Promise<VideoStreamUrlResponse> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      throw new Error('User not authenticated');
    }

    const response = await supabase.functions.invoke('video-stream-url', {
      body: {
        fileId,
        requesterUserId: userData.user.id,
        playbackMode,
      },
    });

    if (response.error) {
      throw new Error(response.error.message || 'Failed to get stream URL');
    }

    return response.data;
  } catch (error) {
    console.error('Failed to request stream URL:', error);
    throw error;
  }
}

// ─── File Request API ────────────────────────────────────────────

export interface CreateFileRequestInput {
  title: string;
  description?: string;
  folderPath?: string;
  maxFiles?: number;
  maxSizePerFile?: number;
  allowedTypes?: string[];
  expiresAt?: string | null;
}

export async function createFileRequest(input: CreateFileRequestInput): Promise<{ id: string; slug: string; title: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');

  const { data, error } = await supabase.rpc('create_file_request', {
    p_user_id: user.id,
    p_title: input.title,
    p_description: input.description || '',
    p_folder_path: input.folderPath || '',
    p_max_files: input.maxFiles || 0,
    p_max_size_per_file: input.maxSizePerFile || 0,
    p_allowed_types: input.allowedTypes || null,
    p_expires_at: input.expiresAt || null,
  });

  if (error) throw new Error(error.message);
  return data as any;
}

export async function getFileRequestBySlug(slug: string): Promise<any> {
  const { data, error } = await supabase.rpc('get_file_request_by_slug', {
    request_slug: slug,
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function submitFileRequest(
  fileRequestId: string,
  fileId: string,
  fileName: string,
  fileSize: number,
  uploaderName?: string,
  uploaderEmail?: string,
): Promise<any> {
  const { data, error } = await supabase.rpc('submit_file_request', {
    p_file_request_id: fileRequestId,
    p_file_id: fileId,
    p_file_name: fileName,
    p_file_size: fileSize,
    p_uploader_name: uploaderName || '',
    p_uploader_email: uploaderEmail || '',
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function getMyFileRequests(): Promise<any[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');

  const { data, error } = await supabase
    .from('file_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getFileRequestSubmissions(fileRequestId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('file_request_submissions')
    .select('*, file:files(id, name, type, size)')
    .eq('file_request_id', fileRequestId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function toggleFileRequest(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('file_requests')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function deleteFileRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('file_requests')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
