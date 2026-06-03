import React, { useState, useCallback, ReactNode, useRef, useEffect } from 'react';
import { uploadFile } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface DragDropUploadProps {
  children: ReactNode;
  onDragStateChange?: (isDragging: boolean) => void;
  onFilesDropped?: (files: File[], folderPath?: string) => void;
  currentFolder?: string;
  allowFolderUpload?: boolean;
  maxFiles?: number;
  onUploadProgress?: (fileName: string, progress: number) => void;
  onUploadComplete?: (fileName: string, success: boolean) => void;
}

const traverseFileTree = async (item: any, path = '') => {
  return new Promise<File[]>(async (resolve) => {
    if (item.isFile) {
      item.file((file: File) => {
        // Custom path property to maintain folder structure
        Object.defineProperty(file, 'path', {
          value: path + file.name,
          writable: true
        });
        resolve([file]);
      });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      const filesInDirectory: File[] = [];
      
      // Read directory contents
      const readEntries = () => {
        dirReader.readEntries(async (entries: any[]) => {
          if (entries.length === 0) {
            resolve(filesInDirectory);
            return;
          }
          
          for (const entry of entries) {
            const entryFiles = await traverseFileTree(entry, path + item.name + '/');
            filesInDirectory.push(...entryFiles);
          }
          
          // Keep reading until no more entries
          readEntries();
        });
      };
      
      readEntries();
    } else {
      resolve([]);
    }
  });
};

const DragDropUpload: React.FC<DragDropUploadProps> = ({
  children,
  onDragStateChange,
  onFilesDropped,
  currentFolder = "",
  allowFolderUpload = false,
  maxFiles = 200,
  onUploadProgress,
  onUploadComplete
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const { toast } = useToast();

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragCounter.current++;
    
    if (dragCounter.current === 1) {
      setIsDragging(true);
      if (onDragStateChange) onDragStateChange(true);
    }
  }, [onDragStateChange]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragCounter.current--;
    
    if (dragCounter.current === 0) {
      setIsDragging(false);
      if (onDragStateChange) onDragStateChange(false);
    }
  }, [onDragStateChange]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (onDragStateChange) onDragStateChange(false);
    dragCounter.current = 0;
    
    let droppedFiles: File[] = [];
    
    // Check if DataTransferItemList is supported
    if (e.dataTransfer.items) {
      // Use DataTransferItemList interface to access the files
      const items = Array.from(e.dataTransfer.items);
      
      if (allowFolderUpload) {
        // Handle folder uploads
        const filePromises = items.map(async (item) => {
          // Get entry as webkitGetAsEntry if available
          const entry = item.webkitGetAsEntry?.();
          
          if (entry) {
            return traverseFileTree(entry);
          }
          
          // Fallback for browsers that don't support webkitGetAsEntry
          if (item.kind === 'file') {
            const file = item.getAsFile();
            return file ? [file] : [];
          }
          
          return [];
        });
        
        const filesArray = await Promise.all(filePromises);
        droppedFiles = filesArray.flat();
      } else {
        // Only accept files, not folders
        items.forEach(item => {
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) droppedFiles.push(file);
          }
        });
      }
    } else {
      // Use DataTransfer interface to access the files
      droppedFiles = Array.from(e.dataTransfer.files);
      
      // For each file, preserve folder structure using webkitRelativePath if available
      droppedFiles.forEach(file => {
        if (file.webkitRelativePath && !('path' in file)) {
          Object.defineProperty(file, 'path', {
            value: file.webkitRelativePath,
            writable: true
          });
        }
      });
    }
    
    // Limit the number of files
    if (droppedFiles.length > maxFiles) {
      toast({
        title: `Too many files`,
        description: `Maximum ${maxFiles} files allowed. Processing first ${maxFiles} files.`,
        variant: "destructive"
      });
      droppedFiles = droppedFiles.slice(0, maxFiles);
    }
    
    if (droppedFiles.length > 0 && onFilesDropped) {
      // Just pass the files to the parent component - let it handle the upload logic
      onFilesDropped(droppedFiles, currentFolder);
    }
  }, [onDragStateChange, onFilesDropped, currentFolder, toast, allowFolderUpload, maxFiles]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="w-full h-full min-h-[calc(100vh-4rem)] transition-colors duration-200"
    >
      {children}
    </div>
  );
};

export default DragDropUpload;
