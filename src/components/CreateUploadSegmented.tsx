import React, { useState, useRef, useMemo } from 'react';
import { Plus, Upload, Folder } from '@/lib/icon-map';
import { cn } from '@/lib/utils';
import UploadButton from '@/components/UploadButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CreateItemDialog from '@/components/CreateItemDialog';
import { useCreateItem } from '@/hooks/use-create-item';
import type { CreateFileType } from '@/hooks/use-create-item';

interface CreateUploadSegmentedProps {
  currentFolder?: string;
  onFileCreated?: () => void;
  onUploadComplete?: (file: any) => void;
  onUploadStart?: (file: File, folder?: string) => void;
  onUploadProgress?: (fileName: string, progress: number) => void;
  onUploadError?: (error: any, fileName: string) => void;
  className?: string;
  disabled?: boolean;
  onDisabledClick?: () => void;
}

const CreateUploadSegmented: React.FC<CreateUploadSegmentedProps> = ({
  currentFolder,
  onFileCreated,
  onUploadComplete,
  onUploadStart,
  onUploadProgress,
  onUploadError,
  className,
  disabled = false,
  onDisabledClick,
}) => {
  const [activeAction, setActiveAction] = useState<'create' | 'upload'>('upload'); // Default to upload
  const uploadButtonRef = useRef<HTMLDivElement>(null);

  // Use the same create item logic as CreateButton
  const {
    fileTypes,
    dialogOpen,
    setDialogOpen,
    fileName,
    setFileName,
    createMode,
    creating,
    openFileDialog,
    openFolderDialog,
    submit,
  } = useCreateItem({ currentPath: currentFolder, onItemCreated: onFileCreated });

  const documentTypes = useMemo<CreateFileType[]>(() => fileTypes.slice(0, 2), [fileTypes]);
  const codeTypes = useMemo<CreateFileType[]>(() => fileTypes.slice(2), [fileTypes]);

  const [createDropdownOpen, setCreateDropdownOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleCreateClick = () => {
    if (disabled) {
      onDisabledClick?.();
      return;
    }
    setActiveAction('create');
    setCreateDropdownOpen(true);
  };

  const handleUploadClick = () => {
    if (disabled) {
      onDisabledClick?.();
      return;
    }
    setActiveAction('upload');
    // Trigger the actual UploadButton
    const button = uploadButtonRef.current?.querySelector('button');
    if (button) {
      button.click();
    }
  };

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) {
      onDisabledClick?.();
      return;
    }
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) {
      onDisabledClick?.();
      return;
    }
    setIsDragging(false);
    
    // Trigger upload with dropped files
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setActiveAction('upload');
      // Simulate button click to trigger UploadButton logic
      const button = uploadButtonRef.current?.querySelector('button');
      if (button) {
        // Create a new FileList-like object
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        
        // Find the file input and set its files
        const fileInput = uploadButtonRef.current?.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) {
          fileInput.files = dataTransfer.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  };

  return (
    <div 
      className={cn("relative inline-flex items-center", disabled && "opacity-70", className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          "relative inline-flex items-center rounded-2xl border p-1 shadow-sm transition-all duration-200",
          isDragging
            ? "border-primary/60 bg-primary/5 ring-2 ring-primary/20"
            : "border-border/60 bg-card/70 backdrop-blur"
        )}
      >
        <DropdownMenu open={createDropdownOpen} onOpenChange={setCreateDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button
              onClick={handleCreateClick}
              aria-disabled={disabled}
              className={cn(
                "relative inline-flex h-9 min-w-[116px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-all",
                "outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                disabled && "cursor-not-allowed text-muted-foreground",
                activeAction === 'create'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground'
              )}
            >
              <Plus className="h-4 w-4" />
              <span className="whitespace-nowrap">Create</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 z-[9999]">
            <DropdownMenuItem
              onClick={openFolderDialog}
              className="gap-2 cursor-pointer"
            >
              <Folder className="w-4 h-4" />
              <span className="flex-1">New Folder</span>
              <kbd className="text-[10px] text-muted-foreground/50 font-mono">⌘N</kbd>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            
            <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
              Documents
            </div>
            {documentTypes.map((type) => (
              <DropdownMenuItem
                key={type.extension}
                onClick={() => openFileDialog(type)}
                className="gap-2 cursor-pointer"
              >
                <type.icon className="w-4 h-4" />
                {type.name}
              </DropdownMenuItem>
            ))}
            
            <DropdownMenuSeparator />
            
            <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
              Code Files
            </div>
            {codeTypes.map((type) => (
              <DropdownMenuItem
                key={type.extension}
                onClick={() => openFileDialog(type)}
                className="gap-2 cursor-pointer"
              >
                <type.icon className="w-4 h-4" />
                {type.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={handleUploadClick}
          aria-disabled={disabled}
          className={cn(
            "inline-flex h-9 min-w-[116px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-all",
            "outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            disabled && "cursor-not-allowed text-muted-foreground",
            activeAction === 'upload' || isDragging
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground'
          )}
        >
          <Upload className="h-4 w-4" />
          <span className="whitespace-nowrap">{isDragging ? 'Drop here' : 'Upload'}</span>
        </button>
      </div>

      {/* Create Item Dialog */}
      <CreateItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        fileName={fileName}
        onFileNameChange={setFileName}
        onSubmit={submit}
        creating={creating}
        createMode={createMode}
      />

      {/* Hidden Upload Button */}
      <div className="hidden">
        <div ref={uploadButtonRef}>
          <UploadButton
            onUploadComplete={(file) => {
              // Don't show duplicate toast - UploadButton already handles it
              onUploadComplete?.(file);
            }}
            onUploadStart={(file, folder) => {
              // Don't show duplicate toast - UploadButton already handles it
              onUploadStart?.(file, folder);
            }}
            onUploadProgress={(fileName, progress) => {
              // Optional: Show progress toast
              onUploadProgress?.(fileName, progress);
            }}
            onUploadError={(error, fileName) => {
              // Don't show duplicate toast - UploadButton already handles it
              onUploadError?.(error, fileName);
            }}
            currentFolder={currentFolder}
            uploadTargetKey="dashboard-header-upload"
          />
        </div>
      </div>
    </div>
  );
};

export default CreateUploadSegmented;
