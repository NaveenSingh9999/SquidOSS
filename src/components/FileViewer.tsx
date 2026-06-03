
import React, { useState, useEffect } from 'react';
import { FileItem as FileItemType, downloadFile } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import CustomMediaPlayer from './CustomMediaPlayer';
import ImageViewer from './ImageViewer';
import FileInfoModal from './FileInfoModal';
import EnhancedFilePreview from './EnhancedFilePreview';
import { lazy, Suspense } from 'react';
import TextEditor from './TextEditor';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PDFViewer = lazy(() => import('./PDFViewer'));

const LazyPDFViewer = (props: any) => (
  <Suspense fallback={<p>Loading PDF Viewer...</p>}>
    <PDFViewer {...props} />
  </Suspense>
);
import { Button } from '@/components/ui/button';
import { Play, Download, Info, X, FileText, Image as ImageIcon, Video, Music } from '@/lib/icon-map';
import { useIsMobile } from '@/hooks/use-mobile';

interface FileViewerProps {
  file: FileItemType;
  onDelete?: (file: FileItemType) => void;
  onShare?: (file: FileItemType) => void;
  onDownload?: (file: FileItemType) => void;
  showActions?: boolean;
  onViewClick?: () => void;
  onClose?: () => void;
  open?: boolean;
}

const FileViewer: React.FC<FileViewerProps> = ({ 
  file, 
  onDelete, 
  onShare, 
  onDownload,
  showActions = true,
  onViewClick,
  onClose,
  open = false
}) => {
  const [mediaPlayerOpen, setMediaPlayerOpen] = useState(false);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [fileInfoOpen, setFileInfoOpen] = useState(false);
  const [enhancedPreviewOpen, setEnhancedPreviewOpen] = useState(false);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [textEditorOpen, setTextEditorOpen] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  // Use the open prop with a default of false
  const [previewOpen, setPreviewOpen] = useState(open ?? false);

  // Keep internal state in sync with open prop
  useEffect(() => {
    setPreviewOpen(open ?? false);
  }, [open]);
  const [currentFileId, setCurrentFileId] = useState<string>(file.id);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Reset state when file changes
  useEffect(() => {
    if (file.id !== currentFileId) {
      // Clean up previous file URL
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
      
      // Reset all states
      setFileUrl(null);
      setFileContent('');
      setIsLoadingFile(false);
      setMediaPlayerOpen(false);
      setImageViewerOpen(false);
      setFileInfoOpen(false);
      setEnhancedPreviewOpen(false);
      setPdfViewerOpen(false);
      setTextEditorOpen(false);
      setPreviewOpen(true);
      setCurrentFileId(file.id);
    }
  }, [file.id, currentFileId, fileUrl]);

  const isVideo = (type: string) => {
    return type.startsWith('video/') || 
           ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.3gp', '.m4v']
           .some(ext => file.name.toLowerCase().endsWith(ext));
  };

  const isAudio = (type: string) => {
    return type.startsWith('audio/') ||
           ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a', '.wma']
           .some(ext => file.name.toLowerCase().endsWith(ext));
  };

  const isImage = (type: string) => {
    return type.startsWith('image/') ||
           ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.ico', '.tiff']
           .some(ext => file.name.toLowerCase().endsWith(ext));
  };

  const isText = (type: string) => {
    return type.startsWith('text/') || 
           type.includes('json') || 
           type.includes('javascript') || 
           type.includes('html') ||
           ['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.css', '.xml'].some(ext => file.name.toLowerCase().endsWith(ext));
  };
  const isPDF = (type: string) => {
    return type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
  };

  // Determine if the file is a generic type
  const isGenericFile = !isVideo(file.type) && !isAudio(file.type) && !isImage(file.type) && !isText(file.type) && !isPDF(file.type);

  // Load file for viewing
  const loadFileForViewing = async () => {
    // If file URL already exists for this file, return it
    if (fileUrl && currentFileId === file.id) {
      return fileUrl;
    }
    
    setIsLoadingFile(true);
    try {
      const blob = await downloadFile(file.id);
      const url = URL.createObjectURL(blob);
      setFileUrl(url);
      return url;
    } catch (error: any) {
      console.error("File loading error:", error);
      toast({
        title: "Preview failed",
        description: error.message || "Could not load file preview",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Handle Watch button for videos and audio
  const handleWatchMedia = async () => {
    const url = await loadFileForViewing();
    if (url) {
      setPreviewOpen(false);
      setMediaPlayerOpen(true);
    }
  };

  // Handle view full image
  const handleViewImage = async () => {
    const url = await loadFileForViewing();
    if (url) {
      setPreviewOpen(false);
      setImageViewerOpen(true);
    }
  };

  // Handle PDF viewer
  const handlePDFView = async () => {
    const url = await loadFileForViewing();
    if (url) {
      setPreviewOpen(false);
      setPdfViewerOpen(true);
    }
  };

  // Handle text editor
  const handleTextEdit = async () => {
    try {
      setIsLoadingFile(true);
      const blob = await downloadFile(file.id);
      const text = await blob.text();
      setFileContent(text);
      setPreviewOpen(false);
      setTextEditorOpen(true);
    } catch (error: any) {
      console.error("Text loading error:", error);
      toast({
        title: "Preview failed",
        description: error.message || "Could not load text file",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleDownload = async () => {
    if (onDownload) {
      onDownload(file);
      return;
    }
    
    try {
      toast({
        title: "Download started",
        description: `Downloading ${file.name}...`,
      });
      
      const blob = await downloadFile(file.id);
      
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
      
    } catch (error: any) {
      console.error("Download error:", error);
      toast({
        title: "Download failed",
        description: error.message || "There was a problem downloading your file",
        variant: "destructive",
      });
    }
  };

  const handleViewInfo = () => {
    setFileInfoOpen(true);
  };

  const handleCloseAll = () => {
    setPreviewOpen(false);
    setMediaPlayerOpen(false);
    setImageViewerOpen(false);
    setEnhancedPreviewOpen(false);
    setPdfViewerOpen(false);
    setTextEditorOpen(false);
    if (fileUrl) {
      URL.revokeObjectURL(fileUrl);
      setFileUrl(null);
    }
    onClose?.();
  };

  const getFileIcon = () => {
    if (isVideo(file.type)) return <Video className="h-12 w-12 text-red-500" />;
    if (isAudio(file.type)) return <Music className="h-12 w-12 text-green-500" />;
    if (isImage(file.type)) return <ImageIcon className="h-12 w-12 text-blue-500" />;
    return <FileText className="h-12 w-12 text-gray-500" />;
  };

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [fileUrl]);

  return (
    <>
      {/* Main Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={(open) => !open && handleCloseAll()}>
        <DialogContent className={`${isMobile ? 'max-w-full w-[95vw]' : 'max-w-md'} [&>button]:hidden`}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="truncate">{file.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseAll}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="flex items-center justify-center">
                {getFileIcon()}
              </div>
              
              <div className="text-center">
                <h3 className="font-semibold text-lg mb-1">{file.name}</h3>
                <p className="text-muted-foreground text-sm">
                  {file.type} • {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              
              <div className="flex flex-col w-full space-y-2">
                {isVideo(file.type) && (
                  <Button 
                    onClick={handleWatchMedia}
                    disabled={isLoadingFile}
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    size="lg"
                  >
                    <Play className="mr-2 h-5 w-5" />
                    {isLoadingFile ? 'Loading...' : 'Watch Video'}
                  </Button>
                )}

                {isAudio(file.type) && (
                  <Button 
                    onClick={handleWatchMedia}
                    disabled={isLoadingFile}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    size="lg"
                  >
                    <Music className="mr-2 h-5 w-5" />
                    {isLoadingFile ? 'Loading...' : 'Play Audio'}
                  </Button>
                )}
                
                {isImage(file.type) && (
                  <Button 
                    onClick={handleViewImage}
                    disabled={isLoadingFile}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    size="lg"
                  >
                    <ImageIcon className="mr-2 h-5 w-5" />
                    {isLoadingFile ? 'Loading...' : 'View Image'}
                  </Button>
                )}
                
                {isPDF(file.type) && (
                  <Button 
                    onClick={handlePDFView}
                    disabled={isLoadingFile}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                    size="lg"
                  >
                    <FileText className="mr-2 h-5 w-5" />
                    {isLoadingFile ? 'Loading...' : 'View PDF'}
                  </Button>
                )}

                {isText(file.type) && (
                  <Button 
                    onClick={handleTextEdit}
                    disabled={isLoadingFile}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    size="lg"
                  >
                    <FileText className="mr-2 h-5 w-5" />
                    {isLoadingFile ? 'Loading...' : 'Edit Text'}
                  </Button>
                )}
                
                {!isVideo(file.type) && !isAudio(file.type) && !isImage(file.type) && !isText(file.type) && !isPDF(file.type) && (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground">No preview available for this file type</p>
                  </div>
                )}
                
                <div className="flex space-x-2 pt-2">
                  <Button 
                    variant="outline" 
                    onClick={handleDownload}
                    className="flex-1"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    onClick={handleViewInfo}
                    className="flex-1"
                  >
                    <Info className="mr-2 h-4 w-4" />
                    Info
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Specialized Viewers */}
      <CustomMediaPlayer
        file={file}
        src={fileUrl || ''}
        open={mediaPlayerOpen}
        onClose={() => {
          setMediaPlayerOpen(false);
        }}
      />

      <ImageViewer
        file={file}
        src={fileUrl || ''}
        open={imageViewerOpen}
        onClose={() => {
          setImageViewerOpen(false);
        }}
        onDownload={handleDownload}
      />

      <LazyPDFViewer
        file={file}
        src={fileUrl || ''}
        open={pdfViewerOpen}
        onClose={() => {
          setPdfViewerOpen(false);
        }}
        onDownload={handleDownload}
      />

      <TextEditor
        file={file}
        content={fileContent}
        open={textEditorOpen}
        onClose={() => setTextEditorOpen(false)}
        onDownload={handleDownload}
        readOnly={true}
      />

      <FileInfoModal
        file={file}
        open={fileInfoOpen}
        onClose={() => setFileInfoOpen(false)}
      />
    </>
  );
};

export default FileViewer;
