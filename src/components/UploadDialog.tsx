
import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, X, File, CheckCircle, AlertCircle } from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete?: () => void;
}

interface UploadFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

const UploadDialog: React.FC<UploadDialogProps> = ({
  open,
  onOpenChange,
  onUploadComplete
}) => {
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  }, []);

  const handleFiles = (files: File[]) => {
    const newUploadFiles: UploadFile[] = files.map(file => ({
      file,
      progress: 0,
      status: 'pending'
    }));

    setUploadFiles(prev => [...prev, ...newUploadFiles]);
    
    // Start uploading
    newUploadFiles.forEach((uploadFileItem, index) => {
      startUpload(uploadFileItem, files.length - newUploadFiles.length + index);
    });
  };

  const startUpload = async (uploadFileItem: UploadFile, index: number) => {
    setUploadFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, status: 'uploading' } : f
    ));

    try {
      const formData = new FormData();
      formData.append('file', uploadFileItem.file);

      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadFiles(prev => prev.map((f, i) => 
            i === index ? { ...f, progress } : f
          ));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          setUploadFiles(prev => prev.map((f, i) => 
            i === index ? { ...f, status: 'success', progress: 100 } : f
          ));
          toast({
            title: "Upload successful",
            description: `${uploadFileItem.file.name} has been uploaded.`,
          });
        } else {
          throw new Error('Upload failed');
        }
      };

      xhr.onerror = () => {
        setUploadFiles(prev => prev.map((f, i) => 
          i === index ? { ...f, status: 'error', error: 'Upload failed' } : f
        ));
      };

      xhr.open('POST', '/api/files/upload');
      xhr.send(formData);
    } catch (error) {
      setUploadFiles(prev => prev.map((f, i) => 
        i === index ? { ...f, status: 'error', error: 'Upload failed' } : f
      ));
      toast({
        title: "Upload failed",
        description: `Failed to upload ${uploadFileItem.file.name}`,
        variant: "destructive",
      });
    }
  };

  const clearCompleted = () => {
    setUploadFiles(prev => prev.filter(f => f.status !== 'success'));
  };

  const clearAll = () => {
    setUploadFiles([]);
  };

  const handleClose = () => {
    if (onUploadComplete) {
      onUploadComplete();
    }
    onOpenChange(false);
    setTimeout(() => {
      setUploadFiles([]);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Upload Files
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver 
                ? 'border-primary bg-primary/10' 
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              Drag and drop files here, or click to select
            </p>
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              Select Files
            </Button>
          </div>

          {/* Upload Progress */}
          {uploadFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Upload Progress</h4>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={clearCompleted}>
                    Clear Completed
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    Clear All
                  </Button>
                </div>
              </div>
              
              <div className="max-h-48 overflow-y-auto space-y-2">
                {uploadFiles.map((uploadFileItem, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <File className="h-4 w-4" />
                      <span className="text-sm font-medium truncate flex-1">
                        {uploadFileItem.file.name}
                      </span>
                      {uploadFileItem.status === 'success' && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {uploadFileItem.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    
                    {uploadFileItem.status === 'uploading' && (
                      <Progress value={uploadFileItem.progress} className="mb-1" />
                    )}
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{(uploadFileItem.file.size / 1024 / 1024).toFixed(2)} MB</span>
                      <span className="capitalize">{uploadFileItem.status}</span>
                    </div>
                    
                    {uploadFileItem.error && (
                      <p className="text-xs text-red-500 mt-1">{uploadFileItem.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UploadDialog;
