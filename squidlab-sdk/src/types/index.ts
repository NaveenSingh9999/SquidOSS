/**
 * Core Types for SquidLab SDK
 */

export type Permission = 
  | 'files.read'
  | 'files.write'
  | 'files.delete'
  | 'user.profile'
  | 'storage.quota'
  | 'api.access'
  | 'notifications';

export interface ExtensionManifest {
  name: string;
  version: string;
  description: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  entry: string;
  permissions: Permission[];
  icons: {
    '16': string;
    '48': string;
    '128': string;
  };
  category: 'productivity' | 'utility' | 'analytics' | 'storage' | 'security' | 'entertainment' | 'developer';
  repository?: string;
  screenshots?: string[];
  homepage?: string;
}

export interface ExtensionConfig {
  manifest: ExtensionManifest;
  apiKey: string;
  userId: string;
  theme?: 'light' | 'dark';
  inAppMode?: boolean; // True when running inside SquidCloud dashboard
}

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  created_at: string;
  updated_at: string;
  folder_id?: string;
}

export interface FolderMetadata {
  id: string;
  name: string;
  parent_id?: string;
  created_at: string;
  updated_at: string;
  file_count?: number;
}

export interface FilePreviewData {
  id: string;
  name: string;
  type: string;
  size: number;
  preview_url?: string;
  thumbnail_url?: string;
  can_preview: boolean;
}

export interface EncryptionResult {
  encryptedData: Blob;
  key: string;
  algorithm: string;
  timestamp: string;
}

export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  avatar_url?: string;
}

export interface StorageQuota {
  used: number;
  total: number;
  percentage: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ToastOptions {
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  borderWidth?: number;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}
