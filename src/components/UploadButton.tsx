
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, Folder, Upload as UploadIcon, Camera, Image as ImageIcon } from '@/lib/icon-map';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { backgroundUploadService } from '@/services/backgroundUpload';
import { isNativePlatform, haptics } from '@/utils/mobile';
import { takePhoto, pickFromGallery, requestCameraPermissions } from '@/services/mobileUploadService';

interface UploadButtonProps {
  onUploadComplete?: (file: any) => void;
  onUploadStart?: (file: File, folder?: string) => void;
  onUploadProgress?: (fileName: string, progress: number) => void;
  onUploadError?: (error: any, fileName: string) => void;
  currentFolder?: string;
  allowFolderUpload?: boolean;
  allowMultiple?: boolean;
  maxFiles?: number;
  variant?: "default" | "upload" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  children?: React.ReactNode;
  uploadTargetKey?: string;
}

const UploadButton: React.FC<UploadButtonProps> = ({
  onUploadComplete,
  onUploadStart,
  onUploadProgress,
  onUploadError,
  currentFolder = "",
  allowFolderUpload = false,
  allowMultiple = true,
  maxFiles = 100,
  variant = "upload",
  size = "default",
  children,
  uploadTargetKey,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{[key: string]: number}>({});
  const [showProgress, setShowProgress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  
  const handleFileUpload = async (files: FileList) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to upload files",
        variant: "destructive",
      });
      return;
    }
    
    if (files.length === 0) return;
    
    // Check if number of files exceeds maximum
    if (files.length > maxFiles) {
      toast({
        title: "Too many files",
        description: `Maximum of ${maxFiles} files can be uploaded at once`,
        variant: "destructive",
      });
      return;
    }
    
    setIsOpen(false);
    setShowProgress(true);
    
    // Initialize progress tracking for all files
    const initialProgress: {[key: string]: number} = {};
    Array.from(files).forEach(file => {
      initialProgress[file.name] = 0;
    });
    
    setUploadingFiles(initialProgress);
    
    // Show initial upload started notification
    toast({
      title: "Upload started",
      description: `Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`,
    });
    
    let successCount = 0;
    let failCount = 0;
    const fileArray = Array.from(files);
    
    // Process files with folder structure preservation
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      let uploadFolder = currentFolder;
      
      // Call onUploadStart for each file
      if (onUploadStart) {
        onUploadStart(file, uploadFolder);
      }
      
      // Preserve folder structure from webkitRelativePath
      if ('webkitRelativePath' in file && file.webkitRelativePath) {
        const pathParts = file.webkitRelativePath.split('/');
        pathParts.pop(); // Remove filename
        
        if (pathParts.length > 0) {
          const folderStructure = pathParts.join('/');
          uploadFolder = currentFolder ? `${currentFolder}/${folderStructure}` : folderStructure;
        }
      }
      
      try {
        const updateProgress = (progress: number) => {
          setUploadingFiles(prev => ({
            ...prev,
            [file.name]: progress
          }));
          
          if (onUploadProgress) {
            onUploadProgress(file.name, progress);
          }
        };
        
        // Start with 0% progress
        updateProgress(0);
        
        // Add to upload service (using same logic as drag and drop)
        const taskId = await backgroundUploadService.addTask(file, uploadFolder);
        console.log('Upload service returned task ID:', taskId, 'for file:', file.name);
        
        // Final progress update
        updateProgress(100);
        
        // Track success
        successCount++;
        
        // Show individual success notification only if single file
        if (fileArray.length === 1) {
          toast({
            title: "Upload successful",
            description: `${file.name} has been uploaded successfully.`,
          });
        }
        
        if (onUploadComplete) {
          onUploadComplete({ taskId, name: file.name, size: file.size, type: file.type });
        }
        
        // If this was the last file, hide the progress and show summary
        if (i === fileArray.length - 1) {
          // Show summary notification for multiple files
          if (fileArray.length > 1) {
            toast({
              title: "Upload complete",
              description: `Successfully uploaded ${successCount} of ${fileArray.length} file${fileArray.length > 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}.`,
              variant: failCount > 0 ? "default" : "default",
            });
          }
          
          setTimeout(() => {
            setShowProgress(false);
            setUploadingFiles({});
          }, 2000);
        }
        
      } catch (error) {
        console.error("Upload error:", error);
        
        // Track failure
        failCount++;
        
        if (onUploadError) {
          onUploadError(error, file.name);
        }
        
        // Show error notification
        toast({
          title: "Upload failed",
          description: `Failed to upload ${file.name}: ${(error as Error).message || "Unknown error"}`,
          variant: "destructive",
        });
        
        // Remove the failed file from tracking
        setUploadingFiles(prev => {
          const updated = { ...prev };
          delete updated[file.name];
          return updated;
        });
        
        // If this was the last file, show summary
        if (i === fileArray.length - 1 && fileArray.length > 1) {
          setTimeout(() => {
            setShowProgress(false);
            setUploadingFiles({});
          }, 2000);
        }
      }
    }
  };
  
  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const triggerFolderUpload = () => {
    if (folderInputRef.current) {
      folderInputRef.current.click();
    }
  };

  const handleMobileCamera = async () => {
    await haptics.light();
    const hasPermissions = await requestCameraPermissions();
    
    if (!hasPermissions) {
      toast({
        title: "Camera permission denied",
        description: "Please enable camera access in settings",
        variant: "destructive",
      });
      return;
    }

    const photo = await takePhoto();
    if (photo) {
      setIsOpen(false);
      const file = new File([photo.blob], photo.name, { type: photo.type });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      await handleFileUpload(dataTransfer.files);
    }
  };

  const handleMobileGallery = async () => {
    await haptics.light();
    const photos = await pickFromGallery(allowMultiple);
    
    if (photos.length > 0) {
      setIsOpen(false);
      const dataTransfer = new DataTransfer();
      photos.forEach(photo => {
        const file = new File([photo.blob], photo.name, { type: photo.type });
        dataTransfer.items.add(file);
      });
      await handleFileUpload(dataTransfer.files);
    }
  };

  const buttonContent = children || (
    <>
      <Upload className="h-4 w-4 mr-2" />
      Upload
    </>
  );

  return (
    <>
      {allowFolderUpload ? (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={variant}
              size={size}
              data-upload-trigger={uploadTargetKey}
            >
              {buttonContent}
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className={cn(
              "w-auto p-3",
              isMobile ? "liquid-glass-surface border-0 shadow-lg" : ""
            )}
          >
            <div className="grid gap-3">
              {/* Show camera/gallery options on native mobile */}
              {isNativePlatform() && (
                <>
                  <Button
                    size="sm"
                    className={cn(
                      "w-full transition-all duration-200",
                      isMobile ? "liquid-glass-button" : ""
                    )}
                    onClick={handleMobileCamera}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Take Photo
                  </Button>
                  <Button
                    size="sm"
                    className={cn(
                      "w-full transition-all duration-200",
                      isMobile ? "liquid-glass-button" : ""
                    )}
                    onClick={handleMobileGallery}
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    From Gallery
                  </Button>
                  <div className="border-t border-border my-1" />
                </>
              )}
              <Button
                size="sm"
                className={cn(
                  "w-full transition-all duration-200",
                  isMobile ? "liquid-glass-button" : ""
                )}
                onClick={triggerFileUpload}
              >
                <Upload className="h-4 w-4 mr-2" />
                {allowMultiple ? "Upload Files" : "Upload File"}
              </Button>
              <Button
                size="sm"
                className={cn(
                  "w-full transition-all duration-200",
                  isMobile ? "liquid-glass-button" : ""
                )}
                onClick={triggerFolderUpload}
              >
                <Folder className="h-4 w-4 mr-2" />
                Upload Folder
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <Button
          onClick={triggerFileUpload}
          variant={variant}
          size={size}
          data-upload-trigger={uploadTargetKey}
        >
          {buttonContent}
        </Button>
      )}
      
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple={allowMultiple}
        data-upload-target={uploadTargetKey}
        onChange={(e) => {
          if (e.target.files) {
            handleFileUpload(e.target.files);
            e.target.value = ''; // Reset input
          }
        }}
      />
      
      {allowFolderUpload && (
        <input
          type="file"
          ref={folderInputRef}
          className="hidden"
          // @ts-ignore - webkitdirectory is not in the standard DOM types
          webkitdirectory=""
          // @ts-ignore - directory is not in the standard DOM types
          directory=""
          multiple
          onChange={(e) => {
            if (e.target.files) {
              handleFileUpload(e.target.files);
              e.target.value = ''; // Reset input
            }
          }}
        />
      )}

      {/* Liquid Glass Upload Progress UI */}
      {showProgress && Object.keys(uploadingFiles).length > 0 && (
        <div 
          className={cn(
            "fixed z-50 w-80",
            isMobile 
              ? "bottom-24 left-4 right-4 w-auto liquid-glass-floating rounded-2xl p-4" 
              : "bottom-4 right-4 bg-background border rounded-lg shadow-lg p-4"
          )}
          style={isMobile ? {
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          } : {}}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className={cn(
              "text-sm font-medium",
              isMobile ? "text-foreground/90" : ""
            )}>
              Uploading {Object.keys(uploadingFiles).length} file(s)
            </h3>
            <Button 
              variant="ghost" 
              size="sm" 
              className={cn(
                "h-6 w-6 p-0",
                isMobile ? "liquid-glass-button text-foreground/80 hover:text-foreground" : ""
              )}
              onClick={() => setShowProgress(false)}
            >
              ×
            </Button>
          </div>
          
          <div className="space-y-4 max-h-60 overflow-auto custom-scrollbar">
            {Object.entries(uploadingFiles).map(([fileName, progress]) => (
              <div key={fileName} className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className={cn(
                    "truncate w-48",
                    isMobile ? "text-foreground/80" : ""
                  )}>
                    {fileName}
                  </span>
                  <span className={cn(
                    isMobile ? "text-foreground/80" : ""
                  )}>
                    {Math.round(progress)}%
                  </span>
                </div>
                <div className={cn(
                  "h-1 rounded-full overflow-hidden",
                  isMobile ? "bg-white/20" : "bg-muted"
                )}>
                  <div 
                    className={cn(
                      "h-full transition-all duration-300",
                      isMobile 
                        ? "bg-gradient-to-r from-primary/80 to-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.6)]"
                        : "bg-primary"
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default UploadButton;
