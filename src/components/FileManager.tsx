import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  File, Folder, Upload, Plus, 
  ArrowLeft, MoreVertical, Search,
  FileImage, FileVideo, FileText, 
  FileAudio, FilePlus, Share2,
  Download, Trash2, Clock,
  ChevronRight, ExternalLink, FileArchive,
  FolderPlus, Archive, FileX, CheckSquare,
  Square, PackageCheck, LayoutGrid, LayoutList, Table,
  Check // Added missing Check icon
} from '@/lib/icon-map';
import { Filter } from '@/lib/icon-map';
import { ArrowUp as SortAsc, ArrowDown as SortDesc } from '@/lib/icon-map';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Dialog, 
  DialogContent, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table as TableComponent,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  getAllFiles, 
  createFolder, 
  downloadFile, 
  deleteFile, 
  shareFile,
  markFileViewed,
  formatBytes,
  FileItem as FileItemType,
  FolderItem,
  compressFiles,
  extractArchive,
  isArchiveFile,
  getFileIcon,
  getFileShareId
} from '@/lib/api';
import { backgroundUploadService } from '@/services/backgroundUpload';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import FilePreview from '@/components/FilePreview';
import AppleLoader from '@/components/ui/AppleLoader';
import DragDropUpload from '@/components/DragDropUpload';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FileItem from '@/components/FileItem';
import { useIsMobile } from '@/hooks/use-mobile';
import { analyticsService } from '@/services/analytics-service';
import { securityService } from '@/services/security-service';
// Import JSZip for handling multiple file downloads
import JSZip from 'jszip';
import { backgroundDownloadService } from '@/services/backgroundDownload';

// Fix the interface definition for directory input
// Instead of extending HTMLInputElement, we'll create a custom type
// that adds our non-standard properties
type HTMLInputElementWithDirectory = HTMLInputElement & {
  webkitdirectory?: boolean;
  directory?: boolean;
};

interface FileManagerProps {
  onFileSelected?: (file: FileItemType) => void;
  currentFolder?: string;
  onFolderChange?: (folderPath: string) => void;
  onUpdateFolderFiles?: (files: FileItemType[]) => void;
}

import { EnhancedShareDialog } from './EnhancedShareDialog';

const FileManager: React.FC<FileManagerProps> = ({ 
  onFileSelected,
  currentFolder: initialFolder = "",
  onFolderChange,
  onUpdateFolderFiles
}) => {
  const [shareDialogFile, setShareDialogFile] = useState<{id: string, name: string} | null>(null);
  const [files, setFiles] = useState<(FileItemType | FolderItem)[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolder, setCurrentFolder] = useState<string>(initialFolder);
  const [breadcrumbs, setBreadcrumbs] = useState<{name: string, path: string}[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<FileItemType | FolderItem | null>(null);
  const [selectedItems, setSelectedItems] = useState<(FileItemType | FolderItem)[]>([]);
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCompressDialog, setShowCompressDialog] = useState(false);
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const [extractDestination, setExtractDestination] = useState(currentFolder);
  const [compressName, setCompressName] = useState("");
  const [compressType, setCompressType] = useState<'zip' | 'tar'>('zip');
  const [processingArchive, setProcessingArchive] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [fileToPreview, setFileToPreview] = useState<FileItemType | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'table'>('list');
  const [sortField, setSortField] = useState<'name' | 'size' | 'date'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const { toast } = useToast();
  const navigate = useNavigate();
  // Use the correct type for our ref
  const fileInputRef = useRef<HTMLInputElementWithDirectory>(null);
  const isMobile = useIsMobile();
  
  useEffect(() => {
    const loadFiles = async () => {
      try {
        setLoading(true);
        const allFiles = await getAllFiles(currentFolder);
        setFiles(allFiles);
        
        // Call the onUpdateFolderFiles prop if it exists
        if (onUpdateFolderFiles) {
          // Only pass files that are not folders (i.e., actual files)
          const fileOnlyItems = allFiles.filter(item => !('is_folder' in item) || !item.is_folder) as FileItemType[];
          onUpdateFolderFiles(fileOnlyItems);
        }
      } catch (error) {
        console.error("Error loading files:", error);
        toast({
          title: "Error",
          description: "Failed to load files",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadFiles();
    updateBreadcrumbs();
  }, [currentFolder, toast, onUpdateFolderFiles]);
  
  // Update the parent component when folder changes
  useEffect(() => {
    if (onFolderChange && currentFolder !== initialFolder) {
      onFolderChange(currentFolder);
    }
  }, [currentFolder, initialFolder, onFolderChange]);
  
  // Keep original folder in sync with prop
  useEffect(() => {
    if (initialFolder !== currentFolder) {
      setCurrentFolder(initialFolder);
    }
  }, [initialFolder]);
  
  const updateBreadcrumbs = () => {
    const crumbs = [{ name: "Root", path: "" }];
    
    if (currentFolder) {
      const parts = currentFolder.split('/');
      let currentPath = "";
      
      parts.forEach((part) => {
        currentPath += (currentPath ? "/" : "") + part;
        crumbs.push({
          name: part,
          path: currentPath
        });
      });
    }
    
    setBreadcrumbs(crumbs);
  };
  
  const getFilteredItems = () => {
    return files
      .filter(file => {
        const nameMatch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
        
        if (!nameMatch) return false;
        
        if (activeTab === "all") return true;
        
        if ('is_folder' in file && file.is_folder) {
          return activeTab === "folders";
        }
        
        if (activeTab === "images" && 'type' in file) {
          return file.type.startsWith('image/');
        }
        
        if (activeTab === "documents" && 'type' in file) {
          return file.type.includes('pdf') || 
                file.type.includes('document') || 
                file.type.includes('text') ||
                file.type.includes('sheet');
        }
        
        if (activeTab === "videos" && 'type' in file) {
          return file.type.startsWith('video/');
        }
        
        if (activeTab === "archives" && 'type' in file) {
          return isArchiveFile(file as FileItemType);
        }
        
        return false;
      })
      .sort((a, b) => {
        // Always show folders first
        if ('is_folder' in a && a.is_folder && (!('is_folder' in b) || !b.is_folder)) {
          return -1;
        }
        if ((!('is_folder' in a) || !a.is_folder) && 'is_folder' in b && b.is_folder) {
          return 1;
        }
        
        // Then apply sorting
        if (sortField === 'name') {
          return sortDirection === 'asc' 
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        }
        
        // For non-folder items
        if (!('is_folder' in a) && !('is_folder' in b)) {
          const fileA = a as FileItemType;
          const fileB = b as FileItemType;
          
          if (sortField === 'size') {
            return sortDirection === 'asc'
              ? fileA.size - fileB.size
              : fileB.size - fileA.size;
          }
          
          // Date sorting
          const dateA = new Date(fileA.updated_at || fileA.created_at).getTime();
          const dateB = new Date(fileB.updated_at || fileB.created_at).getTime();
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
        }
        
        // For folders, sort by name only
        return sortDirection === 'asc' 
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      });
  };
  
  const toggleSortDirection = () => {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  };
  
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Convert FileList to array
    const fileArray = Array.from(files);
    
    // Process up to 200 files
    const filesToUpload = fileArray.slice(0, 200);
    
    toast({
      title: "Upload started",
      description: `Processing ${filesToUpload.length} file(s) for upload`,
    });
    
    // Upload each file
    filesToUpload.forEach(file => {
      handleFileUpload(file);
    });
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  const handleFileUpload = async (file: File) => {
    setUploadingFile(file);
    setUploadProgress(0);
    setUploadStage("preparing");
    
    try {
      // Use backgroundUploadService (same logic as drag and drop)
      const taskId = await backgroundUploadService.addTask(file, currentFolder);
      console.log('Upload service returned task ID:', taskId, 'for file:', file.name);
      
      // Track file upload in analytics
      await analyticsService.trackFileUpload(file.name, file.size, file.type);
      await securityService.trackFileAccess(file.name, 'upload');
      
      // Refresh files list to show the new file
      const refreshedFiles = await getAllFiles(currentFolder);
      setFiles(refreshedFiles);
      
      // Update parent component if callback exists
      if (onUpdateFolderFiles) {
        const fileOnlyItems = refreshedFiles.filter(item => !('is_folder' in item) || !item.is_folder) as FileItemType[];
        onUpdateFolderFiles(fileOnlyItems);
      }
      
      toast({
        title: "File Uploaded",
        description: `${file.name} has been uploaded successfully`
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload file",
        variant: "destructive"
      });
    } finally {
      setUploadingFile(null);
      setUploadProgress(0);
      setUploadStage("");
    }
  };
  
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast({
        title: "Error",
        description: "Folder name cannot be empty",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const newFolder = await createFolder(newFolderName, currentFolder);
      setFiles(prev => [newFolder, ...prev]);
      setShowNewFolderDialog(false);
      setNewFolderName("");
      toast({
        title: "Folder Created",
        description: `Created folder ${newFolderName}`
      });
    } catch (error: any) {
      console.error("Error creating folder:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create folder",
        variant: "destructive"
      });
    }
  };
  
  const handleOpenFolder = (folder: FolderItem) => {
    setCurrentFolder(folder.path);
    if (onFolderChange) {
      onFolderChange(folder.path);
    }
    setSelectedItems([]);
    setIsSelectionMode(false);
  };
  
  const handleBackToParent = () => {
    if (breadcrumbs.length <= 1) {
      setCurrentFolder("");
      if (onFolderChange) {
        onFolderChange("");
      }
      return;
    }
    
    const parentIndex = breadcrumbs.length - 2;
    if (parentIndex >= 0) {
      setCurrentFolder(breadcrumbs[parentIndex].path);
      if (onFolderChange) {
        onFolderChange(breadcrumbs[parentIndex].path);
      }
    }
  };
  
  const handleOpenFile = async (file: FileItemType) => {
    try {
      setFileToPreview(file);
      
      await markFileViewed(file.id);
    } catch (error) {
      console.error("Error opening file:", error);
      toast({
        title: "Error",
        description: "Failed to open file",
        variant: "destructive"
      });
    }
  };
  
  const handleDownloadFile = async (file: FileItemType) => {
    const taskId = `download_${file.id}_${Date.now()}`;
    backgroundDownloadService.startTask({
      id: taskId,
      fileName: file.name,
      fileSize: file.size || 0,
    });

    try {
      toast({
        title: "Downloading...",
        description: `Preparing ${file.name} for download.`,
      });
      
      const fileBlob = await downloadFile(file.id, (progress, stage) => {
        console.log(`Download progress: ${progress}%, stage: ${stage}`);
        backgroundDownloadService.updateProgress(taskId, progress);
      });
      
      // Track file download in analytics
      await analyticsService.trackFileDownload(file.name);
      await securityService.trackFileAccess(file.name, 'download');
      
      const { downloadAndSaveBlob } = await import('../utils/downloadHelper');
      await downloadAndSaveBlob(fileBlob, file.name);
      backgroundDownloadService.completeTask(taskId);
      
      toast({
        title: "Download Complete",
        description: `Your file has been downloaded.`,
      });
    } catch (error: any) {
      console.error("Error downloading file:", error);
      backgroundDownloadService.failTask(taskId, error.message);
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download file",
        variant: "destructive"
      });
    }
  };
  
  const handleShareFile = async (item: FileItemType | FolderItem) => {
    setShareDialogFile({ id: item.id, name: item.name });
  };
  
  const handleDeleteConfirm = async () => {
    if (!selectedFile) return;
    
    try {
      if ('is_folder' in selectedFile && selectedFile.is_folder) {
        const { data, error } = await supabase.functions.invoke('github-storage', {
          body: { 
            action: 'delete_folder', 
            path: selectedFile.path 
          }
        });
        
        if (error) {
          throw new Error(error.message);
        }
        
        setFiles(prev => prev.filter(f => 
          !('is_folder' in f) || f.path !== selectedFile.path
        ));
        
        toast({
          title: "Folder Deleted",
          description: `${selectedFile.name} has been deleted`,
        });
      } else {
        await deleteFile((selectedFile as FileItemType).id);
        
        setFiles(prev => prev.filter(f => 
          !('id' in f) || f.id !== selectedFile.id
        ));
        
        toast({
          title: "File Deleted",
          description: `${selectedFile.name} has been deleted`,
        });
      }
    } catch (error: any) {
      console.error("Error deleting:", error);
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete the item",
        variant: "destructive"
      });
    } finally {
      setShowDeleteConfirm(false);
      setSelectedFile(null);
    }
  };
  
  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) return;
    
    try {
      toast({
        title: "Delete started",
        description: `Deleting ${selectedItems.length} items`,
      });
      
      // Process deletion for each item
      const deletePromises = selectedItems.map(async (item) => {
        try {
          if ('is_folder' in item && item.is_folder) {
            await supabase.functions.invoke('github-storage', {
              body: { 
                action: 'delete_folder', 
                path: item.path 
              }
            });
          } else {
            await deleteFile((item as FileItemType).id);
          }
          return true;
        } catch (error) {
          console.error(`Error deleting ${item.name}:`, error);
          return false;
        }
      });
      
      await Promise.all(deletePromises);
      
      // Refresh the file list
      const allFiles = await getAllFiles(currentFolder);
      setFiles(allFiles);
      
      toast({
        title: "Delete complete",
        description: `${selectedItems.length} items deleted`,
      });
      
      setSelectedItems([]);
      setIsSelectionMode(false);
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast({
        title: "Delete failed",
        description: "There was an error deleting the selected items",
        variant: "destructive",
      });
    }
  };
  
  const handleBulkDownload = async () => {
    if (selectedItems.length === 0) return;
    
    // Filter out folders - we can only download files
    const filesToDownload = selectedItems.filter(item => 
      !('is_folder' in item) || !item.is_folder
    ) as FileItemType[];
    
    if (filesToDownload.length === 0) {
      toast({
        title: "No files to download",
        description: "Only files can be downloaded, not folders",
      });
      return;
    }
    
    try {
      toast({
        title: "Download started",
        description: `Preparing ${filesToDownload.length} files for download`,
      });
      
      if (filesToDownload.length === 1) {
        // Single file download
        await handleDownloadFile(filesToDownload[0]);
      } else {
        // Multiple files - create a zip
        const zip = new JSZip();
        
        // Set up progress tracking
        let completedFiles = 0;
        const totalFiles = filesToDownload.length;
        
        // Create a folder in the zip for the files
        const zipFolder = zip.folder("downloaded-files") || zip;
        
        // Add each file to the zip
        const downloadPromises = filesToDownload.map(async (file) => {
          try {
            const blob = await downloadFile(file.id);
            zipFolder.file(file.name, blob);
            
            completedFiles++;
            toast({
              title: "Download progress",
              description: `Downloaded ${completedFiles} of ${totalFiles} files`,
              variant: "default",
            });
            
            return true;
          } catch (error) {
            console.error(`Error downloading file ${file.name}:`, error);
            return false;
          }
        });
        
        await Promise.all(downloadPromises);
        
        // Generate the zip file
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        
        // Trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = `SquidCloud-Files-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast({
          title: "Download complete",
          description: `${filesToDownload.length} files downloaded as a zip file`,
          variant: "default",
        });
      }
    } catch (error) {
      console.error('Bulk download error:', error);
      toast({
        title: "Download failed",
        description: "There was an error downloading the selected files",
        variant: "destructive",
      });
    }
  };
  
  const handleCompressFiles = async () => {
    if (selectedItems.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select files to compress",
        variant: "destructive"
      });
      return;
    }
    
    if (!compressName.trim()) {
      toast({
        title: "Error",
        description: "Archive name cannot be empty",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setProcessingArchive(true);
      
      const filesToCompress = selectedItems.filter(
        item => !('is_folder' in item) || !item.is_folder
      ) as FileItemType[];
      
      if (filesToCompress.length === 0) {
        throw new Error("No valid files selected for compression");
      }
      
      // Add file extension if not provided
      let finalName = compressName;
      if (!finalName.endsWith(`.${compressType}`)) {
        finalName += `.${compressType}`;
      }
      
      const newArchive = await compressFiles(
        filesToCompress,
        finalName,
        compressType,
        currentFolder
      );
      
      setFiles(prev => [newArchive, ...prev]);
      setShowCompressDialog(false);
      setCompressName("");
      setSelectedItems([]);
      setIsSelectionMode(false);
      
      toast({
        title: "Compression Complete",
        description: `${finalName} has been created successfully`
      });
    } catch (error: any) {
      console.error("Error compressing files:", error);
      toast({
        title: "Compression Failed",
        description: error.message || "Failed to compress files",
        variant: "destructive"
      });
    } finally {
      setProcessingArchive(false);
    }
  };
  
  const handleExtractArchive = async () => {
    if (!selectedFile || !('type' in selectedFile)) {
      toast({
        title: "Error",
        description: "No archive selected for extraction",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setProcessingArchive(true);
      
      const extractedFiles = await extractArchive(
        (selectedFile as FileItemType).id,
        extractDestination || currentFolder
      );
      
      // Refresh the file list
      const allFiles = await getAllFiles(currentFolder);
      setFiles(allFiles);
      
      setShowExtractDialog(false);
      setExtractDestination("");
      
      toast({
        title: "Extraction Complete",
        description: `${selectedFile.name} has been extracted (${extractedFiles.length} files)`
      });
    } catch (error: any) {
      console.error("Error extracting archive:", error);
      toast({
        title: "Extraction Failed",
        description: error.message || "Failed to extract archive",
        variant: "destructive"
      });
    } finally {
      setProcessingArchive(false);
    }
  };
  
  const handleItemClick = (item: FileItemType | FolderItem, e: React.MouseEvent) => {
    if (isSelectionMode) {
      e.preventDefault();
      e.stopPropagation();
      
      toggleItemSelection(item);
      return;
    }
    
    if ('is_folder' in item && item.is_folder) {
      handleOpenFolder(item as FolderItem);
    } else {
      handleOpenFile(item as FileItemType);
      
      // If onFileSelected prop exists, call it
      if (onFileSelected && !('is_folder' in item)) {
        onFileSelected(item as FileItemType);
      }
    }
  };
  
  const toggleItemSelection = (item: FileItemType | FolderItem) => {
    if (isItemSelected(item)) {
      setSelectedItems(prev => prev.filter(i => i.id !== item.id));
    } else {
      setSelectedItems(prev => [...prev, item]);
    }
  };
  
  const isItemSelected = (item: FileItemType | FolderItem) => {
    return selectedItems.some(i => i.id === item.id);
  };
  
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (!isSelectionMode) {
      setSelectedItems([]);
    }
  };
  
  const toggleSelectAll = () => {
    if (selectedItems.length === filteredItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredItems);
    }
  };
  
  const renderItemIcon = (item: FileItemType | FolderItem) => {
    if ('is_folder' in item && item.is_folder) {
      return <Folder className="h-10 w-10 text-blue-500" />;
    }
    
    const file = item as FileItemType;
    if (file.type.startsWith('image/')) {
      return <FileImage className="h-10 w-10 text-green-500" />;
    } else if (file.type.startsWith('video/')) {
      return <FileVideo className="h-10 w-10 text-red-500" />;
    } else if (file.type.startsWith('audio/')) {
      return <FileAudio className="h-10 w-10 text-purple-500" />;
    } else if (file.type.includes('pdf') || file.type.includes('document') || file.type.includes('text')) {
      return <FileText className="h-10 w-10 text-amber-500" />;
    } else if (isArchiveFile(file)) {
      return <FileArchive className="h-10 w-10 text-orange-500" />;
    } else {
      return <File className="h-10 w-10 text-gray-500" />;
    }
  };
  
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateStr;
    }
  };
  
  const handleFilesDropped = (droppedFiles: File[]) => {
    if (droppedFiles.length === 0) return;
    
    toast({
      title: "Files received",
      description: `Processing ${Math.min(droppedFiles.length, 200)} file(s) for upload`,
    });
    
    // Process up to 200 files
    droppedFiles.slice(0, 200).forEach(file => {
      handleFileUpload(file);
    });
  };

  const filteredItems = getFilteredItems();

  return (
    <DragDropUpload 
      onDragStateChange={setIsDragging}
      onFilesDropped={handleFilesDropped}
      currentFolder={currentFolder}
      allowFolderUpload={true}
      maxFiles={200}
    >
      <div className={`space-y-4 ${isDragging ? 'border-2 border-dashed border-primary/50 rounded-lg p-4 bg-primary/5' : ''}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap max-w-[60%] py-2">
            {breadcrumbs.length > 0 && (
              <div className="flex items-center space-x-2">
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <button
                      onClick={() => setCurrentFolder(crumb.path)}
                      className={`text-sm ${index === breadcrumbs.length - 1 ? 'font-semibold' : 'text-muted-foreground'}`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <Button
                variant="outline"
                size="sm"
                className={viewMode === 'list' ? 'bg-muted' : ''}
                onClick={() => setViewMode('list')}
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={viewMode === 'grid' ? 'bg-muted' : ''}
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={viewMode === 'table' ? 'bg-muted' : ''}
                onClick={() => setViewMode('table')}
              >
                <Table className="h-4 w-4" />
              </Button>
            </div>
            
            {currentFolder !== "" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleBackToParent}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            
            {isSelectionMode ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleSelectionMode}
                >
                  <FileX className="h-4 w-4 mr-1" />
                  Cancel ({selectedItems.length})
                </Button>
                
                {selectedItems.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleBulkDownload}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleBulkDelete}
                      variant="destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowCompressDialog(true)}
                    >
                      <Archive className="h-4 w-4 mr-1" />
                      Compress
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleSelectionMode}
                >
                  <CheckSquare className="h-4 w-4 mr-1" />
                  Select
                </Button>
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNewFolderDialog(true)}
                >
                  <FolderPlus className="h-4 w-4 mr-1" />
                  New Folder
                </Button>
                
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Upload
                </Button>
              </>
            )}
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUpload}
              className="hidden"
              multiple
              // Set the directory attributes properly
              // @ts-ignore - These attributes are non-standard
              webkitdirectory={true}
              directory={true}
            />
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files and folders..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="All items" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All items</SelectItem>
              <SelectItem value="folders">Folders</SelectItem>
              <SelectItem value="images">Images</SelectItem>
              <SelectItem value="documents">Documents</SelectItem>
              <SelectItem value="videos">Videos</SelectItem>
              <SelectItem value="archives">Archives</SelectItem>
            </SelectContent>
          </Select>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                {sortDirection === 'asc' ? <SortAsc className="mr-2 h-4 w-4" /> : <SortDesc className="mr-2 h-4 w-4" />}
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => setSortField('name')}
                className={sortField === 'name' ? 'bg-muted' : ''}
              >
                {sortField === 'name' && <Check className="mr-2 h-4 w-4" />}
                <span className={sortField === 'name' ? 'ml-6' : ''}>Name</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortField('size')}
                className={sortField === 'size' ? 'bg-muted' : ''}
              >
                {sortField === 'size' && <Check className="mr-2 h-4 w-4" />}
                <span className={sortField === 'size' ? 'ml-6' : ''}>Size</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortField('date')}
                className={sortField === 'date' ? 'bg-muted' : ''}  
              >
                {sortField === 'date' && <Check className="mr-2 h-4 w-4" />}
                <span className={sortField === 'date' ? 'ml-6' : ''}>Date</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleSortDirection}>
                {sortDirection === 'asc' ? (
                  <>
                    <SortAsc className="mr-2 h-4 w-4" />
                    Ascending
                  </>
                ) : (
                  <>
                    <SortDesc className="mr-2 h-4 w-4" />
                    Descending
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {isDragging && (
          <div className="border-2 border-dashed border-primary rounded-lg p-8 flex items-center justify-center">
            <div className="text-center">
              <Upload className="h-10 w-10 text-primary mx-auto mb-4" />
              <p className="text-lg font-medium">Drop your files here</p>
              <p className="text-sm text-muted-foreground">Files will be uploaded to current folder</p>
            </div>
          </div>
        )}
        
        {uploadingFile && (
          <Card className="p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">{uploadingFile.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(uploadingFile.size)}</span>
            </div>
            <Progress value={uploadProgress} className="h-2 mb-2" />
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span className="capitalize">{uploadStage}</span>
              <span>{Math.round(uploadProgress)}%</span>
            </div>
          </Card>
        )}
        
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <AppleLoader size="large" className="mb-4" />
            <p className="text-muted-foreground">Loading files...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <Card className="flex flex-col items-center justify-center h-64 border-dashed">
            <FilePlus className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">No files found</p>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1" />
              Upload Files
            </Button>
          </Card>
        ) : viewMode === 'table' ? (
          <div className="rounded-md border overflow-hidden">
            <TableComponent>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox 
                      checked={selectedItems.length === filteredItems.length && filteredItems.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow 
                    key={item.id}
                    className={isItemSelected(item) ? 'bg-muted/60' : ''}
                  >
                    <TableCell>
                      <Checkbox 
                        checked={isItemSelected(item)}
                        onCheckedChange={(checked) => {
                          if (checked === true || checked === false) {
                            toggleItemSelection(item);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell 
                      className="cursor-pointer"
                      onClick={(e) => handleItemClick(item, e)}
                    >
                      <div className="flex items-center">
                        <div className="mr-2 flex-shrink-0">
                          {renderItemIcon(item)}
                        </div>
                        <div className="font-medium">{item.name}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {'is_folder' in item && item.is_folder
                        ? "Folder"
                        : (item as FileItemType).type.split('/')[1]
                      }
                    </TableCell>
                    <TableCell>
                      {'is_folder' in item && item.is_folder
                        ? "-"
                        : formatBytes((item as FileItemType).size)
                      }
                    </TableCell>
                    <TableCell>{formatDate(item.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {'is_folder' in item && item.is_folder ? (
                              <>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenFolder(item as FolderItem);
                                }}>
                                  <Folder className="h-4 w-4 mr-2" />
                                  Open
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="text-destructive focus:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedFile(item);
                                    setShowDeleteConfirm(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenFile(item as FileItemType);
                                }}>
                                  <File className="h-4 w-4 mr-2" />
                                  Open
                                </DropdownMenuItem>
                                
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadFile(item as FileItemType);
                                }}>
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </DropdownMenuItem>
                                
                                {isArchiveFile(item as FileItemType) && (
                                  <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedFile(item);
                                    setExtractDestination(currentFolder);
                                    setShowExtractDialog(true);
                                  }}>
                                    <PackageCheck className="h-4 w-4 mr-2" />
                                    Extract Here
                                  </DropdownMenuItem>
                                )}
                                
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handleShareFile(item);
                                }}>
                                  <Share2 className="h-4 w-4 mr-2" />
                                  Share
                                </DropdownMenuItem>
                                
                                {(item as FileItemType).shared && (
                                  <DropdownMenuItem 
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const shareId = await getFileShareId((item as FileItemType).id);
                                        if (shareId) {
                                          window.open(`/s/${shareId}`, '_blank');
                                        }
                                      } catch (error) {
                                        console.error('Failed to get share link:', error);
                                      }
                                    }}
                                  >
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    View Share Link
                                  </DropdownMenuItem>
                                )}
                                
                                <DropdownMenuSeparator />
                                
                                <DropdownMenuItem 
                                  className="text-destructive focus:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedFile(item);
                                    setShowDeleteConfirm(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </TableComponent>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredItems.map((item) => (
              <Card
                key={item.id}
                className={`p-3 flex flex-col items-center hover:bg-muted/50 transition-colors cursor-pointer overflow-hidden ${
                  isItemSelected(item) ? 'border-primary border-2' : ''
                }`}
                onClick={(e) => handleItemClick(item, e)}
              >
                {isSelectionMode && (
                  <div className="self-start" onClick={(e) => {
                    e.stopPropagation();
                    toggleItemSelection(item);
                  }}>
                    {isItemSelected(item) ? (
                      <CheckSquare className="h-5 w-5 text-primary" />
                    ) : (
                      <Square className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                )}
                
                <div className="flex-shrink-0 my-3">
                  {renderItemIcon(item)}
                </div>
                
                <div className="w-full text-center">
                  <div className="truncate font-medium text-sm">{item.name}</div>
                  <div className="flex items-center justify-center text-xs text-muted-foreground">
                    {'is_folder' in item && item.is_folder
                      ? <span className="text-blue-500">Folder</span>
                      : formatBytes((item as FileItemType).size)
                    }
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((item) => (
              <Card 
                key={item.id} 
                className={`p-3 flex items-center hover:bg-muted/50 transition-colors cursor-pointer ${
                  isItemSelected(item) ? 'border-primary border-2' : ''
                }`}
                onClick={(e) => handleItemClick(item, e)}
              >
                {isSelectionMode && (
                  <div className="mr-2" onClick={(e) => {
                    e.stopPropagation();
                    toggleItemSelection(item);
                  }}>
                    {isItemSelected(item) ? (
                      <CheckSquare className="h-5 w-5 text-primary" />
                    ) : (
                      <Square className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                )}
                
                <div className="flex-shrink-0 mr-3">
                  {renderItemIcon(item)}
                </div>
                
                <div className="flex-grow min-w-0">
                  <div className="truncate font-medium">{item.name}</div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 mr-1" />
                    <span className="mr-3">{formatDate(item.created_at)}</span>
                    
                    {'size' in item && (
                      <span>{formatBytes((item as FileItemType).size)}</span>
                    )}
                    
                    {'is_folder' in item && item.is_folder && (
                      <span className="ml-3 text-blue-500">Folder</span>
                    )}
                    
                    {'shared' in item && (item as FileItemType).shared && (
                      <span className="ml-3 flex items-center">
                        <Share2 className="h-3 w-3 mr-1 text-primary" />
                        <span className="text-primary">Shared</span>
                      </span>
                    )}
                  </div>
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {'is_folder' in item && item.is_folder ? (
                      <>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleOpenFolder(item as FolderItem);
                        }}>
                          <Folder className="h-4 w-4 mr-2" />
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(item);
                            setShowDeleteConfirm(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleOpenFile(item as FileItemType);
                        }}>
                          <File className="h-4 w-4 mr-2" />
                          Open
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadFile(item as FileItemType);
                        }}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        
                        {isArchiveFile(item as FileItemType) && (
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(item);
                            setExtractDestination(currentFolder);
                            setShowExtractDialog(true);
                          }}>
                            <PackageCheck className="h-4 w-4 mr-2" />
                            Extract Here
                          </DropdownMenuItem>
                        )}
                        
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleShareFile(item);
                        }}>
                          <Share2 className="h-4 w-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                        
                        {(item as FileItemType).shared && (
                          <DropdownMenuItem 
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const shareId = await getFileShareId((item as FileItemType).id);
                                if (shareId) {
                                  window.open(`/s/${shareId}`, '_blank');
                                }
                              } catch (error) {
                                console.error('Failed to get share link:', error);
                              }
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View Share Link
                          </DropdownMenuItem>
                        )}
                        
                        <DropdownMenuSeparator />
                        
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(item);
                            setShowDeleteConfirm(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Card>
            ))}
          </div>
        )}
        
        <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Folder</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="my-4"
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateFolder}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
            </DialogHeader>
            <p className="py-4">
              Are you sure you want to delete "{selectedFile?.name}"? This action cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <Dialog open={showCompressDialog} onOpenChange={setShowCompressDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Compress Files</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <p>
                Compress {selectedItems.length} selected item(s) into an archive
              </p>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Archive Name</label>
                <Input
                  placeholder="archive_name"
                  value={compressName}
                  onChange={(e) => setCompressName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Archive Type</label>
                <Select
                  value={compressType}
                  onValueChange={(value: any) => setCompressType(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Archive type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zip">ZIP</SelectItem>
                    <SelectItem value="tar">TAR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowCompressDialog(false)}
                disabled={processingArchive}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCompressFiles}
                disabled={processingArchive}
              >
                {processingArchive ? (
                  <>
                    <AppleLoader size="small" className="mr-2" />
                    Compressing...
                  </>
                ) : (
                  'Compress Files'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <Dialog open={showExtractDialog} onOpenChange={setShowExtractDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Extract Archive</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <p>
                Extract {selectedFile?.name} to current folder
              </p>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Destination</label>
                <Input
                  placeholder="Current folder"
                  value={extractDestination || currentFolder}
                  onChange={(e) => setExtractDestination(e.target.value)}
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Files will be extracted to: {extractDestination || currentFolder || 'Root folder'}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowExtractDialog(false)}
                disabled={processingArchive}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleExtractArchive}
                disabled={processingArchive}
              >
                {processingArchive ? (
                  <>
                    <AppleLoader size="small" className="mr-2" />
                    Extracting...
                  </>
                ) : (
                  'Extract Now'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {fileToPreview && (
          <FilePreview 
            file={fileToPreview} 
            onClose={() => setFileToPreview(null)} 
          />
        )}
        
        {shareDialogFile && (
          <EnhancedShareDialog
            open={!!shareDialogFile}
            onClose={() => setShareDialogFile(null)}
            file={shareDialogFile}
          />
        )}
      </div>
    </DragDropUpload>
  );
};

export default FileManager;
