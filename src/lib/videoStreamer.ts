import { downloadChunk } from './res54';
import type { ChunkMetadata } from './res54';
import { decryptData } from './encryption';
import { supabase } from '@/integrations/supabase/client';

interface FileMeta {
  fileName: string;
  fileType: string;
  fileSize: number;
  chunks: ChunkMetadata[];
  encryptionKey: string;
}

export type StreamerEvent =
  | { type: 'partial'; blob: Blob; loadedBytes: number; totalBytes: number; chunkCount: number; totalChunks: number }
  | { type: 'complete'; blob: Blob }
  | { type: 'error'; message: string };

type Listener = (event: StreamerEvent) => void;

const CHUNKS_PER_BLOB = 3;
const DOWNLOAD_CONCURRENCY = 6;
const DECRYPT_CONCURRENCY = 4;

// In-memory metadata cache keyed by file ID
const metadataCache = new Map<string, { metadata: FileMeta; timestamp: number }>();
const METADATA_CACHE_TTL = 60000;

export class ProgressiveVideoLoader {
  private fileId: string;
  private fileType: string;
  private fileSize: number;
  private listener?: Listener;
  private decryptedChunks: ArrayBuffer[] = [];
  private loadedCount = 0;
  private totalCount = 0;
  private destroyed = false;

  constructor(fileId: string, fileType: string, fileSize: number) {
    this.fileId = fileId;
    this.fileType = fileType;
    this.fileSize = fileSize;
  }

  onEvent(listener: Listener) {
    this.listener = listener;
  }

  private emit(event: StreamerEvent) {
    if (!this.destroyed) {
      this.listener?.(event);
    }
  }

  async start() {
    if (this.destroyed) return;

    try {
      const now = Date.now();
      const cached = metadataCache.get(this.fileId);
      let metadata: FileMeta;

      if (cached && (now - cached.timestamp) < METADATA_CACHE_TTL) {
        metadata = cached.metadata;
      } else {
        const { data: file, error: fileError } = await supabase
          .from('files')
          .select('*')
          .eq('id', this.fileId)
          .single();

        if (fileError || !file) {
          throw new Error('Failed to fetch file metadata');
        }

        try {
          const parsed = Array.isArray(file.tags) && file.tags.length > 0
            ? JSON.parse(file.tags[0])
            : null;
          if (!parsed || !Array.isArray(parsed.chunks)) {
            throw new Error('Invalid metadata format');
          }
          metadata = parsed;
        } catch {
          throw new Error('Failed to parse file metadata');
        }

        metadataCache.set(this.fileId, { metadata, timestamp: now });
      }

      const chunks = metadata.chunks
        .filter(c => c.repo && c.path)
        .sort((a, b) => a.index - b.index);

      this.totalCount = chunks.length;
      const encryptionKey = metadata.encryptionKey;

      if (this.totalCount === 0) {
        throw new Error('No chunks available for streaming');
      }

      this.decryptedChunks = new Array(this.totalCount);

      const pending: { index: number; data: string }[] = [];
      let activeDownloads = 0;
      let activeDecrypts = 0;
      let downloadFailed = false;
      let enqueueDownload: () => void;

      const tryEmitPartial = () => {
        if (this.loadedCount >= this.totalCount) return;
        if (this.loadedCount % CHUNKS_PER_BLOB !== 0) return;

        const buffers: ArrayBuffer[] = [];
        for (let i = 0; i < this.loadedCount; i++) {
          if (this.decryptedChunks[i]) {
            buffers.push(this.decryptedChunks[i]);
          }
        }

        if (buffers.length === 0) return;

        const blob = new Blob(buffers, { type: this.fileType });
        this.emit({
          type: 'partial',
          blob,
          loadedBytes: buffers.reduce((sum, b) => sum + b.byteLength, 0),
          totalBytes: this.fileSize,
          chunkCount: this.loadedCount,
          totalChunks: this.totalCount,
        });
      };

      const tryDecrypt = async () => {
        if (this.destroyed || activeDecrypts >= DECRYPT_CONCURRENCY) return;

        const item = pending.shift();
        if (!item) return;

        activeDecrypts++;
        try {
          const buffer = await decryptData(item.data, encryptionKey);
          if (!this.destroyed) {
            this.decryptedChunks[item.index] = buffer;
            this.loadedCount++;
            tryEmitPartial();

            if (this.loadedCount >= this.totalCount) {
              this.finalize();
              return;
            }
          }
        } catch (err: any) {
          this.emit({ type: 'error', message: `Decrypt chunk ${item.index} failed: ${err.message}` });
        }
        activeDecrypts--;
        tryDecrypt();
      };

      enqueueDownload = () => {
        while (!this.destroyed && downloadQueue.length > 0 && activeDownloads < DOWNLOAD_CONCURRENCY) {
          const chunk = downloadQueue.shift()!;
          activeDownloads++;
          downloadChunk(chunk)
            .then(result => {
              if (!this.destroyed) {
                pending.push({ index: chunk.index, data: result.data });
                tryDecrypt();
              }
            })
            .catch(err => {
              downloadFailed = true;
              console.warn(`ProgressiveVideoLoader: chunk ${chunk.index} download failed, skipping`, err.message);
            })
            .finally(() => {
              activeDownloads--;
              enqueueDownload();
            });
        }

        if (downloadQueue.length === 0 && activeDownloads === 0 && !this.destroyed) {
          if (this.loadedCount >= this.totalCount || (downloadFailed && this.loadedCount > 0)) {
            this.finalize();
          }
        }
      };

      const downloadQueue = [...chunks];
      enqueueDownload();
    } catch (err: any) {
      this.emit({ type: 'error', message: err.message });
    }
  }

  private finalize() {
    if (this.destroyed || this.loadedCount < this.totalCount) return;

    const buffers: ArrayBuffer[] = [];
    for (let i = 0; i < this.totalCount; i++) {
      if (this.decryptedChunks[i]) {
        buffers.push(this.decryptedChunks[i]);
      }
    }

    const blob = new Blob(buffers, { type: this.fileType });
    this.emit({ type: 'complete', blob });
  }

  destroy() {
    this.destroyed = true;
    metadataCache.delete(this.fileId);
  }
}
