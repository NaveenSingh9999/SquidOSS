/**
 * useTransferIntegrity - Hook for file integrity verification
 * 
 * Features:
 * - SHA-256 checksum calculation
 * - Pre-upload verification
 * - Post-download verification
 * - Corruption detection
 * - Progress tracking for large files
 */

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface IntegrityCheckResult {
  isValid: boolean;
  originalChecksum: string;
  calculatedChecksum: string;
  fileSize: number;
  verificationTime: number;
  error?: string;
}

export interface IntegrityState {
  isVerifying: boolean;
  progress: number;
  result: IntegrityCheckResult | null;
}

// Calculate SHA-256 checksum
export const calculateSHA256 = async (data: ArrayBuffer): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Calculate checksum for File with progress
export const calculateFileChecksum = async (
  file: File | Blob,
  onProgress?: (progress: number) => void
): Promise<string> => {
  const CHUNK_SIZE = 64 * 1024 * 1024; // 64MB chunks
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  // For streaming hash, we'll hash all chunks then combine
  const chunkHashes: string[] = [];
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const buffer = await chunk.arrayBuffer();
    const hash = await calculateSHA256(buffer);
    chunkHashes.push(hash);
    
    if (onProgress) {
      onProgress(((i + 1) / totalChunks) * 100);
    }
  }
  
  // Combine all chunk hashes into final hash
  if (chunkHashes.length === 1) {
    return chunkHashes[0];
  }
  
  const combined = chunkHashes.join('');
  const encoder = new TextEncoder();
  return await calculateSHA256(encoder.encode(combined).buffer as ArrayBuffer);
};

// Calculate checksum for ArrayBuffer
export const calculateBufferChecksum = async (buffer: ArrayBuffer): Promise<string> => {
  return await calculateSHA256(buffer);
};

// Verify integrity by comparing checksums
export const verifyIntegrity = (
  originalChecksum: string, 
  calculatedChecksum: string
): boolean => {
  return originalChecksum.toLowerCase() === calculatedChecksum.toLowerCase();
};

// Hook for using integrity verification in components
export const useTransferIntegrity = () => {
  const [state, setState] = useState<IntegrityState>({
    isVerifying: false,
    progress: 0,
    result: null
  });
  const { toast } = useToast();

  const verifyFile = useCallback(async (
    file: File | Blob,
    expectedChecksum?: string
  ): Promise<IntegrityCheckResult> => {
    setState(prev => ({ ...prev, isVerifying: true, progress: 0, result: null }));
    
    const startTime = Date.now();
    
    try {
      const calculatedChecksum = await calculateFileChecksum(file, (progress) => {
        setState(prev => ({ ...prev, progress }));
      });
      
      const verificationTime = Date.now() - startTime;
      const isValid = expectedChecksum 
        ? verifyIntegrity(expectedChecksum, calculatedChecksum) 
        : true;
      
      const result: IntegrityCheckResult = {
        isValid,
        originalChecksum: expectedChecksum || calculatedChecksum,
        calculatedChecksum,
        fileSize: file.size,
        verificationTime
      };
      
      setState(prev => ({ ...prev, isVerifying: false, progress: 100, result }));
      
      if (!isValid) {
        toast({
          title: "Integrity Check Failed",
          description: "The file may be corrupted. Please try again.",
          variant: "destructive"
        });
      }
      
      return result;
      
    } catch (error: any) {
      const result: IntegrityCheckResult = {
        isValid: false,
        originalChecksum: expectedChecksum || '',
        calculatedChecksum: '',
        fileSize: file.size,
        verificationTime: Date.now() - startTime,
        error: error.message
      };
      
      setState(prev => ({ ...prev, isVerifying: false, result }));
      
      toast({
        title: "Verification Error",
        description: error.message,
        variant: "destructive"
      });
      
      return result;
    }
  }, [toast]);

  const verifyBlob = useCallback(async (
    blob: Blob,
    expectedChecksum: string
  ): Promise<IntegrityCheckResult> => {
    return verifyFile(blob, expectedChecksum);
  }, [verifyFile]);

  const generateChecksum = useCallback(async (
    file: File | Blob
  ): Promise<string> => {
    setState(prev => ({ ...prev, isVerifying: true, progress: 0 }));
    
    const checksum = await calculateFileChecksum(file, (progress) => {
      setState(prev => ({ ...prev, progress }));
    });
    
    setState(prev => ({ ...prev, isVerifying: false, progress: 100 }));
    
    return checksum;
  }, []);

  const reset = useCallback(() => {
    setState({
      isVerifying: false,
      progress: 0,
      result: null
    });
  }, []);

  return {
    ...state,
    verifyFile,
    verifyBlob,
    generateChecksum,
    reset
  };
};

// Utility: Compare two files for equality
export const compareFiles = async (
  file1: File | Blob,
  file2: File | Blob,
  onProgress?: (progress: number) => void
): Promise<boolean> => {
  // Quick check: different sizes = not equal
  if (file1.size !== file2.size) {
    return false;
  }
  
  const [checksum1, checksum2] = await Promise.all([
    calculateFileChecksum(file1, p => onProgress?.(p / 2)),
    calculateFileChecksum(file2, p => onProgress?.(50 + p / 2))
  ]);
  
  return verifyIntegrity(checksum1, checksum2);
};

// Utility: Verify chunk integrity during transfer
export const verifyChunk = async (
  chunkData: ArrayBuffer,
  expectedChecksum: string
): Promise<boolean> => {
  const calculatedChecksum = await calculateSHA256(chunkData);
  return verifyIntegrity(expectedChecksum, calculatedChecksum);
};

// Utility: Create a file signature (metadata + first/last chunks hash)
export const createFileSignature = async (file: File): Promise<{
  name: string;
  size: number;
  type: string;
  headChecksum: string;
  tailChecksum: string;
  fullChecksum?: string;
}> => {
  const SAMPLE_SIZE = 1024 * 1024; // 1MB
  
  // Hash first 1MB
  const headSlice = file.slice(0, Math.min(SAMPLE_SIZE, file.size));
  const headBuffer = await headSlice.arrayBuffer();
  const headChecksum = await calculateSHA256(headBuffer);
  
  // Hash last 1MB (or same as head if file is small)
  let tailChecksum = headChecksum;
  if (file.size > SAMPLE_SIZE) {
    const tailStart = Math.max(0, file.size - SAMPLE_SIZE);
    const tailSlice = file.slice(tailStart, file.size);
    const tailBuffer = await tailSlice.arrayBuffer();
    tailChecksum = await calculateSHA256(tailBuffer);
  }
  
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    headChecksum,
    tailChecksum
  };
};

export default useTransferIntegrity;
