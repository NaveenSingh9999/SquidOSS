// Upload Worker - Handles file encryption in background thread
// Prevents UI blocking during large file processing

// Worker message types
interface EncryptChunkMessage {
  type: 'encrypt-chunk';
  chunkData: ArrayBuffer;
  encryptionKey: string;
  index: number;
}

interface WorkerMessage {
  type: 'encrypt-chunk' | 'init';
  payload?: any;
  chunkData?: ArrayBuffer;
  encryptionKey?: string;
  index?: number;
}

interface WorkerResponse {
  type: 'chunk-encrypted' | 'error' | 'ready';
  index?: number;
  data?: ArrayBuffer;
  error?: string;
}

// AES-GCM encryption format must match src/lib/encryption.ts for compatibility.
async function encryptData(data: ArrayBuffer, keyString: string): Promise<ArrayBuffer> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keyString.slice(0, 32).padEnd(32, '0'));
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const additionalData = encoder.encode(`res54-v2-${Date.now()}`);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData },
      key,
      data
    );

    const encryptedBytes = new Uint8Array(encrypted);
    const combined = new Uint8Array(4 + additionalData.byteLength + iv.byteLength + encryptedBytes.byteLength);
    const view = new DataView(combined.buffer, 0, 4);
    view.setUint32(0, additionalData.byteLength, true);
    combined.set(additionalData, 4);
    combined.set(iv, 4 + additionalData.byteLength);
    combined.set(encryptedBytes, 4 + additionalData.byteLength + iv.byteLength);

    return combined.buffer;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;

  try {
    if (type === 'init') {
      // Worker is ready
      const response: WorkerResponse = { type: 'ready' };
      self.postMessage(response);
      return;
    }

    if (type === 'encrypt-chunk') {
      const { chunkData, encryptionKey, index } = event.data;
      
      if (!chunkData || !encryptionKey || index === undefined) {
        throw new Error('Missing required parameters');
      }

      // Encrypt the chunk in background
      const encryptedBuffer = await encryptData(chunkData, encryptionKey);

      self.postMessage(
        { type: 'chunk-encrypted', index, data: encryptedBuffer },
        [encryptedBuffer]
      );
    }
  } catch (error) {
    const errorResponse: WorkerResponse = {
      type: 'error',
      index: event.data.index,
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    self.postMessage(errorResponse);
  }
};

// Export empty object to make this a module
export {};
