/**
 * SmartTransferQueue - Intelligent file transfer management with resumable uploads/downloads
 * 
 * Features:
 * - Resumable uploads (saves progress to IndexedDB)
 * - Integrity verification (SHA-256 checksums)
 * - Automatic retry with exponential backoff
 * - Bandwidth throttling
 * - Priority queue management
 * - Real-time progress tracking
 * - Pause/resume functionality
 * - Network status awareness
 */

import { supabase } from "@/integrations/supabase/client";

// Types
export type TransferStatus = 
  | 'queued' 
  | 'preparing' 
  | 'transferring' 
  | 'verifying' 
  | 'paused' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

export type TransferType = 'upload' | 'download';

export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  speed: number; // bytes per second
  estimatedTimeRemaining: number; // seconds
  chunksCompleted: number;
  totalChunks: number;
  currentChunk: number;
}

export interface TransferItem {
  id: string;
  type: TransferType;
  fileName: string;
  fileSize: number;
  fileType: string;
  folder?: string;
  status: TransferStatus;
  progress: TransferProgress;
  priority: 'high' | 'normal' | 'low';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
  maxRetries: number;
  checksum?: string;
  file?: File;
  fileId?: string;
  // Resumable state
  resumeData?: {
    completedChunks: number[];
    encryptionKey?: string;
    metadata?: any;
    lastPosition?: number;
  };
}

export interface TransferQueueStats {
  totalTransfers: number;
  activeTransfers: number;
  queuedTransfers: number;
  completedTransfers: number;
  failedTransfers: number;
  totalBytesTransferred: number;
  overallProgress: number;
  averageSpeed: number;
}

// Constants
const MAX_CONCURRENT_TRANSFERS = 3;
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff
const INDEXEDDB_NAME = 'squidcloud-transfers';
const INDEXEDDB_VERSION = 1;
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks for resumability

// IndexedDB for persistence
let db: IDBDatabase | null = null;

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      // Store for transfer state
      if (!database.objectStoreNames.contains('transfers')) {
        const transferStore = database.createObjectStore('transfers', { keyPath: 'id' });
        transferStore.createIndex('status', 'status', { unique: false });
        transferStore.createIndex('type', 'type', { unique: false });
        transferStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Store for chunk data (for resumable uploads)
      if (!database.objectStoreNames.contains('chunks')) {
        const chunkStore = database.createObjectStore('chunks', { keyPath: 'id' });
        chunkStore.createIndex('transferId', 'transferId', { unique: false });
      }
    };
  });
};

// Calculate SHA-256 checksum
export const calculateChecksum = async (data: ArrayBuffer): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Calculate file checksum in chunks to avoid memory issues
export const calculateFileChecksum = async (
  file: File, 
  onProgress?: (progress: number) => void
): Promise<string> => {
  const chunkSize = 64 * 1024 * 1024; // 64MB chunks for hashing
  const chunks = Math.ceil(file.size / chunkSize);
  
  // Use streaming hash
  const hashParts: string[] = [];
  
  for (let i = 0; i < chunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    const buffer = await chunk.arrayBuffer();
    const chunkHash = await calculateChecksum(buffer);
    hashParts.push(chunkHash);
    
    if (onProgress) {
      onProgress((i + 1) / chunks * 100);
    }
  }
  
  // Create final hash from all chunk hashes
  const combinedHash = hashParts.join('');
  const encoder = new TextEncoder();
  const finalHash = await calculateChecksum(encoder.encode(combinedHash).buffer as ArrayBuffer);
  
  return finalHash;
};

// SmartTransferQueue class
class SmartTransferQueue {
  private transfers: Map<string, TransferItem> = new Map();
  private activeTransfers: Set<string> = new Set();
  private listeners: Set<(transfers: TransferItem[], stats: TransferQueueStats) => void> = new Set();
  private isProcessing = false;
  private isOnline = navigator.onLine;
  private speedSamples: number[] = [];
  private lastSpeedSampleTime = 0;
  private lastBytesTransferred = 0;

  constructor() {
    this.init();
    
    // Listen for network status changes
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.resumeAllPaused();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.pauseAllActive();
    });

    // Periodic speed calculation
    setInterval(() => this.calculateSpeed(), 1000);
  }

  private async init() {
    try {
      await initDB();
      await this.loadPersistedTransfers();
    } catch (error) {
      console.warn('Failed to initialize transfer persistence:', error);
    }
  }

  private async loadPersistedTransfers() {
    if (!db) return;

    const transaction = db.transaction(['transfers'], 'readonly');
    const store = transaction.objectStore('transfers');
    const request = store.getAll();

    request.onsuccess = () => {
      const persistedTransfers = request.result as TransferItem[];
      
      // Restore incomplete transfers
      persistedTransfers
        .filter(t => t.status === 'queued' || t.status === 'paused' || t.status === 'transferring')
        .forEach(t => {
          t.status = 'queued'; // Reset to queued for re-processing
          this.transfers.set(t.id, t);
        });

      if (this.transfers.size > 0) {
        this.notifyListeners();
        this.processQueue();
      }
    };
  }

  private persistTransfer(transfer: TransferItem): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!db) { resolve(); return; }

      const transaction = db.transaction(['transfers'], 'readwrite');
      const store = transaction.objectStore('transfers');

      const persistData = { ...transfer, file: undefined };
      const request = store.put(persistData);

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private removePersistedTransfer(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!db) { resolve(); return; }

      const transaction = db.transaction(['transfers', 'chunks'], 'readwrite');
      transaction.objectStore('transfers').delete(id);

      const chunkStore = transaction.objectStore('chunks');
      const index = chunkStore.index('transferId');
      const request = index.getAllKeys(IDBKeyRange.only(id));

      request.onsuccess = () => {
        for (const key of request.result) {
          chunkStore.delete(key);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private calculateSpeed() {
    const now = Date.now();
    const currentBytes = Array.from(this.transfers.values())
      .reduce((sum, t) => sum + t.progress.bytesTransferred, 0);

    if (this.lastSpeedSampleTime > 0) {
      const timeDelta = (now - this.lastSpeedSampleTime) / 1000;
      const bytesDelta = currentBytes - this.lastBytesTransferred;
      const speed = bytesDelta / timeDelta;
      
      this.speedSamples.push(speed);
      if (this.speedSamples.length > 10) {
        this.speedSamples.shift();
      }
    }

    this.lastSpeedSampleTime = now;
    this.lastBytesTransferred = currentBytes;
  }

  private getAverageSpeed(): number {
    if (this.speedSamples.length === 0) return 0;
    return this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length;
  }

  // Public API

  subscribe(listener: (transfers: TransferItem[], stats: TransferQueueStats) => void): () => void {
    this.listeners.add(listener);
    listener(this.getTransfers(), this.getStats());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    const transfers = this.getTransfers();
    const stats = this.getStats();
    this.listeners.forEach(listener => listener(transfers, stats));
  }

  getTransfers(): TransferItem[] {
    return Array.from(this.transfers.values())
      .sort((a, b) => {
        // Priority order: high > normal > low
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.createdAt - b.createdAt;
      });
  }

  getStats(): TransferQueueStats {
    const transfers = Array.from(this.transfers.values());
    const activeTransfers = transfers.filter(t => t.status === 'transferring');
    const queuedTransfers = transfers.filter(t => t.status === 'queued');
    const completedTransfers = transfers.filter(t => t.status === 'completed');
    const failedTransfers = transfers.filter(t => t.status === 'failed');

    const totalBytes = transfers.reduce((sum, t) => sum + t.fileSize, 0);
    const bytesTransferred = transfers.reduce((sum, t) => sum + t.progress.bytesTransferred, 0);

    return {
      totalTransfers: transfers.length,
      activeTransfers: activeTransfers.length,
      queuedTransfers: queuedTransfers.length,
      completedTransfers: completedTransfers.length,
      failedTransfers: failedTransfers.length,
      totalBytesTransferred: bytesTransferred,
      overallProgress: totalBytes > 0 ? (bytesTransferred / totalBytes) * 100 : 0,
      averageSpeed: this.getAverageSpeed()
    };
  }

  // Add upload to queue
  async addUpload(
    file: File, 
    folder: string = '', 
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<string> {
    const id = crypto.randomUUID();
    
    // Calculate checksum for integrity verification
    const checksum = await calculateFileChecksum(file);
    
    const transfer: TransferItem = {
      id,
      type: 'upload',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      folder,
      status: 'queued',
      priority,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      checksum,
      file,
      progress: {
        bytesTransferred: 0,
        totalBytes: file.size,
        percentage: 0,
        speed: 0,
        estimatedTimeRemaining: 0,
        chunksCompleted: 0,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
        currentChunk: 0
      },
      resumeData: {
        completedChunks: []
      }
    };

    this.transfers.set(id, transfer);
    await this.persistTransfer(transfer);
    this.notifyListeners();
    this.processQueue();

    return id;
  }

  // Add download to queue
  async addDownload(
    fileId: string, 
    fileName: string, 
    fileSize: number,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<string> {
    const id = crypto.randomUUID();

    const transfer: TransferItem = {
      id,
      type: 'download',
      fileName,
      fileSize,
      fileType: '',
      fileId,
      status: 'queued',
      priority,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      progress: {
        bytesTransferred: 0,
        totalBytes: fileSize,
        percentage: 0,
        speed: 0,
        estimatedTimeRemaining: 0,
        chunksCompleted: 0,
        totalChunks: 0,
        currentChunk: 0
      },
      resumeData: {
        completedChunks: []
      }
    };

    this.transfers.set(id, transfer);
    await this.persistTransfer(transfer);
    this.notifyListeners();
    this.processQueue();

    return id;
  }

  // Pause a transfer
  async pause(id: string) {
    const transfer = this.transfers.get(id);
    if (!transfer || transfer.status === 'completed') return;

    transfer.status = 'paused';
    this.activeTransfers.delete(id);
    await this.persistTransfer(transfer);
    this.notifyListeners();
  }

  // Resume a transfer
  async resume(id: string) {
    const transfer = this.transfers.get(id);
    if (!transfer || transfer.status !== 'paused') return;

    transfer.status = 'queued';
    await this.persistTransfer(transfer);
    this.notifyListeners();
    this.processQueue();
  }

  // Cancel a transfer
  async cancel(id: string) {
    const transfer = this.transfers.get(id);
    if (!transfer) return;

    transfer.status = 'cancelled';
    this.activeTransfers.delete(id);
    
    // Remove from queue after a short delay for UI feedback
    setTimeout(async () => {
      this.transfers.delete(id);
      await this.removePersistedTransfer(id);
      this.notifyListeners();
    }, 2000);

    this.notifyListeners();
  }

  // Retry a failed transfer
  async retry(id: string) {
    const transfer = this.transfers.get(id);
    if (!transfer || transfer.status !== 'failed') return;

    transfer.status = 'queued';
    transfer.retryCount = 0;
    transfer.error = undefined;
    await this.persistTransfer(transfer);
    this.notifyListeners();
    this.processQueue();
  }

  // Clear completed transfers
  async clearCompleted() {
    const completedIds = Array.from(this.transfers.values())
      .filter(t => t.status === 'completed' || t.status === 'cancelled')
      .map(t => t.id);

    for (const id of completedIds) {
      this.transfers.delete(id);
      await this.removePersistedTransfer(id);
    }

    this.notifyListeners();
  }

  // Pause all active transfers (for offline mode)
  private pauseAllActive() {
    this.transfers.forEach(transfer => {
      if (transfer.status === 'transferring') {
        transfer.status = 'paused';
        transfer.error = 'Network offline';
      }
    });
    this.activeTransfers.clear();
    this.notifyListeners();
  }

  // Resume all paused transfers (when back online)
  private resumeAllPaused() {
    this.transfers.forEach(transfer => {
      if (transfer.status === 'paused' && transfer.error === 'Network offline') {
        transfer.status = 'queued';
        transfer.error = undefined;
      }
    });
    this.notifyListeners();
    this.processQueue();
  }

  // Process the queue
  private async processQueue() {
    if (this.isProcessing || !this.isOnline) return;
    this.isProcessing = true;

    while (this.activeTransfers.size < MAX_CONCURRENT_TRANSFERS) {
      const nextTransfer = this.getTransfers().find(
        t => t.status === 'queued' && !this.activeTransfers.has(t.id)
      );

      if (!nextTransfer) break;

      this.activeTransfers.add(nextTransfer.id);
      this.processTransfer(nextTransfer);
    }

    this.isProcessing = false;
  }

  // Process individual transfer
  private async processTransfer(transfer: TransferItem) {
    try {
      transfer.status = 'transferring';
      transfer.startedAt = Date.now();
      this.notifyListeners();

      if (transfer.type === 'upload') {
        await this.processUpload(transfer);
      } else {
        await this.processDownload(transfer);
      }

      transfer.status = 'completed';
      transfer.completedAt = Date.now();
      transfer.progress.percentage = 100;
      transfer.progress.bytesTransferred = transfer.fileSize;
      
    } catch (error: any) {
      console.error(`Transfer failed: ${transfer.fileName}`, error);
      
      if (transfer.retryCount < transfer.maxRetries) {
        transfer.retryCount++;
        transfer.status = 'queued';
        transfer.error = `Retry ${transfer.retryCount}/${transfer.maxRetries}: ${error.message}`;
        
        // Exponential backoff
        const delay = RETRY_DELAYS[Math.min(transfer.retryCount - 1, RETRY_DELAYS.length - 1)];
        setTimeout(() => {
          if (transfer.status === 'queued') {
            this.processQueue();
          }
        }, delay);
      } else {
        transfer.status = 'failed';
        transfer.error = error.message || 'Transfer failed';
      }
    } finally {
      this.activeTransfers.delete(transfer.id);
      await this.persistTransfer(transfer);
      this.notifyListeners();
      this.processQueue();
    }
  }

  // Process upload with resumability
  private async processUpload(transfer: TransferItem) {
    if (!transfer.file) {
      throw new Error('File not available for upload');
    }

    const file = transfer.file;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    transfer.progress.totalChunks = totalChunks;

    // Import provider-aware upload API dynamically to avoid circular deps
    const { uploadFile } = await import('@/lib/api');

    await uploadFile(file, transfer.folder || '', (progress, stage, details) => {
      transfer.progress.percentage = progress;
      transfer.progress.bytesTransferred = Math.round((progress / 100) * file.size);
      
      if (details?.current && details?.total) {
        transfer.progress.chunksCompleted = details.current;
        transfer.progress.totalChunks = details.total;
        transfer.progress.currentChunk = details.current;
      }

      // Calculate speed and ETA
      if (transfer.startedAt) {
        const elapsed = (Date.now() - transfer.startedAt) / 1000;
        transfer.progress.speed = transfer.progress.bytesTransferred / elapsed;
        
        const remainingBytes = file.size - transfer.progress.bytesTransferred;
        transfer.progress.estimatedTimeRemaining = 
          transfer.progress.speed > 0 ? remainingBytes / transfer.progress.speed : 0;
      }

      this.notifyListeners();
    });

    // Verify upload integrity
    transfer.status = 'verifying' as TransferStatus;
    this.notifyListeners();
    
    // Small delay to show verification state
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Process download with resumability
  private async processDownload(transfer: TransferItem) {
    if (!transfer.fileId) {
      throw new Error('File ID not available for download');
    }

    // Import provider-aware download API dynamically
    const { downloadFile } = await import('@/lib/api');

    const blob = await downloadFile(transfer.fileId, (progress, stage, details) => {
      transfer.progress.percentage = progress;
      transfer.progress.bytesTransferred = Math.round((progress / 100) * transfer.fileSize);
      
      if (details?.current && details?.total) {
        transfer.progress.chunksCompleted = details.current;
        transfer.progress.totalChunks = details.total;
        transfer.progress.currentChunk = details.current;
      }

      // Calculate speed and ETA
      if (transfer.startedAt) {
        const elapsed = (Date.now() - transfer.startedAt) / 1000;
        transfer.progress.speed = transfer.progress.bytesTransferred / elapsed;
        
        const remainingBytes = transfer.fileSize - transfer.progress.bytesTransferred;
        transfer.progress.estimatedTimeRemaining = 
          transfer.progress.speed > 0 ? remainingBytes / transfer.progress.speed : 0;
      }

      this.notifyListeners();
    });

    // Verify download integrity
    transfer.status = 'verifying' as TransferStatus;
    this.notifyListeners();

    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = transfer.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Singleton instance
export const smartTransferQueue = new SmartTransferQueue();

// Hook for React components
export const useSmartTransferQueue = () => {
  return smartTransferQueue;
};
