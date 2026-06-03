
/**
 * File encryption/decryption utilities using AES-256-GCM encryption with load balancing
 */
import CryptoJS from 'crypto-js';
import { getLoadBalancer } from '@/services/load-balancer';

// Constants for large file handling
const LARGE_FILE_THRESHOLD = 128 * 1024 * 1024; // 128MB
const MAX_CHUNK_SIZE_FOR_ENCRYPTION = 10 * 1024 * 1024; // 10MB

// Generate a random encryption key
export const generateEncryptionKey = (): string => {
  return CryptoJS.lib.WordArray.random(32).toString();
};

// More robust base64 utilities with chunking
const base64Utils = {
  encode: (buffer: ArrayBuffer): string => {
    try {
      const uint8Array = new Uint8Array(buffer);
      const chunks: string[] = [];
      const chunkSize = 0x8000; // 32KB chunks to prevent call stack issues
      
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        const binary = Array.from(chunk).map(byte => String.fromCharCode(byte)).join('');
        chunks.push(binary);
      }
      
      return btoa(chunks.join(''));
    } catch (error) {
      console.error('Base64 encode error:', error);
      throw new Error('Failed to encode data to base64');
    }
  },
  
  decode: (input: string): Uint8Array => {
    try {
      if (!input || typeof input !== 'string') {
        throw new Error('Invalid input: expected base64 string');
      }

      // Clean the input string
      const base64 = input.trim().replace(/[^A-Za-z0-9+/=]/g, '');
      
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        
        // Process in chunks to handle large files
        const chunkSize = 0x10000; // 64KB chunks
        for (let i = 0; i < binary.length; i += chunkSize) {
          const end = Math.min(i + chunkSize, binary.length);
          for (let j = i; j < end; j++) {
            bytes[j] = binary.charCodeAt(j);
          }
        }
        
        return bytes;
      } catch (e) {
        throw new Error('Failed to decode base64 data: Invalid format');
      }
    } catch (error) {
      console.error('Base64 decode error:', error);
      throw new Error(`Failed to decode base64 data: ${error.message}`);
    }
  }
};

// Add binary utilities with improved memory handling
const binaryUtils = {
  arrayBufferToBase64: (buffer: ArrayBuffer): string => {
    const uint8Array = new Uint8Array(buffer);
    const chunks: string[] = [];
    const chunkSize = 0x8000; // 32KB chunks to prevent call stack issues
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      const binary = Array.from(chunk).map(byte => String.fromCharCode(byte)).join('');
      chunks.push(binary);
    }
    
    return btoa(chunks.join(''));
  },
  
  base64ToArrayBuffer: (base64: string): ArrayBuffer => {
    try {
      const binaryString = atob(base64.trim());
      const bytes = new Uint8Array(binaryString.length);
      
      // Process in chunks to handle large files
      const chunkSize = 0x10000; // 64KB chunks
      for (let i = 0; i < binaryString.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, binaryString.length);
        for (let j = i; j < end; j++) {
          bytes[j] = binaryString.charCodeAt(j);
        }
      }
      
      return bytes.buffer;
    } catch (error) {
      console.error('Base64 to ArrayBuffer error:', error);
      throw new Error('Failed to convert base64 to ArrayBuffer');
    }
  }
};

// Add chunk format validation
const validateChunkFormat = (chunk: any): boolean => {
  return (
    chunk &&
    typeof chunk.chunkData === 'string' &&
    typeof chunk.chunkIndex === 'number' &&
    typeof chunk.totalChunks === 'number'
  );
};

// Improved string conversion function for large arrays
const uint8ArrayToString = (array: Uint8Array): string => {
  let string = '';
  // Process in smaller chunks to avoid stack overflow
  const chunkSize = 0x4000; // 16KB chunks
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.subarray(i, Math.min(i + chunkSize, array.length));
    string += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return string;
};

// Enhanced encrypt function for large files with load balancing
export const encryptData = async (data: ArrayBuffer, key: string): Promise<string> => {
  const loadBalancer = getLoadBalancer();
  
  return loadBalancer.execute(
    async () => {
      try {
        // For large files, handle in chunks to prevent memory issues
        if (data.byteLength > MAX_CHUNK_SIZE_FOR_ENCRYPTION) {
          return await encryptLargeData(data, key);
        }
        
        const keyBytes = new TextEncoder().encode(key.slice(0, 32).padEnd(32, '0'));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const keyBuffer = await crypto.subtle.importKey(
          'raw',
          keyBytes,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt']
        );

        // Add AEAD additional data for integrity
        const additionalData = new TextEncoder().encode(`res54-v2-${Date.now()}`);
        
        const encryptedContent = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, additionalData },
          keyBuffer,
          data
        );

        // Combine IV and encrypted content
        const combined = new Uint8Array(iv.length + encryptedContent.byteLength + additionalData.length + 4);
        
        // Store additionalData length as first 4 bytes
        const dataLengthView = new DataView(combined.buffer, 0, 4);
        dataLengthView.setUint32(0, additionalData.length, true);
        
        // Copy additionalData after length
        combined.set(additionalData, 4);
        
        // Copy IV after additionalData
        combined.set(iv, 4 + additionalData.length);
        
        // Copy encrypted content after IV
        combined.set(new Uint8Array(encryptedContent), 4 + additionalData.length + iv.length);
        
        // Use chunked conversion to avoid stack overflow
        return base64Utils.encode(combined.buffer);
      } catch (error: any) {
        console.error('Encryption error:', error);
        throw new Error(`Encryption failed: ${error.message}`);
      }
    },
    {
      priority: 3,
      poolType: 'encryption',
      tags: ['encryption', 'aes-256-gcm'],
      timeout: 120000, // 2 minutes for large encryptions
      maxRetries: 3
    }
  );
};

// New function to handle encryption of large data
async function encryptLargeData(data: ArrayBuffer, key: string): Promise<string> {
  try {
    const chunkSize = MAX_CHUNK_SIZE_FOR_ENCRYPTION;
    const chunks: Uint8Array[] = [];
    const keyBytes = new TextEncoder().encode(key.slice(0, 32).padEnd(32, '0'));
    
    const keyBuffer = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    // Split data into chunks
    const dataView = new Uint8Array(data);
    for (let i = 0; i < dataView.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, dataView.length);
      const chunk = dataView.slice(i, end);
      chunks.push(chunk);
    }
    
    // Encrypt each chunk with unique IV per chunk
    const encryptedChunks = await Promise.all(chunks.map(async (chunk, index) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const additionalData = new TextEncoder().encode(`chunk-${index}-${chunks.length}-${Date.now()}`);
      
      const encryptedChunk = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData },
        keyBuffer,
        new Uint8Array(chunk).buffer
      );
      
      return { 
        encryptedData: new Uint8Array(encryptedChunk),
        additionalData,
        iv
      };
    }));
    
    // Create header with per-chunk IVs and chunk info
    const header = {
      version: 2,
      chunks: chunks.length,
      totalSize: data.byteLength,
      ivs: encryptedChunks.map(c => Array.from(c.iv))
    };
    const headerJson = JSON.stringify(header);
    const headerBytes = new TextEncoder().encode(headerJson);
    
    // Create final output format
    let totalLength = 4 + headerBytes.length; // 4 bytes for header length
    
    // Add size for all chunks and their metadata
    for (const chunk of encryptedChunks) {
      totalLength += 4 + chunk.additionalData.length + 4 + chunk.encryptedData.length;
    }
    
    // Allocate final buffer
    const finalBuffer = new Uint8Array(totalLength);
    let offset = 0;
    
    // Write header length and header
    const headerLengthView = new DataView(finalBuffer.buffer, offset, 4);
    headerLengthView.setUint32(0, headerBytes.length, true);
    offset += 4;
    
    // Write header
    finalBuffer.set(headerBytes, offset);
    offset += headerBytes.length;
    
    // Write all chunks
    for (const chunk of encryptedChunks) {
      // Write additionalData length
      const dataLengthView = new DataView(finalBuffer.buffer, offset, 4);
      dataLengthView.setUint32(0, chunk.additionalData.length, true);
      offset += 4;
      
      // Write additionalData
      finalBuffer.set(chunk.additionalData, offset);
      offset += chunk.additionalData.length;
      
      // Write chunk length
      const chunkLengthView = new DataView(finalBuffer.buffer, offset, 4);
      chunkLengthView.setUint32(0, chunk.encryptedData.length, true);
      offset += 4;
      
      // Write chunk
      finalBuffer.set(chunk.encryptedData, offset);
      offset += chunk.encryptedData.length;
    }
    
    // Encode to base64
    return base64Utils.encode(finalBuffer.buffer);
  } catch (error: any) {
    console.error('Large file encryption error:', error);
    throw new Error(`Large file encryption failed: ${error.message}`);
  }
}

// Improved decrypt function for all file sizes with load balancing
export const decryptData = async (encodedData: string, key: string): Promise<ArrayBuffer> => {
  const loadBalancer = getLoadBalancer();
  
  return loadBalancer.execute(
    async () => {
      try {
        // Input validation
        if (!encodedData || typeof encodedData !== 'string') {
          throw new Error('Invalid input: expected base64 string');
        }

        // Clean the base64 string
        const cleanedData = encodedData.trim().replace(/\s/g, '');
        
        // Decode base64
        let binaryData: Uint8Array;
        try {
          binaryData = base64Utils.decode(cleanedData);
        } catch (error) {
          console.error('Base64 decode error:', error);
          throw new Error('Invalid base64 format');
        }

        // Check for multi-chunk format
        const headerLengthView = new DataView(binaryData.buffer, 0, 4);
        const possibleHeaderLength = headerLengthView.getUint32(0, true);
        
        if (possibleHeaderLength > 0 && possibleHeaderLength < 1000) { // Reasonable header size
          try {
            const headerBytes = binaryData.slice(4, 4 + possibleHeaderLength);
            const headerJson = new TextDecoder().decode(headerBytes);
            const header = JSON.parse(headerJson);
            
            if (header.version >= 2 && header.chunks > 0) {
              if (Array.isArray(header.ivs)) {
                return await decryptLargeData(binaryData, key, header);
              } else if (Array.isArray(header.iv)) {
                const iv = header.iv;
                return await decryptLargeData(binaryData, key, {
                  ...header,
                  ivs: Array.from({ length: header.chunks }, () => iv)
                });
              }
            }
          } catch (e) {
            // Not in multi-chunk format, continue with regular decryption
          }
        }
        
        // Check for AES-GCM standard format with additionalData
        try {
          // Read additionalData length
          const dataLengthView = new DataView(binaryData.buffer, 0, 4);
          const additionalDataLength = dataLengthView.getUint32(0, true);
          
          // Extract additionalData
          const additionalData = binaryData.slice(4, 4 + additionalDataLength);
          
          // Extract IV (12 bytes)
          const iv = binaryData.slice(4 + additionalDataLength, 4 + additionalDataLength + 12);
          
          // Extract encrypted content
          const encryptedContent = binaryData.slice(4 + additionalDataLength + 12);
          
          const keyBytes = new TextEncoder().encode(key.slice(0, 32).padEnd(32, '0'));
          const keyBuffer = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
          );

          const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv, additionalData },
            keyBuffer,
            encryptedContent
          );

          return decrypted;
        } catch (error: any) {
          // Backward compatibility for older worker payloads: [12-byte IV][ciphertext]
          try {
            if (binaryData.byteLength <= 12) {
              throw error;
            }

            const legacyIv = binaryData.slice(0, 12);
            const legacyEncryptedContent = binaryData.slice(12);
            const keyBytes = new TextEncoder().encode(key.slice(0, 32).padEnd(32, '0'));
            const keyBuffer = await crypto.subtle.importKey(
              'raw',
              keyBytes,
              { name: 'AES-GCM', length: 256 },
              false,
              ['decrypt']
            );

            const legacyDecrypted = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: legacyIv },
              keyBuffer,
              legacyEncryptedContent
            );

            return legacyDecrypted;
          } catch (legacyError: any) {
            console.error('Standard decryption error:', error);
            console.error('Legacy payload fallback failed:', legacyError);
            throw new Error(`Decryption failed: ${error.message}`);
          }
        }
      } catch (error: any) {
        console.error('Decryption error:', error);
        throw new Error(`Failed to decrypt data: ${error.message}`);
      }
    },
    {
      priority: 3,
      poolType: 'decryption',
      tags: ['decryption', 'aes-256-gcm'],
      timeout: 120000, // 2 minutes for large decryptions
      maxRetries: 3
    }
  );
};

// New function to handle decryption of large data
async function decryptLargeData(
  data: Uint8Array, 
  key: string, 
  header: { version: number; chunks: number; totalSize: number; ivs: number[][] }
): Promise<ArrayBuffer> {
  try {
    const headerLength = new DataView(data.buffer, 0, 4).getUint32(0, true);
    let offset = 4 + headerLength;
    
    const keyBytes = new TextEncoder().encode(key.slice(0, 32).padEnd(32, '0'));
    const keyBuffer = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const result = new Uint8Array(header.totalSize);
    let resultOffset = 0;
    
    for (let i = 0; i < header.chunks; i++) {
      const iv = new Uint8Array(header.ivs[i]);
      
      const additionalDataLength = new DataView(data.buffer, offset, 4).getUint32(0, true);
      offset += 4;
      
      const additionalData = data.slice(offset, offset + additionalDataLength);
      offset += additionalDataLength;
      
      const encryptedChunkLength = new DataView(data.buffer, offset, 4).getUint32(0, true);
      offset += 4;
      
      const encryptedChunk = data.slice(offset, offset + encryptedChunkLength);
      offset += encryptedChunkLength;
      
      const decryptedChunk = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData },
        keyBuffer,
        encryptedChunk
      );
      
      const chunkData = new Uint8Array(decryptedChunk);
      result.set(chunkData, resultOffset);
      resultOffset += chunkData.length;
    }
    
    return result.buffer;
  } catch (error: any) {
    console.error('Large file decryption error:', error);
    throw new Error(`Large file decryption failed: ${error.message}`);
  }
}

// Convert CryptoJS WordArray to Uint8Array
export const convertWordArrayToUint8Array = (wordArray: CryptoJS.lib.WordArray): Uint8Array => {
  const words = wordArray.words;
  const sigBytes = wordArray.sigBytes;
  const result = new Uint8Array(sigBytes);
  
  let i = 0;
  for (let j = 0; j < sigBytes; j += 4) {
    const byte1 = (words[i] >> 24) & 0xff;
    const byte2 = (words[i] >> 16) & 0xff;
    const byte3 = (words[i] >> 8) & 0xff;
    const byte4 = words[i] & 0xff;
    
    if (j < sigBytes) result[j] = byte1;
    if (j + 1 < sigBytes) result[j + 1] = byte2;
    if (j + 2 < sigBytes) result[j + 2] = byte3;
    if (j + 3 < sigBytes) result[j + 3] = byte4;
    
    i++;
  }
  
  return result;
};

// Split file into chunks and convert to JSON
export const splitFileIntoJsonChunks = async (file: File, chunkSize: number = 5 * 1024 * 1024): Promise<{
  chunks: string[];
  encryptionKey: string;
  totalChunks: number;
}> => {
  // Read the file
  const fileBuffer = await file.arrayBuffer();
  // Encrypt the file data
  const encryptionKey = generateEncryptionKey();
  const encryptedData = await encryptData(fileBuffer, encryptionKey);
  
  // Calculate the number of chunks
  const totalChunks = Math.ceil(encryptedData.length / chunkSize);
  const chunks: string[] = [];
  
  // Split the encrypted data into chunks
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, encryptedData.length);
    const chunkData = encryptedData.slice(start, end);
    
    // Create JSON chunk with metadata
    const jsonChunk = JSON.stringify({
      chunkIndex: i,
      totalChunks: totalChunks,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      chunkData: chunkData,
      timestamp: new Date().toISOString(),
    });
    
    chunks.push(jsonChunk);
  }
  
  return {
    chunks,
    encryptionKey,
    totalChunks
  };
};

// Reassemble JSON chunks into original file
export const reassembleJsonChunks = async (chunks: string[], encryptionKey: string): Promise<ArrayBuffer> => {
  if (!chunks.length) {
    throw new Error('No chunks provided for reassembly');
  }
  
  // Parse the chunks and sort by index
  const parsedChunks = chunks.map(chunk => JSON.parse(chunk))
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
  
  // Verify all chunks are present
  const totalChunks = parsedChunks[0].totalChunks;
  if (parsedChunks.length !== totalChunks) {
    throw new Error(`Missing chunks: got ${parsedChunks.length}, expected ${totalChunks}`);
  }
  
  // Concatenate chunk data
  const encryptedData = parsedChunks.reduce((acc, chunk) => {
    if (!validateChunkFormat(chunk)) {
      throw new Error('Invalid chunk format');
    }
    return acc + chunk.chunkData;
  }, '');
  
  // Decrypt the data
  return await decryptData(encryptedData, encryptionKey);
};

// Check if file needs chunking based on size
export const needsChunking = (fileSize: number): boolean => {
  return fileSize > 5 * 1024 * 1024; // 5MB
};

// Generate a random string to serve as a chunk identifier
export const generateChunkId = (): string => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

