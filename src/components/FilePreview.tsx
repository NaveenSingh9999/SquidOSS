import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Eye, Download, File, FileText, Image, Video, Music, FileSpreadsheet, FileCode, Lock, Maximize, Minimize } from '@/lib/icon-map';
import { downloadFile } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

interface FilePreviewProps {
  file: {
    id: string;
    name: string;
    type: string;
    previewUrl?: string;
    htmlUrl?: string;
    encrypted: boolean;
    processor?: string;
    preview_available?: boolean;
    preview_type?: string;
  };
  onClose?: () => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({ file, onClose }) => {
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState("preview");
  const [textContent, setTextContent] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && !previewContent) {
      loadPreview();
    }
  }, [open, previewContent]);

  useEffect(() => {
    if (!open && onClose) {
      onClose();
    }
  }, [open, onClose]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!previewRef.current) return;

    if (!document.fullscreenElement) {
      previewRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
        toast({
          title: "Fullscreen Error",
          description: "Could not enter fullscreen mode",
          variant: "destructive",
        });
      });
    } else {
      document.exitFullscreen();
    }
  };

  const loadPreview = async () => {
    if (!file.id) return;
    
    setLoading(true);
    setLoadingProgress(0);
    setError(null);
    
    try {
      // Simulate decryption progress
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev < 90) {
            return prev + (Math.random() * 15);
          }
          return prev;
        });
      }, 200);
      
      const blob = await downloadFile(file.id);
      
      clearInterval(progressInterval);
      setLoadingProgress(100);
      
      setTimeout(() => {
        const url = URL.createObjectURL(blob);
        setPreviewContent(url);
        
        // For text files, load the content for editing
        if (file.type.startsWith('text/') || 
            file.type.includes('json') || 
            file.type.includes('javascript') || 
            file.type.includes('css')) {
          blob.text().then(text => {
            setTextContent(text);
          });
        }
        
        setLoading(false);
      }, 500);
    } catch (error: any) {
      console.error("Preview error:", error);
      setError(error.message || "Failed to load preview");
      setLoadingProgress(0);
      toast({
        title: "Preview failed",
        description: "There was a problem loading the file preview",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const handleSaveTextFile = async () => {
    if (!file.id || !editorRef.current) return;
    
    try {
      setLoading(true);
      const newContent = editorRef.current.value;
      
      // Create new blob with updated content
      const blob = new Blob([newContent], { type: file.type });
      
      // Update in storage
      // For this feature to be fully implemented, you'd need to add
      // an update function to your API that handles file updates
      
      // Update local state
      const url = URL.createObjectURL(blob);
      setPreviewContent(url);
      setTextContent(newContent);
      setIsEditing(false);
      
      toast({
        title: "File saved",
        description: `${file.name} has been updated`,
      });
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Save failed",
        description: error.message || "There was a problem saving your changes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      setLoading(true);
      setLoadingProgress(0);
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev < 95) {
            return prev + (Math.random() * 10);
          }
          return prev;
        });
      }, 200);
      
      const blob = await downloadFile(file.id);
      
      clearInterval(progressInterval);
      setLoadingProgress(100);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Download complete",
        description: `${file.name} has been successfully downloaded`,
      });
      
      setTimeout(() => {
        setLoading(false);
      }, 500);
    } catch (error: any) {
      console.error("Download error:", error);
      setLoadingProgress(0);
      toast({
        title: "Download failed",
        description: error.message || "There was a problem downloading your file",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const getFileIcon = () => {
    if (file.type.startsWith('image/')) return <Image className="h-6 w-6 text-blue-500" />;
    if (file.type.startsWith('video/')) return <Video className="h-6 w-6 text-red-500" />;
    if (file.type.startsWith('audio/')) return <Music className="h-6 w-6 text-green-500" />;
    if (file.type.includes('pdf')) return <FileText className="h-6 w-6 text-red-600" />;
    if (file.type.includes('csv') || file.type.includes('excel') || file.type.includes('spreadsheet')) 
      return <FileSpreadsheet className="h-6 w-6 text-green-600" />;
    if (file.type.includes('json') || file.type.includes('javascript') || file.type.includes('html') || file.type.includes('css')) 
      return <FileCode className="h-6 w-6 text-purple-600" />;
    return <File className="h-6 w-6 text-gray-500" />;
  };

  const isEditable = () => {
    return (
      file.type.startsWith('text/') || 
      file.type.includes('json') || 
      file.type.includes('javascript') || 
      file.type.includes('html') || 
      file.type.includes('css') ||
      file.type.includes('markdown') ||
      file.type.includes('md')
    );
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <div className="w-full max-w-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">{file.encrypted ? "Decrypting and loading..." : "Loading file..."}</span>
              <span className="text-sm">{Math.round(loadingProgress)}%</span>
            </div>
            <Progress value={loadingProgress} className="h-2" />
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col justify-center items-center h-64">
          <div className="p-4 rounded-full bg-red-100 dark:bg-red-900 mb-4">
            <FileText className="h-6 w-6 text-red-500" />
          </div>
          <p className="text-muted-foreground">{error}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={loadPreview}
          >
            Retry loading preview
          </Button>
        </div>
      );
    }

    if (!previewContent) {
      return (
        <div className="flex flex-col justify-center items-center h-64">
          <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
            {getFileIcon()}
          </div>
          <p className="text-muted-foreground">No preview available for this file type</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4 mr-2" />
            Download to view
          </Button>
        </div>
      );
    }

    // Render preview based on file type
    if (file.type.startsWith('image/')) {
      return (
        <div ref={previewRef} className={`flex justify-center ${isFullscreen ? 'h-screen items-center bg-black' : ''}`}>
          <img 
            src={previewContent} 
            alt={file.name} 
            className={`${isFullscreen ? 'max-h-screen' : 'max-h-[70vh]'} max-w-full object-contain rounded-md`}
          />
        </div>
      );
    }

    if (file.type.startsWith('video/')) {
      return (
        <div ref={previewRef} className={`flex justify-center ${isFullscreen ? 'h-screen items-center bg-black' : ''}`}>
          <video 
            controls 
            className={`${isFullscreen ? 'max-h-screen' : 'max-h-[70vh]'} max-w-full rounded-md`}
            controlsList="nodownload"
          >
            <source src={previewContent} type={file.type} />
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (file.type.startsWith('audio/')) {
      return (
        <div ref={previewRef} className="p-8 bg-slate-100 dark:bg-slate-800 rounded-md">
          <div className="flex flex-col items-center">
            <div className="w-64 h-64 flex items-center justify-center bg-gradient-to-r from-blue-400 to-blue-600 rounded-full mb-4">
              <Music className="h-24 w-24 text-white" />
            </div>
            <p className="text-lg font-medium text-center mb-4">{file.name}</p>
            <audio controls className="w-full" controlsList="nodownload">
              <source src={previewContent} type={file.type} />
              Your browser does not support the audio tag.
            </audio>
          </div>
        </div>
      );
    }

    if (file.type === 'application/pdf') {
      return (
        <div ref={previewRef} className={`${isFullscreen ? 'h-screen' : 'h-[70vh]'}`}>
          <iframe 
            src={`${previewContent}#view=FitH&toolbar=1&navpanes=0`} 
            className="w-full h-full rounded-md border"
            title={file.name}
          />
        </div>
      );
    }

    if (isEditable()) {
      return activeTab === "edit" && isEditing ? (
        <div className="max-h-[70vh] overflow-auto p-4 bg-slate-100 dark:bg-slate-800 rounded-md">
          <textarea
            ref={editorRef}
            className="w-full h-[60vh] font-mono text-sm p-2 border rounded-sm bg-background"
            defaultValue={textContent}
          />
          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveTextFile}
              disabled={loading}
              className="bg-gradient-to-r from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white"
            >
              Save Changes
            </Button>
          </div>
        </div>
      ) : (
        <pre className="max-h-[70vh] overflow-auto p-4 bg-slate-100 dark:bg-slate-800 rounded-md">
          <code>{textContent}</code>
        </pre>
      );
    }

    return (
      <div className="flex flex-col justify-center items-center h-64">
        <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
          {getFileIcon()}
        </div>
        <p className="text-muted-foreground">This file type cannot be previewed directly</p>
        <div className="flex gap-2 mt-4">
          <Button 
            variant="outline" 
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
          <Button 
            onClick={handleDownload}
            disabled={loading}
            className="bg-gradient-to-r from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white"
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (!newOpen) {
          if (onClose) {
            onClose();
          }
          // When closing dialog, exit fullscreen if active
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className={`${isFullscreen ? 'p-0 max-w-none w-screen h-screen m-0' : 'sm:max-w-4xl'}`}>
        {!isFullscreen && (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getFileIcon()}
              <span className="truncate max-w-[500px]">{file.name}</span>
              {file.encrypted && (
                <span className="inline-flex items-center ml-2 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full text-muted-foreground">
                  <Lock className="h-3 w-3 mr-1" />
                  Encrypted
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
        )}
        <div className={`${isFullscreen ? '' : 'mt-2'}`}>
          {isEditable() && !isFullscreen && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="edit">Edit</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {renderPreview()}
        </div>
        {!isFullscreen && (
          <div className="flex justify-end gap-2 mt-4">
            {isEditable() && activeTab === "edit" && !isEditing && (
              <Button 
                variant="outline" 
                onClick={() => setIsEditing(true)}
              >
                Edit Content
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <>
                  <Minimize className="h-4 w-4 mr-2" />
                  Exit Fullscreen
                </>
              ) : (
                <>
                  <Maximize className="h-4 w-4 mr-2" />
                  Fullscreen
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
            <Button 
              onClick={handleDownload}
              disabled={loading}
              className="bg-gradient-to-r from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FilePreview;
