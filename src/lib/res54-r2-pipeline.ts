import { supabase } from "@/integrations/supabase/client";
import { encryptData, decryptData, generateEncryptionKey } from "./encryption";
import { getLoadBalancer } from "@/services/load-balancer";
import { generateSalt, arrayBufferToBase64 as arrayToBase64 } from "@/lib/key-derivation";
import { requestEphemeralBYOKKey, type BYOKPromptReason } from '@/services/ephemeral-byok-prompt';

const isProductionBuild = import.meta.env.PROD;
const ACTIVE_WORKSPACE_STORAGE_KEY = 'squid_active_workspace_id';

const devLog = (...args: unknown[]) => {
  if (!isProductionBuild) {
    console.log(...args);
  }
};

const devWarn = (...args: unknown[]) => {
  if (!isProductionBuild) {
    console.warn(...args);
  }
};

const getActiveWorkspaceId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
};

const getChunkStoragePath = (userId: string, chunkId: string): string => {
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId) {
    return `${userId}/${chunkId}.json`;
  }
  return `${userId}/${workspaceId}/${chunkId}.json`;
};

type Res54ProgressCallback = (progress: number, stage: string, details?: any) => void;

export interface Res54DownloadOptions {
  reason?: BYOKPromptReason;
  fileName?: string;
}

interface BYOKRuntimePolicy {
  enabled: boolean;
  strictMode: boolean;
  allowDefaultFallback: boolean;
  promptEveryDecrypt: boolean;
  hasAccountKey: boolean;
}

const getBYOKRuntimePolicy = async (userId: string): Promise<BYOKRuntimePolicy> => {
  try {
    const { data, error } = await supabase
      .from('user_encryption_settings')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return {
        enabled: false,
        strictMode: true,
        allowDefaultFallback: true,
        promptEveryDecrypt: true,
        hasAccountKey: false,
      };
    }

    const settings = (data.settings || {}) as Record<string, any>;

    return {
      enabled: Boolean(settings.byok_enabled),
      strictMode: settings.strict_mode ?? true,
      allowDefaultFallback: settings.allow_default_fallback ?? true,
      promptEveryDecrypt: settings.prompt_every_decrypt ?? true,
      hasAccountKey: Boolean(settings.account_key_hash),
    };
  } catch (error) {
    devWarn('Failed to load BYOK runtime policy');
    return {
      enabled: false,
      strictMode: true,
      allowDefaultFallback: true,
      promptEveryDecrypt: true,
      hasAccountKey: false,
    };
  }
};

// Res54 - Advanced file processing system with load balancing
// Implements parallel uploads/downloads, intelligent chunking, load balancing for 500+ operations

// Web Worker support for non-blocking encryption
let encryptionWorker: Worker | null = null;

// Initialize encryption worker
const getEncryptionWorker = (): Worker => {
  if (!encryptionWorker) {
    try {
      // Create worker from upload-worker.ts
      encryptionWorker = new Worker(
        new URL('../workers/upload-worker.ts', import.meta.url),
        { type: 'module' }
      );
      devLog('Encryption worker initialized');
    } catch (error) {
      devWarn('Web Worker not available, using main thread:', error);
    }
  }
  return encryptionWorker!;
};

// Encrypt chunk using Load Balancer + Web Worker (non-blocking)
const encryptChunkWithWorker = async (chunkData: ArrayBuffer, encryptionKey: string, index: number): Promise<string> => {
  const loadBalancer = getLoadBalancer();
  
  return loadBalancer.execute(
    () => new Promise<string>((resolve, reject) => {
      const worker = getEncryptionWorker();
      
      if (!worker) {
        encryptData(chunkData, encryptionKey)
          .then(resolve)
          .catch(reject);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error(`Encryption timeout for chunk ${index}`));
      }, 60000); 

      const handler = (event: MessageEvent) => {
        if (event.data.index === index) {
          clearTimeout(timeout);
          worker.removeEventListener('message', handler);
          
          if (event.data.type === 'chunk-encrypted') {
            resolve(event.data.data);
          } else if (event.data.type === 'error') {
            reject(new Error(event.data.error));
          }
        }
      };

      worker.addEventListener('message', handler);
      worker.postMessage(
        {
          type: 'encrypt-chunk',
          chunkData,
          encryptionKey,
          index,
        },
        [chunkData]
      );
    }),
    {
      priority: 3, 
      poolType: 'encryption',
      tags: ['encryption', 'chunk', `chunk-${index}`],
      timeout: 65000 
    }
  );
};

interface ChunkMetadata {
  index: number;
  totalChunks: number;
  size: number;
  offset: number;
  sha256: string;
  repo?: string;
  path?: string;
  accountId?: number;
}

interface Res54FileMetadata {
  fileName: string;
  fileType: string;
  fileSize: number;
  chunks: ChunkMetadata[];
  encryptionKey: string;
  created: string;
  previewAvailable: boolean;
  previewType?: string;
  previewPath?: string;
}

const MAX_PARALLEL_OPERATIONS = 12;
const MAX_RETRIES = 5;
const RETRY_DELAY_BASE = 500;
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;
const VERY_LARGE_FILE_THRESHOLD = 300 * 1024 * 1024;

const CHUNK_SIZE_SMALL = 1.5 * 1024 * 1024;
const CHUNK_SIZE_MEDIUM = 2 * 1024 * 1024;
const CHUNK_SIZE_LARGE = 2.5 * 1024 * 1024;
const CHUNK_SIZE_XLARGE = 2 * 1024 * 1024;

const BATCH_SIZE = 8;
const BATCH_SIZE_LARGE_FILE = 4;
const STREAMING_BATCH_SIZE = 6;

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    const binaryString = String.fromCharCode.apply(null, Array.from(chunk));
    chunks.push(binaryString);
  }
  
  return btoa(chunks.join(''));
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  try {
    const binaryString = atob(base64.replace(/\s/g, ''));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
    console.error('Base64 conversion error:', e);
    throw new Error('Invalid base64 data');
  }
};

export const determineChunkingStrategy = (fileSize: number): number => {
  if (fileSize > VERY_LARGE_FILE_THRESHOLD) {
    return CHUNK_SIZE_XLARGE;
  } else if (fileSize > LARGE_FILE_THRESHOLD) {
    return CHUNK_SIZE_LARGE;
  } else if (fileSize > 10 * 1024 * 1024) {
    return CHUNK_SIZE_MEDIUM;
  } else {
    return CHUNK_SIZE_SMALL;
  }
};

const getBatchSize = (fileSize: number): number => {
  if (fileSize > VERY_LARGE_FILE_THRESHOLD) {
    return BATCH_SIZE_LARGE_FILE;
  } else if (fileSize > LARGE_FILE_THRESHOLD) {
    return BATCH_SIZE;
  }
  return BATCH_SIZE;
};

const validateChunkData = (chunk: ArrayBuffer): boolean => {
  return chunk instanceof ArrayBuffer && chunk.byteLength > 0;
};

const readFileChunk = async (file: File, start: number, end: number): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const chunk = file.slice(start, end);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        if (validateChunkData(buffer)) {
          resolve(buffer);
        } else {
          reject(new Error('Invalid chunk data'));
        }
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(chunk);
  });
};

export const createFileChunks = async (
  file: File, 
  progressCallback?: (progress: number) => void
): Promise<{
  chunks: ArrayBuffer[],
  metadata: Res54FileMetadata
}> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required");

  const byokPolicy = await getBYOKRuntimePolicy(user.id);
  const isBYOKActive = byokPolicy.enabled;
  
  let encryptionKey = '';
  if (isBYOKActive) {
    const key = await requestEphemeralBYOKKey({
      reason: 'encrypt',
      fileName: file.name,
      title: 'BYOK key required',
      description: 'This file will be protected with Bring Your Own Key. Enter your encryption key.',
    });
    if (!key) throw new Error("BYOK key is required for upload.");
    encryptionKey = key.trim();
  } else {
    encryptionKey = generateEncryptionKey();
  }

  const chunkSize = determineChunkingStrategy(file.size);
  const totalChunks = Math.ceil(file.size / chunkSize);
  const chunks: ArrayBuffer[] = [];
  const chunkMetadata: ChunkMetadata[] = [];
  let offset = 0;
  
  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size);
    
    try {
      const chunkBuffer = await readFileChunk(file, offset, end);
      
      chunks.push(chunkBuffer);
      chunkMetadata.push({
        index: chunks.length - 1,
        totalChunks,
        size: chunkBuffer.byteLength,
        offset: offset,
        sha256: file.size > LARGE_FILE_THRESHOLD
          ? ''
          : await calculateSHA256(new Uint8Array(chunkBuffer))
      });
      
      if (progressCallback) {
        progressCallback((offset / file.size) * 50);
      }
    } catch (error) {
      console.error(`Error reading chunk at offset ${offset}:`, error);
      throw new Error(`Failed to read file chunk: ${error.message}`);
    }
    
    offset += chunkSize;
  }
  
  const metadata: Res54FileMetadata = {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    chunks: chunkMetadata,
    encryptionKey,
    created: new Date().toISOString(),
    previewAvailable: false
  };
  
  return { chunks, metadata };
};

async function calculateSHA256(data: Uint8Array): Promise<string> {
  try {
    const buffer = data.buffer instanceof ArrayBuffer ? data.buffer : data.buffer.slice(0);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Hash calculation error:', error);
    throw new Error('Failed to calculate hash');
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const backoffDelay = (attempt: number) => Math.min(RETRY_DELAY_BASE * Math.pow(2, attempt), 30000);

async function processChunksInParallel<T>(
  chunks: any[], 
  processor: (chunk: any, index: number, attempt: number) => Promise<T>,
  concurrency: number = MAX_PARALLEL_OPERATIONS,
  progressCallback?: (progress: number, stage: string, details?: any) => void
): Promise<T[]> {
  const results: T[] = new Array(chunks.length);
  let completed = 0;
  let running = 0;
  let nextIndex = 0;
  let retryQueue: {index: number, attempt: number, delay: number}[] = [];
  let failed: {index: number, error: any}[] = [];
  
  return new Promise((resolve, reject) => {
    async function processNext(): Promise<void> {
      if (completed + failed.length === chunks.length) {
        if (failed.length === 0) {
          resolve(results);
        } else {
          console.error(`Failed to process ${failed.length} chunks: ${failed.map(f => `${f.index}: ${f.error.message || 'Unknown error'}`).join(', ')}`);
          reject(new Error(`Failed to process ${failed.length} chunks. Last error: ${failed[0].error.message || 'Unknown error'}`));
        }
        return;
      }
      
      if (retryQueue.length > 0) {
        retryQueue.sort((a, b) => a.delay - b.delay);
        
        const {index, attempt, delay: waitTime} = retryQueue.shift()!;
        
        await delay(waitTime);
        
        running++;
        try {
          results[index] = await processor(chunks[index], index, attempt);
          completed++;
          
          if (progressCallback) {
            progressCallback((completed / chunks.length) * 100, 'processing', {
              current: completed,
              total: chunks.length,
              retry: attempt > 0
            });
          }
        } catch (error) {
          if (attempt < MAX_RETRIES) {
            devWarn(`Retrying chunk ${index}, attempt ${attempt + 1}`);
            const newDelay = backoffDelay(attempt);
            retryQueue.push({index, attempt: attempt + 1, delay: newDelay});
          } else {
            console.error(`Failed to process chunk ${index} after ${MAX_RETRIES} attempts:`, error);
            failed.push({index, error});
          }
        } finally {
          running--;
          processNext();
        }
        return;
      }
      
      if (nextIndex < chunks.length && running < concurrency) {
        const index = nextIndex++;
        running++;
        
        try {
          results[index] = await processor(chunks[index], index, 0);
          completed++;
          
          if (progressCallback) {
            progressCallback((completed / chunks.length) * 100, 'processing', {
              current: completed,
              total: chunks.length
            });
          }
        } catch (error) {
          devWarn(`Initial failure for chunk ${index}, adding to retry queue`);
          retryQueue.push({index, attempt: 1, delay: backoffDelay(0)});
        } finally {
          running--;
          processNext();
        }
      }
    }
    
    const initialBatch = Math.min(concurrency, chunks.length);
    for (let i = 0; i < initialBatch; i++) {
      processNext();
    }
  });
}

// Enhanced file upload with parallel processing and Cloudflare R2 presigned URLs
export const uploadFileWithRes54 = async (
  file: File,
  progressCallback?: (progress: number, stage: string, details?: any) => void
): Promise<{
  id: string,
  metadata: Res54FileMetadata,
  encryptionKey: string
}> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required");

  if (file.size === 0) {
    throw new Error('File is empty');
  }
  
  if (file.size > LARGE_FILE_THRESHOLD) {
    progressCallback?.(0, 'preparing', { message: 'Preparing large file upload strategy' });
  }

  progressCallback?.(0, 'preparing');

  const useStreamingUpload = file.size > LARGE_FILE_THRESHOLD;
  const chunkSize = determineChunkingStrategy(file.size);
  const totalChunks = Math.ceil(file.size / chunkSize);

  let chunks: ArrayBuffer[] = [];
  let metadata: Res54FileMetadata;

  const byokPolicy = await getBYOKRuntimePolicy(user.id);
  const isBYOKActive = byokPolicy.enabled;
  
  let encryptionKey = '';
  if (isBYOKActive) {
    const key = await requestEphemeralBYOKKey({
      reason: 'encrypt',
      fileName: file.name,
      title: 'BYOK key required',
      description: 'This file will be protected with Bring Your Own Key. Enter your encryption key.',
    });
    if (!key) throw new Error("BYOK key is required for upload.");
    encryptionKey = key.trim();
  } else {
    encryptionKey = generateEncryptionKey();
  }

  if (useStreamingUpload) {
    const chunkMetadata: ChunkMetadata[] = [];

    for (let index = 0; index < totalChunks; index++) {
      const offset = index * chunkSize;
      const end = Math.min(offset + chunkSize, file.size);
      chunkMetadata.push({
        index,
        totalChunks,
        size: end - offset,
        offset,
        sha256: ''
      });

      if (progressCallback && index % 10 === 0) {
        progressCallback((index / Math.max(totalChunks, 1)) * 40, 'chunking');
      }
    }

    metadata = {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      chunks: chunkMetadata,
      encryptionKey,
      created: new Date().toISOString(),
      previewAvailable: false
    };
  } else {
    const preloaded = await createFileChunks(file,
      (progress) => progressCallback && progressCallback(progress, 'chunking'));
    chunks = preloaded.chunks;
    metadata = preloaded.metadata;
  }
  
  if (useStreamingUpload) {
    progressCallback?.(50, 'uploading', { message: 'Using memory-optimized streaming upload' });
    
    let uploadedCount = 0;
    
    for (let i = 0; i < totalChunks; i += STREAMING_BATCH_SIZE) {
      const batchEnd = Math.min(i + STREAMING_BATCH_SIZE, totalChunks);
      const batchIndexes = Array.from({ length: batchEnd - i }, (_, idx) => i + idx);
      
      progressCallback?.(50 + (uploadedCount / totalChunks * 10), 'encrypting batch', {
        batch: Math.floor(i / STREAMING_BATCH_SIZE) + 1,
        totalBatches: Math.ceil(totalChunks / STREAMING_BATCH_SIZE)
      });
      
      const encryptedBatch = await Promise.all(
        batchIndexes.map(async (chunkIndex) => {
          const start = chunkIndex * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const chunk = await readFileChunk(file, start, end);
          const encrypted = await encryptChunkWithWorker(chunk, metadata.encryptionKey, chunkIndex);

          return { encrypted, index: chunkIndex };
        })
      );
      
      const preparedBatch = await Promise.all(
        encryptedBatch.map(async ({ encrypted, index }) => {
          const chunkId = `res54r2_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}_${index}`;
          const path = getChunkStoragePath(user.id, chunkId);

          const { data: presignedData, error: presignedError } = await supabase.functions.invoke('get-r2-presigned-url', {
            body: {
              action: 'upload',
              path,
              fileType: 'application/json'
            }
          });

          if (presignedError || !presignedData?.url) {
            throw new Error(`Failed to get presigned URL for chunk ${index}: ${presignedError?.message}`);
          }

          const chunkData = { v: '2.3', i: index, t: totalChunks, d: encrypted };

          metadata.chunks[index] = {
            ...metadata.chunks[index],
            repo: 'r2',
            path,
            accountId: 0
          };

          return {
            fileName: `${chunkId}.json`,
            path,
            data: JSON.stringify(chunkData),
            uploadUrl: presignedData.url,
            index
          };
        })
      );
      
      progressCallback?.(60 + (uploadedCount / totalChunks * 30), 'uploading batch', {
        current: uploadedCount + preparedBatch.length,
        total: totalChunks
      });
      
      for (const chunk of preparedBatch) {
        let attempts = 0;
        let uploaded = false;
        
        while (attempts < MAX_RETRIES && !uploaded) {
          try {
            const response = await fetch(chunk.uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: chunk.data
            });

            if (!response.ok) {
              throw new Error(`Upload failed with status: ${response.status}`);
            }
            
            uploaded = true;
            devLog(`[Streaming] Chunk ${chunk.index} uploaded to R2`);
            
          } catch (error: any) {
            attempts++;
            devWarn(`[Streaming] Chunk ${chunk.index} failed on R2 (attempt ${attempts}/${MAX_RETRIES}):`, error.message);
            
            if (attempts < MAX_RETRIES) {
              await delay(backoffDelay(attempts));
            } else {
              throw new Error(`Failed to upload chunk ${chunk.index} after ${MAX_RETRIES} attempts: ${error.message}`);
            }
          }
        }
      }
      
      uploadedCount += preparedBatch.length;
      
      encryptedBatch.length = 0;
      preparedBatch.length = 0;
      
      // Hint for GC (no-op in browser without --expose-gc)
    }
    
    if (encryptionWorker) {
      encryptionWorker.terminate();
      encryptionWorker = null;
    }

    progressCallback?.(95, 'finalizing');
    
  } else {
    progressCallback?.(50, 'encrypting');
    
    const encryptChunk = async (chunk: ArrayBuffer, index: number): Promise<string> => {
      try {
        const encryptedChunk = file.size > LARGE_FILE_THRESHOLD
          ? await encryptChunkWithWorker(chunk, metadata.encryptionKey, index)
          : await encryptData(chunk, metadata.encryptionKey);
        
        progressCallback?.(50 + ((index + 1) / chunks.length * 10), 'encrypting', { 
          current: index + 1, 
          total: chunks.length 
        });
        return encryptedChunk;
      } catch (error) {
        console.error(`Encryption error for chunk ${index}:`, error);
        throw error;
      }
    };
    
    let encryptedChunks: string[];
    if (file.size > LARGE_FILE_THRESHOLD) {
      encryptedChunks = [];
      const workerBatchSize = 4;
      
      for (let i = 0; i < chunks.length; i += workerBatchSize) {
        const batch = chunks.slice(i, Math.min(i + workerBatchSize, chunks.length));
        const batchResults = await Promise.all(
          batch.map((chunk, batchIndex) => encryptChunk(chunk, i + batchIndex))
        );
        encryptedChunks.push(...batchResults);
        
        batch.forEach((_, idx) => {
          (chunks[i + idx] as any) = null;
        });
      }
    } else {
      encryptedChunks = await processChunksInParallel(
        chunks, 
        encryptChunk,
        Math.min(chunks.length, MAX_PARALLEL_OPERATIONS)
      );
    }
    
    progressCallback?.(60, 'preparing upload');
    
    const prepareChunkForUpload = async (chunk: string, index: number): Promise<any> => {
      const chunkId = `res54r2_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}_${index}`;
      const path = getChunkStoragePath(user.id, chunkId);

      const { data: presignedData, error: presignedError } = await supabase.functions.invoke('get-r2-presigned-url', {
        body: {
          action: 'upload',
          path,
          fileType: 'application/json'
        }
      });

      if (presignedError || !presignedData?.url) {
        throw new Error(`Failed to get presigned URL for chunk ${index}: ${presignedError?.message}`);
      }

      const chunkData = { v: '2.3', i: index, t: encryptedChunks.length, d: chunk };

      metadata.chunks[index] = {
        ...metadata.chunks[index],
        repo: 'r2',
        path,
        accountId: 0
      };

      return {
        fileName: `${chunkId}.json`,
        path,
        data: JSON.stringify(chunkData),
        uploadUrl: presignedData.url,
        index
      };
    };

    const uploadBatch = async (batchChunks: any[], attempt: number = 0): Promise<any[]> => {
      const results: any[] = [];
      const failed: {chunk: any, error: any}[] = [];
      
      for (const chunk of batchChunks) {
        let chunkAttempt = 0;
        let chunkSuccess = false;
        
        while (chunkAttempt < MAX_RETRIES && !chunkSuccess) {
          try {
            devLog(`[uploadBatch] Uploading chunk ${chunk.index} to R2, attempt ${chunkAttempt + 1}`);
            
            const response = await fetch(chunk.uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: chunk.data
            });

            if (!response.ok) {
              throw new Error(`Upload failed with status: ${response.status}`);
            }

            devLog(`[uploadBatch] Chunk ${chunk.index} verified via R2`);
            
            results.push({
              index: chunk.index,
              path: chunk.path,
              repo: 'r2',
              accountId: 0,
              sha: '',
              success: true,
              verified: true
            });
            chunkSuccess = true;
            
          } catch (error: any) {
            chunkAttempt++;
            devWarn(`[uploadBatch] Chunk ${chunk.index} failed (attempt ${chunkAttempt}/${MAX_RETRIES})`);
            
            if (chunkAttempt < MAX_RETRIES) {
              const waitTime = backoffDelay(chunkAttempt);
              devLog(`[uploadBatch] Waiting ${waitTime}ms before retry...`);
              await delay(waitTime);
            } else {
              failed.push({chunk, error});
            }
          }
        }
      }
      
      if (failed.length > 0) {
        const failedIndexes = failed.map(f => f.chunk.index).join(', ');
        throw new Error(`Failed to upload chunks to R2: ${failedIndexes}. Last error: ${failed[0].error.message}`);
      }
      
      return results;
    };

    try {
      progressCallback?.(60, 'uploading');
      
      progressCallback?.(60, 'preparing', { message: 'Preparing chunk metadata...' });
      const preparedChunks: any[] = [];
      const prepBatchSize = 10;
      
      for (let i = 0; i < encryptedChunks.length; i += prepBatchSize) {
        const batch = encryptedChunks.slice(i, i + prepBatchSize);
        const batchPrepared = await Promise.all(
          batch.map((chunk, batchIndex) => prepareChunkForUpload(chunk, i + batchIndex))
        );
        preparedChunks.push(...batchPrepared);
        
        if (i + prepBatchSize < encryptedChunks.length) {
          await delay(50);
        }
      }

      const uploadBatchSize = getBatchSize(file.size);
      devLog(`[Upload] Using batch size ${uploadBatchSize} for ${(file.size / 1024 / 1024).toFixed(1)}MB file`);
      
      const uploadResults: any[] = [];
      let successfulChunks = 0;
      
      for (let i = 0; i < preparedChunks.length; i += uploadBatchSize) {
        const batch = preparedChunks.slice(i, i + uploadBatchSize);
        const batchNum = Math.floor(i / uploadBatchSize) + 1;
        const totalBatches = Math.ceil(preparedChunks.length / uploadBatchSize);
        
        progressCallback?.(60 + ((i / preparedChunks.length) * 30), 'uploading', {
          batch: batchNum,
          totalBatches: totalBatches,
          chunksInBatch: batch.length,
          chunksCompleted: successfulChunks,
          totalChunks: preparedChunks.length
        });

        const batchResults = await uploadBatch(batch);
        uploadResults.push(...batchResults);
        successfulChunks += batchResults.length;
        
        batchResults.forEach((result) => {
          metadata.chunks[result.index] = {
            ...metadata.chunks[result.index],
            repo: result.repo,
            path: result.path,
            accountId: result.accountId
          };
        });
        
        if (i + uploadBatchSize < preparedChunks.length) {
          await delay(200);
        }
      }

      if (uploadResults.length !== encryptedChunks.length) {
        const missing = encryptedChunks.length - uploadResults.length;
        throw new Error(`Upload incomplete: ${uploadResults.length}/${encryptedChunks.length} chunks uploaded (${missing} missing)`);
      }
      
      const invalidChunks = metadata.chunks.filter((c, i) => !c.repo || !c.path);
      if (invalidChunks.length > 0) {
        throw new Error(`${invalidChunks.length} chunks missing storage metadata`);
      }
      
      devLog(`[Upload] All ${uploadResults.length} chunks uploaded and verified successfully`);
      
      (encryptedChunks as any) = null;
      
      if (file.size > LARGE_FILE_THRESHOLD && encryptionWorker) {
        encryptionWorker.terminate();
        encryptionWorker = null;
      }
    } catch (error) {
      console.error("Failed to upload chunks:", error);
      
      if (encryptionWorker) {
        encryptionWorker.terminate();
        encryptionWorker = null;
      }
      
      throw new Error("File upload failed. Please try again later.");
    }
  }
  
  progressCallback?.(90, 'finalizing');
  
  const dbEncryptionKey = isBYOKActive ? 'byok_protected' : metadata.encryptionKey;

  const metadataString = JSON.stringify({
    ...metadata,
    encryptionKey: dbEncryptionKey,
    chunks: metadata.chunks.map(chunk => ({
      ...chunk,
      repo: chunk.repo,
      path: chunk.path
    }))
  });

  const activeWorkspaceId = getActiveWorkspaceId();

  const fileRecord = {
    name: file.name,
    type: file.type,
    size: file.size,
    storage_path: "res54_r2",
    user_id: user.id,
    encrypted: true,
    shared: false,
    encryption_key: dbEncryptionKey,
    tags: [metadataString] as string[]
  };

  const { data: columns, error: columnsError } = await supabase
    .from('files')
    .select('*')
    .limit(1);

  if (columnsError) {
    console.error("Error checking files table:", columnsError);
    throw new Error("Failed to create file record");
  }

  let insertData = fileRecord;
  if (columns && columns.length > 0 && 'processor' in columns[0]) {
    insertData = { ...(fileRecord as any), processor: "res54" };
  }
  if (activeWorkspaceId && columns && columns.length > 0 && 'workspace_id' in columns[0]) {
    insertData = { ...(insertData as any), workspace_id: activeWorkspaceId };
  }

  const { data: dbFile, error: dbError } = await supabase
    .from('files')
    .insert(insertData)
    .select()
    .single();

  let createdFile: any = dbFile as any;
  if (dbError) {
    devWarn("Direct table insert failed, attempting RPC fallback");

    const rpcArgs: Record<string, unknown> = {
      p_name: file.name,
      p_type: file.type || 'application/octet-stream',
      p_size: file.size,
      p_storage_path: 'res54_r2',
      p_user_id: user.id,
      p_encrypted: true,
      p_encryption_key: dbEncryptionKey,
      p_metadata: metadataString
    };

    if (activeWorkspaceId) {
      rpcArgs.p_workspace_id = activeWorkspaceId;
    }

    let { data: rpcData, error: rpcError } = await supabase.rpc('create_file_record', rpcArgs as any);

    if (rpcError && activeWorkspaceId && `${rpcError.message || ''}`.includes('p_workspace_id')) {
      delete rpcArgs.p_workspace_id;
      const retry = await supabase.rpc('create_file_record', rpcArgs as any);
      rpcData = retry.data;
      rpcError = retry.error;
    }

    if (rpcError || !rpcData) {
      console.error("RPC create_file_record failed:", rpcError);
      throw new Error("Failed to create file record");
    }

    createdFile = rpcData as any;
  }
  
  progressCallback?.(100, 'complete');
  
  const canPreview = ['image/', 'video/', 'text/', 'application/pdf'].some(type => file.type.startsWith(type));
  if (canPreview) {
    setTimeout(() => generatePreview(createdFile.id, file.type), 100);
  }
  
  return {
    id: createdFile.id,
    metadata,
    encryptionKey: dbEncryptionKey
  };
};

export const validateChunkFormat = (chunk: any): boolean => {
  return (
    chunk &&
    typeof chunk.chunkIndex === 'number' &&
    typeof chunk.totalChunks === 'number' &&
    typeof chunk.fileName === 'string' &&
    typeof chunk.fileType === 'string' &&
    typeof chunk.fileSize === 'number' &&
    typeof chunk.chunkData === 'string'
  );
};

const downloadChunkR2 = async (chunk: ChunkMetadata, attempt = 0): Promise<any> => {
  if (!chunk.path) {
    throw new Error(`Invalid chunk metadata for chunk ${chunk.index}`);
  }

  try {
    const { data: presignedData, error: presignedError } = await supabase.functions.invoke('get-r2-presigned-url', {
      body: { 
        action: 'download', 
        path: chunk.path 
      }
    });

    if (presignedError || !presignedData?.url) {
      throw new Error(`Failed to get presigned URL: ${presignedError?.message}`);
    }
    
    const response = await fetch(presignedData.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch chunk with status ${response.status}`);
    }

    const responseData = await response.json();
    
    if (responseData.v === '2.3') {
      return {
        index: responseData.i,
        data: responseData.d,
        version: responseData.v
      };
    } else if (validateChunkFormat(responseData)) {
      return {
        index: responseData.chunkIndex,
        data: responseData.chunkData,
        size: responseData.fileSize,
        version: responseData.version || '1.0'
      };
    } else {
      throw new Error('Invalid chunk format');
    }
  } catch (error: any) {
    if (attempt < MAX_RETRIES) {
      const waitTime = backoffDelay(attempt);
      await delay(waitTime);
      return downloadChunkR2(chunk, attempt + 1);
    }
    
    throw new Error(`Failed to download chunk ${chunk.index} after ${MAX_RETRIES} attempts: ${error.message}`);
  }
};

export const downloadFileWithRes54 = async (
  fileId: string,
  progressOrOptions?: Res54ProgressCallback | Res54DownloadOptions | string,
  maybeOptions?: Res54DownloadOptions
): Promise<Blob> => {
  const progressCallback: Res54ProgressCallback | undefined =
    typeof progressOrOptions === 'function' ? progressOrOptions : undefined;

  const options: Res54DownloadOptions = typeof progressOrOptions === 'function'
    ? (maybeOptions || {})
    : typeof progressOrOptions === 'string'
      ? { fileName: progressOrOptions }
      : (progressOrOptions || {});

  progressCallback?.(0, 'initializing');
  
  const { data: { session } } = await supabase.auth.getSession();
  
  const { data: file, error: fileError } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single();
    
  if (fileError) {
    console.error("Error fetching file metadata:", fileError);
    throw new Error("Failed to fetch file metadata");
  }
  
  progressCallback?.(10, 'preparing');
  
  let metadata: Res54FileMetadata;
  try {
    const processorValue = (file as any).processor || "unknown";
    let parsedMetadata;
    
    try {
      parsedMetadata = Array.isArray(file.tags) && file.tags.length > 0 
        ? JSON.parse(file.tags[0])
        : null;
    } catch (e) {
      devWarn("Failed to parse first tag");
      parsedMetadata = null;
    }

    if (parsedMetadata && parsedMetadata.chunks && Array.isArray(parsedMetadata.chunks)) {
      metadata = parsedMetadata;
      devLog('Using Res54 metadata format');
    } else if (parsedMetadata && Array.isArray(parsedMetadata)) {
      const chunkLocations = parsedMetadata;
      devLog('Converting legacy metadata format');
        
      metadata = {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        chunks: chunkLocations.map((loc: any, index: number) => ({
          index: typeof loc.index === 'number' ? loc.index : index,
          totalChunks: chunkLocations.length,
          size: Math.ceil(file.size / chunkLocations.length),
          offset: index * Math.ceil(file.size / chunkLocations.length),
          sha256: loc.sha || "",
          repo: loc.repo || "",
          path: loc.path || ""
        })),
        encryptionKey: file.encryption_key,
        created: file.created_at,
        previewAvailable: false
      };
    }

    if (!metadata.chunks || !Array.isArray(metadata.chunks)) {
      throw new Error("Invalid metadata structure");
    }

    for (const chunk of metadata.chunks) {
      if (!chunk.path) {
        console.error(`Invalid chunk metadata at index ${chunk.index}`);
        throw new Error(`Missing storage location for chunk ${chunk.index}`);
      }
    }

  } catch (e) {
    console.error("Error parsing chunk locations:", e);
    throw new Error("Failed to parse chunk locations");
  }
  
  progressCallback?.(20, 'downloading');
  
  const isVeryLargeFile = metadata.fileSize > 500 * 1024 * 1024;
  const isMediumFile = metadata.fileSize > 50 * 1024 * 1024;
  
  const downloadConcurrency = isVeryLargeFile ? 6 : isMediumFile ? 12 : 16;
  
  if (isVeryLargeFile) {
    progressCallback?.(20, 'downloading', { message: 'Optimized download for large file' });
  }
  
  try {
    const downloadedChunks = await processChunksInParallel(
      metadata.chunks,
      async (chunk, index, attempt) => {
        try {
          const result = await downloadChunkR2(chunk, attempt);
          progressCallback?.(20 + (index / metadata.chunks.length) * 40, 'downloading', {
            current: index + 1,
            total: metadata.chunks.length,
            chunkIndex: chunk.index
          });
          return result;
        } catch (error: any) {
          throw new Error(`Chunk ${chunk.index} download failed: ${error.message}`);
        }
      },
      downloadConcurrency
    );

    const sortedChunks = downloadedChunks
      .sort((a, b) => a.index - b.index)
      .map(chunk => chunk.data);

    if (sortedChunks.length !== metadata.chunks.length) {
      throw new Error(`Download incomplete: ${sortedChunks.length}/${metadata.chunks.length} chunks received`);
    }
    const byokPolicy = session?.user ? await getBYOKRuntimePolicy(session.user.id) : { accountModeEnabled: false, activeKey: null, enabled: false, strictMode: false, allowDefaultFallback: true, promptEveryDecrypt: false, hasAccountKey: false };
    const downloadReason = options.reason || 'decrypt';
    const promptFileName = options.fileName || metadata.fileName || file.name;
    const attemptedKeys = new Set<string>();

    const decryptChunksWithKey = async (
      decryptionKey: string,
      strategy: 'byok' | 'default'
    ): Promise<ArrayBuffer[]> => {
      progressCallback?.(60, 'decrypting', {
        strategy,
        mode: strategy === 'byok' ? 'BYOK' : 'SquidCloud default',
      });

      if (isVeryLargeFile) {
        const decryptBatchSize = 6;
        const decryptedLargeChunks: ArrayBuffer[] = [];

        for (let i = 0; i < sortedChunks.length; i += decryptBatchSize) {
          const batchEnd = Math.min(i + decryptBatchSize, sortedChunks.length);
          const batch = sortedChunks.slice(i, batchEnd);

          progressCallback?.(60 + ((i / sortedChunks.length) * 30), 'decrypting batch', {
            strategy,
            batch: Math.floor(i / decryptBatchSize) + 1,
            totalBatches: Math.ceil(sortedChunks.length / decryptBatchSize),
          });

          const decryptedBatch = await Promise.all(
            batch.map((chunkData) => decryptData(chunkData, decryptionKey))
          );

          decryptedLargeChunks.push(...decryptedBatch);
        }

        return decryptedLargeChunks;
      }

      if (metadata.fileSize > LARGE_FILE_THRESHOLD) {
        const decryptedSequentialChunks: ArrayBuffer[] = [];

        for (let i = 0; i < sortedChunks.length; i++) {
          progressCallback?.(60 + ((i + 1) / sortedChunks.length * 30), 'decrypting', {
            strategy,
            current: i + 1,
            total: sortedChunks.length,
          });

          const decryptedData = await decryptData(sortedChunks[i], decryptionKey);
          decryptedSequentialChunks.push(decryptedData);
        }

        return decryptedSequentialChunks;
      }

      const decryptChunk = async (chunkData: string, index: number): Promise<ArrayBuffer> => {
        const decryptedData = await decryptData(chunkData, decryptionKey);
        progressCallback?.(60 + ((index + 1) / sortedChunks.length * 30), 'decrypting', {
          strategy,
          current: index + 1,
          total: sortedChunks.length,
        });
        return decryptedData;
      };

      return processChunksInParallel(
        sortedChunks,
        decryptChunk,
        Math.min(sortedChunks.length, MAX_PARALLEL_OPERATIONS)
      );
    };

    const tryCandidateKey = async (
      candidateKey: string | null | undefined,
      strategy: 'byok' | 'default'
    ): Promise<ArrayBuffer[] | null> => {
      if (!candidateKey) return null;

      const normalizedKey = candidateKey.trim();
      if (!normalizedKey || attemptedKeys.has(normalizedKey)) return null;
      attemptedKeys.add(normalizedKey);

      try {
        return await decryptChunksWithKey(normalizedKey, strategy);
      } catch (error) {
        devWarn(`Res54 decrypt attempt failed using ${strategy} key`);
        return null;
      }
    };

    const promptBYOKKey = async (retry = false): Promise<string | null> => {
      try {
        const key = await requestEphemeralBYOKKey({
          reason: downloadReason,
          fileName: promptFileName,
          title: retry ? 'Key mismatch, try again' : 'BYOK key required',
          description: retry
            ? 'The previous key could not decrypt this file. Re-enter your BYOK key.'
            : 'This file is protected with Bring Your Own Key. Enter the decryption key to unlock it.',
        });
        return key?.trim() || null;
      } catch {
        return null;
      }
    };

    const defaultKey = metadata.encryptionKey;
    const isExplicitBYOK = defaultKey === 'byok_protected' || defaultKey === null || defaultKey === '';
    let decryptedChunks: ArrayBuffer[] | null = null;

    if (isExplicitBYOK) {
      const initialBYOK = await promptBYOKKey(false);
      decryptedChunks = await tryCandidateKey(initialBYOK, 'byok');

      if (!decryptedChunks) {
        const retryBYOK = await promptBYOKKey(true);
        decryptedChunks = await tryCandidateKey(retryBYOK, 'byok');
      }
    } else if (byokPolicy.enabled) {
      if (byokPolicy.promptEveryDecrypt || byokPolicy.strictMode) {
        const primaryBYOK = await promptBYOKKey(false);
        decryptedChunks = await tryCandidateKey(primaryBYOK, 'byok');
      }

      if (!decryptedChunks && byokPolicy.allowDefaultFallback) {
        decryptedChunks = await tryCandidateKey(defaultKey, 'default');
      }

      if (!decryptedChunks) {
        const retryBYOK = await promptBYOKKey(true);
        decryptedChunks = await tryCandidateKey(retryBYOK, 'byok');
      }

      if (!decryptedChunks && byokPolicy.strictMode && !byokPolicy.allowDefaultFallback) {
        throw new Error('BYOK strict mode is enabled and no valid BYOK key was provided.');
      }

      if (!decryptedChunks && byokPolicy.allowDefaultFallback) {
        decryptedChunks = await tryCandidateKey(defaultKey, 'default');
      }
    } else {
      decryptedChunks = await tryCandidateKey(defaultKey, 'default');

      if (!decryptedChunks) {
        const fallbackBYOK = await promptBYOKKey(true);
        decryptedChunks = await tryCandidateKey(fallbackBYOK, 'byok');
      }
    }

    if (!decryptedChunks) {
      throw new Error('Decryption failed due to key mismatch. Try your BYOK key again or verify your settings.');
    }

    progressCallback?.(90, 'assembling');

    const blob = new Blob(decryptedChunks, { type: metadata.fileType });
    
    if (blob.size !== metadata.fileSize) {
      console.warn(`Size mismatch: expected ${metadata.fileSize}, got ${blob.size}`);
    }

    progressCallback?.(100, 'complete');
    return blob;
  } catch (error) {
    console.error("Download failed:", error);
    throw new Error(`Download failed: ${error.message}`);
  }
};

async function generatePreview(fileId: string, fileType: string): Promise<void> {
  devLog(`Preview generation for ${fileId} of type ${fileType} would happen here`);
  
  const { data: columns, error: columnsError } = await supabase
    .from('files')
    .select('*')
    .limit(1);

  if (columnsError || columns.length === 0) {
    console.error("Error checking files table columns:", columnsError);
    return;
  }

  const updateData: Record<string, any> = {};
  
  if ('preview_available' in columns[0]) {
    updateData.preview_available = true;
  }
  
  if ('preview_type' in columns[0]) {
    updateData.preview_type = fileType.split('/')[0];
  }
  
  if (Object.keys(updateData).length === 0) {
    devLog("No preview fields to update");
    return;
  }

  try {
    await supabase
      .from('files')
      .update(updateData)
      .eq('id', fileId);
  } catch (error) {
    console.error("Error updating preview info:", error);
  }
}

export const checkFilePreview = async (fileId: string): Promise<{
  hasPreview: boolean,
  previewType?: string,
  previewUrl?: string
}> => {
  try {
    const { data, error } = await supabase
      .from('files')
      .select('id, preview_available, preview_type')
      .eq('id', fileId)
      .single();
      
    if (error || !data) {
      return { hasPreview: false };
    }
    
    const fileData = data as any;
    const hasPreviewField = 'preview_available' in fileData;
    
    return {
      hasPreview: hasPreviewField ? !!fileData.preview_available : false,
      previewType: hasPreviewField ? (fileData.preview_type || undefined) : undefined,
      previewUrl: hasPreviewField && fileData.preview_available ? `/api/preview/${fileId}` : undefined
    };
  } catch (error) {
    console.error("Error checking file preview:", error);
    return { hasPreview: false };
  }
};

const createBlobFromChunks = (chunks: ArrayBuffer[], type: string): Blob => {
  return new Blob(chunks, { type });
};