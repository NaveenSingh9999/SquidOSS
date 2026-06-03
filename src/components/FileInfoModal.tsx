
import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBytes } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { 
  FileText, 
  Calendar, 
  HardDrive, 
  User, 
  Link,
  Shield,
  Hash,
  Eye,
  Folder,
  Image,
  Video,
  Music,
  Archive,
  Code,
  FileJson,
  MapPin,
  Clock,
  Database,
  FileType,
  Monitor
} from '@/lib/icon-map';

interface FileInfoModalProps {
  file: any | null; // Made more flexible to accept different file interfaces
  open: boolean;
  onClose: () => void;
}

const FileInfoModal: React.FC<FileInfoModalProps> = ({
  file,
  open,
  onClose
}) => {
  const isMobile = useIsMobile();
  
  if (!file) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDateRelative = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  };

  const getFileTypeCategory = (mimeType: string) => {
    if (!mimeType) return 'File';
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType.startsWith('video/')) return 'Video';
    if (mimeType.startsWith('audio/')) return 'Audio';
    if (mimeType.includes('pdf')) return 'PDF Document';
    if (mimeType.includes('text/') || mimeType.includes('json')) return 'Text Document';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'Archive';
    if (mimeType.includes('javascript') || mimeType.includes('typescript')) return 'Code';
    if (mimeType.includes('application/')) return 'Application';
    return 'File';
  };

  const getFileTypeIcon = (mimeType: string) => {
    if (!mimeType) return <FileText className="h-5 w-5 text-gray-500" />;
    if (mimeType.startsWith('image/')) return <Image className="h-5 w-5 text-green-500" />;
    if (mimeType.startsWith('video/')) return <Video className="h-5 w-5 text-red-500" />;
    if (mimeType.startsWith('audio/')) return <Music className="h-5 w-5 text-purple-500" />;
    if (mimeType.includes('pdf')) return <FileText className="h-5 w-5 text-red-600" />;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return <Archive className="h-5 w-5 text-orange-500" />;
    if (mimeType.includes('json')) return <FileJson className="h-5 w-5 text-yellow-500" />;
    if (mimeType.includes('javascript') || mimeType.includes('typescript')) return <Code className="h-5 w-5 text-blue-500" />;
    return <FileText className="h-5 w-5 text-gray-500" />;
  };

  const getFileSizeCategory = (size: number) => {
    if (size < 1024) return 'Tiny';
    if (size < 1024 * 1024) return 'Small';
    if (size < 1024 * 1024 * 10) return 'Medium';
    if (size < 1024 * 1024 * 100) return 'Large';
    return 'Very Large';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(
        "max-w-2xl w-[95vw] max-h-[85vh] flex flex-col p-0",
        isMobile && "bg-[#0d1117]/95 backdrop-blur-2xl border-blue-500/20 rounded-3xl"
      )}>
        <DialogHeader className="p-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            {getFileTypeIcon(file.type)}
            <div className="flex-1 min-w-0">
              <div className={cn("text-lg font-semibold truncate", isMobile && "text-blue-50")}>{file.name}</div>
              <div className={cn("text-sm", isMobile ? "text-blue-200/50" : "text-muted-foreground")}>{getFileTypeCategory(file.type || '')}</div>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 overflow-auto">
          <div className="px-6 pb-6 space-y-6">
            {/* File Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={cn(
                "p-4 rounded-2xl",
                isMobile ? "bg-white/5 border border-white/10" : "border"
              )}>
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className={cn("h-4 w-4", isMobile ? "text-white/50" : "text-muted-foreground")} />
                  <span className={cn("text-sm font-medium", isMobile && "text-white/70")}>Size</span>
                </div>
                <div className={cn("text-lg font-semibold", isMobile && "text-white")}>{formatBytes(file.size || 0)}</div>
                <div className={cn("text-xs", isMobile ? "text-white/40" : "text-muted-foreground")}>{getFileSizeCategory(file.size || 0)}</div>
              </div>
              
              <div className={cn(
                "p-4 rounded-2xl",
                isMobile ? "bg-white/5 border border-white/10" : "border"
              )}>
                <div className="flex items-center gap-2 mb-2">
                  <FileType className={cn("h-4 w-4", isMobile ? "text-white/50" : "text-muted-foreground")} />
                  <span className={cn("text-sm font-medium", isMobile && "text-white/70")}>Type</span>
                </div>
                <div className={cn("text-lg font-semibold", isMobile && "text-white")}>{getFileTypeCategory(file.type || '')}</div>
                <div className={cn("text-xs truncate", isMobile ? "text-white/40" : "text-muted-foreground")}>{file.type || 'Unknown'}</div>
              </div>
              
              <div className={cn(
                "p-4 rounded-2xl",
                isMobile ? "bg-white/5 border border-white/10" : "border"
              )}>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className={cn("h-4 w-4", isMobile ? "text-white/50" : "text-muted-foreground")} />
                  <span className={cn("text-sm font-medium", isMobile && "text-white/70")}>Created</span>
                </div>
                <div className={cn("text-lg font-semibold", isMobile && "text-white")}>{formatDateRelative(file.created_at)}</div>
                <div className={cn("text-xs", isMobile ? "text-blue-300/40" : "text-muted-foreground")}>{new Date(file.created_at).toLocaleDateString()}</div>
              </div>
            </div>

            {/* Basic Information */}
            <div>
              <h4 className={cn("font-semibold mb-3 flex items-center gap-2", isMobile && "text-blue-50")}>
                <FileText className="h-4 w-4" />
                Basic Information
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <p className={cn("text-sm font-medium", isMobile ? "text-blue-200/50" : "text-muted-foreground")}>File Name</p>
                    <p className={cn(
                      "text-sm break-all p-2 rounded-xl",
                      isMobile ? "bg-blue-500/10 text-blue-50" : "bg-muted/50"
                    )}>{file.name}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">MIME Type</p>
                    <p className="text-sm font-mono bg-muted/50 p-2 rounded">{file.type || 'Unknown'}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">File Size</p>
                    <div className="bg-muted/50 p-2 rounded">
                      <p className="text-sm">{formatBytes(file.size || 0)}</p>
                      <p className="text-xs text-muted-foreground">{(file.size || 0).toLocaleString()} bytes</p>
                    </div>
                  </div>
                  
                  {file.parent_folder && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Location</p>
                      <div className="flex items-center gap-2 bg-muted/50 p-2 rounded">
                        <Folder className="h-4 w-4 text-blue-500" />
                        <p className="text-sm font-mono truncate">{file.parent_folder}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <Separator />
            
            {/* Timestamps */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Timestamps
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Created</span>
                  </div>
                  <p className="text-sm">{formatDate(file.created_at)}</p>
                  <p className="text-xs text-muted-foreground">{formatDateRelative(file.created_at)}</p>
                </div>
                
                {file.updated_at && (
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">Last Modified</span>
                    </div>
                    <p className="text-sm">{formatDate(file.updated_at)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateRelative(file.updated_at)}</p>
                  </div>
                )}
              </div>
            </div>
            
            <Separator />
            
            {/* Storage & Security */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Database className="h-4 w-4" />
                Storage & Security
              </h4>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">File ID</span>
                  </div>
                  <p className="text-xs font-mono bg-muted/50 p-2 rounded break-all">{file.id}</p>
                </div>
                
                {(file.encrypted || file.shared || file.is_public || file.preview_available) && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {file.encrypted && (
                      <Badge variant="outline" className="justify-center">
                        <Shield className="h-3 w-3 mr-1 text-green-600" />
                        Encrypted
                      </Badge>
                    )}
                    
                    {file.shared && (
                      <Badge variant="outline" className="justify-center">
                        <Link className="h-3 w-3 mr-1 text-blue-600" />
                        Shared
                      </Badge>
                    )}
                    
                    {file.is_public && (
                      <Badge variant="outline" className="justify-center">
                        <Eye className="h-3 w-3 mr-1 text-purple-600" />
                        Public
                      </Badge>
                    )}
                    
                    {file.preview_available && (
                      <Badge variant="outline" className="justify-center">
                        <Monitor className="h-3 w-3 mr-1 text-orange-600" />
                        Preview
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Technical Details */}
            {(file.processor || file.storage_path || file.user_id) && (
              <>
                <Separator />
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Technical Details
                  </h4>
                  <div className="space-y-3">
                    {file.processor && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Processor</p>
                        <p className="text-sm bg-muted/50 p-2 rounded font-mono">{file.processor}</p>
                      </div>
                    )}
                    
                    {file.storage_path && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Storage Path</p>
                        <p className="text-xs bg-muted/50 p-2 rounded font-mono break-all">{file.storage_path}</p>
                      </div>
                    )}
                    
                    {file.user_id && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Owner ID</p>
                        <p className="text-xs bg-muted/50 p-2 rounded font-mono break-all">{file.user_id}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Additional Metadata */}
            {(file.checksum || file.version || file.compression) && (
              <>
                <Separator />
                <div>
                  <h4 className="font-semibold mb-3">Additional Metadata</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {file.checksum && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Checksum</p>
                        <p className="text-xs bg-muted/50 p-2 rounded font-mono break-all">{file.checksum}</p>
                      </div>
                    )}
                    
                    {file.version && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Version</p>
                        <p className="text-sm bg-muted/50 p-2 rounded">{file.version}</p>
                      </div>
                    )}
                    
                    {file.compression && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Compression</p>
                        <p className="text-sm bg-muted/50 p-2 rounded">{file.compression}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default FileInfoModal;
