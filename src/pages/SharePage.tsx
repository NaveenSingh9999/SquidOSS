import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Download, 
  Eye, 
  ExternalLink, 
  FileText, 
  FileImage, 
  FileVideo, 
  FileAudio,
  File,
  Folder,
  Calendar,
  HardDrive,
  Type,
  Shield,
  AlertCircle,
  Home,
  ArrowLeft,
  Clock,
  Lock,
  Share2,
  Info,
  Mail
} from '@/lib/icon-map';
import { formatFileSize } from '@/lib/utils';
import { downloadFileWithRes54 } from '@/lib/res54';
import { getFileInfoById } from '@/lib/api';
import EnhancedInstantPreviewModal from '@/components/EnhancedInstantPreviewModal';
import { backgroundDownloadService } from '@/services/backgroundDownload';

interface SharedFileData {
  file_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_created_at: string;
  file_updated_at: string;
  is_encrypted: boolean;
  storage_path: string;
  owner_id: string;
  share_created_at?: string;
  share_expires_at?: string | null;
  share_download_limit?: number;
  share_download_count?: number;
  share_view_only?: boolean;
  share_require_email?: boolean;
  isShared: boolean;
  accessType: 'public' | 'private';
}

const SharePage: React.FC = () => {
  const { shareId, id } = useParams<{ shareId?: string; id?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Support both new shareId param and legacy id param
  const actualShareId = shareId || id;
  
  const [fileData, setFileData] = useState<SharedFileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  // Fetch file data (either shared or direct file access)
  const fetchFileData = useCallback(async () => {
    if (!actualShareId) {
      setError('Invalid file link');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use the new unified API function that handles both share IDs and file IDs
      const fileInfo = await getFileInfoById(actualShareId);
      setFileData(fileInfo);
    } catch (err: any) {
      console.error('Failed to fetch file:', err);
      setError('Failed to load file. The link may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  }, [actualShareId]);

  useEffect(() => {
    fetchFileData();
  }, [fetchFileData]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  // Get appropriate file icon
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <FileImage className="w-8 h-8 text-blue-500" />;
    if (type.startsWith('video/')) return <FileVideo className="w-8 h-8 text-purple-500" />;
    if (type.startsWith('audio/')) return <FileAudio className="w-8 h-8 text-green-500" />;
    if (type.includes('pdf') || type.includes('document') || type.includes('text')) 
      return <FileText className="w-8 h-8 text-orange-500" />;
    return <File className="w-8 h-8 text-gray-500" />;
  };

  // Handle file download
  const handleDownload = async () => {
    if (!fileData) return;

    // Check download limit
    if (fileData.share_download_limit && fileData.share_download_count !== undefined) {
      if (fileData.share_download_count >= fileData.share_download_limit) {
        toast({
          title: "Download limit reached",
          description: "This file has reached its maximum number of downloads.",
          variant: "destructive",
        });
        return;
      }
    }

    // Check view-only mode
    if (fileData.share_view_only) {
      toast({
        title: "View only",
        description: "This file is view-only and cannot be downloaded.",
        variant: "destructive",
      });
      return;
    }

    // Check email collection
    if (fileData.share_require_email && !emailSubmitted) {
      const email = window.prompt('Please enter your email address to download this file:');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast({
          title: "Email required",
          description: "A valid email address is required to download this file.",
          variant: "destructive",
        });
        return;
      }
      setEmailInput(email);
      setEmailSubmitted(true);
    }

    const taskId = `download_${fileData.file_id}_${Date.now()}`;

    try {
      setDownloading(true);
      backgroundDownloadService.startTask({
        id: taskId,
        fileName: fileData.file_name,
        fileSize: fileData.file_size || 0,
      });
      
      toast({
        title: "Download started",
        description: "Your file download is beginning...",
      });

      // Use the RES54 download function with the file data
      const blob = await downloadFileWithRes54(fileData.file_id, (progress, stage, details) => {
        console.log(`Download progress: ${progress}% - ${stage}`, details);
        backgroundDownloadService.updateProgress(taskId, progress);
      });

      // Create download link
      const { downloadAndSaveBlob } = await import('../utils/downloadHelper');
      await downloadAndSaveBlob(blob, fileData.file_name);
      backgroundDownloadService.completeTask(taskId);

      toast({
        title: "Download complete",
        description: `Your file has been downloaded.`,
      });
    } catch (error: any) {
      console.error('Download failed:', error);
      backgroundDownloadService.failTask(taskId, error.message);
      toast({
        title: "Download failed",
        description: error.message || "Failed to download the file.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  // Handle preview
  const handlePreview = () => {
    if (!fileData) return;
    setPreviewOpen(true);
  };

  // Create file object for preview modal
  const getFileForPreview = () => {
    if (!fileData) return null;
    
    return {
      id: fileData.file_id,
      name: fileData.file_name,
      type: fileData.file_type,
      size: fileData.file_size,
      created_at: fileData.file_created_at,
      updated_at: fileData.file_updated_at,
      encrypted: fileData.is_encrypted,
      storage_path: fileData.storage_path,
      user_id: fileData.owner_id
    };
  };

  // Check if file type supports preview
  const supportsPreview = (type: string) => {
    return type.startsWith('image/') || 
           type.startsWith('video/') || 
           type.startsWith('audio/') ||
           type.includes('pdf') ||
           type.startsWith('text/') ||
           type.includes('json') ||
           type.includes('javascript') ||
           ['.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.py', '.html', '.css', '.xml', '.yml', '.yaml'].some(ext => 
             fileData?.file_name.toLowerCase().endsWith(ext)
           );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <div className="text-center space-y-6 animate-in fade-in duration-700">
          <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            <div className="absolute inset-2 bg-primary/40 rounded-full animate-pulse" />
            <div className="absolute inset-4 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/50">
              <Share2 className="w-6 h-6 text-primary-foreground animate-bounce" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold tracking-tight">Establishing Secure Connection</h3>
            <p className="text-muted-foreground font-medium">SquidCloud v11 Feijoa · Res54 Architecture</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !fileData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-lg border-destructive/20 shadow-2xl shadow-destructive/10 animate-in zoom-in-95 duration-500">
          <CardHeader className="text-center space-y-4 pt-10">
            <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center border-8 border-destructive/5">
              <AlertCircle className="w-10 h-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-bold tracking-tight">Access Denied</CardTitle>
              <CardDescription className="text-base font-medium">
                This file is unavailable or you do not have permission to view it.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-center pb-10 px-8">
            <div className="bg-muted/50 rounded-lg p-4 mb-8 text-sm text-left text-muted-foreground border">
              <p className="font-semibold text-foreground mb-1">Common reasons:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>The sender revoked access to this file.</li>
                <li>The secure share link has expired.</li>
                <li>The file was permanently deleted from SquidCloud.</li>
              </ul>
            </div>
            <Button onClick={() => navigate('/')} className="w-full h-12 text-md font-semibold transition-all hover:scale-[1.02]">
              <Home className="w-5 h-5 mr-2" />
              Return to SquidCloud
            </Button>
            <p className="text-xs text-muted-foreground mt-6 font-medium">
              Secured by SquidCloud v11 Feijoa
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-primary/20">
      {/* Sleek Modern Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 shadow-sm">
        <div className="w-full max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20 shadow-inner">
              <Share2 className="w-5 h-5 text-primary" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight leading-tight">SquidCloud</h1>
              <p className="text-[10px] uppercase font-bold tracking-wider text-primary">v11 Feijoa</p>
            </div>
          </div>
          
          <div className="flex z-10 items-center space-x-3">
             {fileData.is_encrypted && (
                <Badge variant="outline" className="hidden sm:flex items-center gap-1 border-opacity-30 border-green-500 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20">
                  <Shield className="w-3 h-3" />
                  <span>Res54 Protected</span>
                </Badge>
             )}
            <Button variant="ghost" size="sm" className="hidden sm:flex" onClick={() => navigate('/')}>
              <Home className="w-4 h-4 mr-2" />
              Go to App
            </Button>
          </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        {/* Desktop View: Split layout / Mobile View: Stacked layout */}
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Left Column (File Info & Preview) */}
          <div className="w-full lg:w-2/3 space-y-6">
            
            {/* Title and Quick Info Card */}
            <Card className="border shadow-lg shadow-black/5 overflow-hidden transition-all duration-300">
              <div className="h-2 bg-gradient-to-r from-primary/80 via-primary to-primary/80" />
              <CardContent className="p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  <div className="flex-shrink-0 p-4 rounded-2xl bg-muted/50 border shadow-sm flex items-center justify-center">
                    {getFileIcon(fileData.file_type)}
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge variant="secondary" className="font-mono text-xs shadow-sm bg-background border">{fileData.file_type.split('/')[1] || 'Unknown'}</Badge>
                      <Badge variant="outline" className="text-xs shadow-sm opacity-70"><HardDrive className="w-3 h-3 mr-1"/>{formatFileSize(fileData.file_size)}</Badge>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate" title={fileData.file_name}>
                      {fileData.file_name}
                    </h2>
                    <p className="text-sm text-muted-foreground flex items-center gap-2 font-medium">
                      <Clock className="w-4 h-4 opacity-70" />
                      Securely shared on {new Date(fileData.share_created_at || fileData.file_created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Content Preview Area - Only visible cleanly on desktop mostly, but adaptive */}
            <Card className="overflow-hidden border shadow-sm hidden md:block">
              <CardHeader className="bg-muted/30 border-b py-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />
                  Instant Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                 {supportsPreview(fileData.file_type) ? (
                    <div className="bg-gradient-to-b from-muted/20 to-muted/50 p-20 text-center flex flex-col items-center justify-center min-h-[300px] transition-colors hover:bg-muted/60 group">
                      <div className="w-20 h-20 bg-background rounded-full shadow-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 ease-out border border-primary/10">
                        {getFileIcon(fileData.file_type)}
                      </div>
                      <h3 className="text-xl font-bold mb-2">Preview Document</h3>
                      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                        This file supports rich preview. Click below to securely view it in the browser without downloading.
                      </p>
                      <Button onClick={handlePreview} size="lg" className="rounded-full shadow-md px-8 hover:shadow-lg transition-all active:scale-95">
                        <Eye className="w-5 h-5 mr-2" />
                        Open Viewer
                      </Button>
                    </div>
                 ) : (
                    <div className="bg-muted/10 p-20 text-center flex flex-col items-center justify-center min-h-[300px]">
                      <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6 border border-dashed border-muted-foreground/30 opacity-50">
                        <File className="w-10 h-10 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">No Preview Available</h3>
                      <p className="text-sm text-muted-foreground max-w-xs">
                        This file type requires native opening. Please download the file to view its contents securely and safely.
                      </p>
                    </div>
                 )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column (Actions and Details) */}
          <div className="w-full lg:w-1/3 space-y-6">
            
            {/* Desktop Action Buttons */}
            <Card className="hidden md:block shadow-lg border-primary/20 relative overflow-hidden">
              {/* Subtle background glow effect */}
              <div className="absolute -right-20 -top-20 w-40 h-40 bg-primary/10 blur-3xl rounded-full pointer-events-none" />
              
              <CardHeader className="pb-4 border-b bg-muted/10">
                 <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <Button onClick={handleDownload} disabled={downloading} size="lg" className="w-full text-md font-semibold h-14 shadow-md transition-all hover:scale-[1.02] bg-primary hover:bg-primary/90">
                  <Download className="w-5 h-5 mr-2" />
                  {downloading ? 'Decrypting & Downloading...' : 'Download Securely'}
                </Button>
                
                {supportsPreview(fileData.file_type) && (
                  <Button variant="outline" onClick={handlePreview} size="lg" className="w-full h-12 shadow-sm border-primary/20 hover:bg-primary/5 transition-all">
                    <Eye className="w-5 h-5 mr-2" />
                    Preview Online
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* File Advanced Details */}
            <Card className="shadow-sm">
              <CardHeader className="bg-muted/10 border-b py-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="w-5 h-5 text-muted-foreground" />
                  Advanced Properties
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y text-sm">
                  
                  {fileData.is_encrypted && (
                    <div className="px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-green-500/5 dark:bg-green-500/10">
                      <div className="flex items-center text-green-700 dark:text-green-400 font-semibold gap-2">
                        <Lock className="w-4 h-4 shrink-0" /> 
                        <span className="truncate">Distributed Security</span>
                      </div>
                    </div>
                  )}

                  <div className="px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/30 transition-colors">
                    <span className="text-muted-foreground font-medium shrink-0">MIME Type</span>
                    <span className="font-mono text-xs bg-muted px-2 py-1 rounded border overflow-hidden text-ellipsis whitespace-nowrap max-w-full" title={fileData.file_type}>
                      {fileData.file_type}
                    </span>
                  </div>

                  <div className="px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/30 transition-colors">
                    <span className="text-muted-foreground font-medium shrink-0">Encryption Status</span>
                    <span className="font-semibold text-foreground sm:text-right">
                       {fileData.is_encrypted ? "Post-Quantum Secure" : "Standard Storage"}
                    </span>
                  </div>

                  {fileData.share_view_only && (
                    <div className="px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-blue-500/5 dark:bg-blue-500/10">
                      <div className="flex items-center text-blue-700 dark:text-blue-400 font-semibold gap-2">
                        <Eye className="w-4 h-4 shrink-0" /> View Only
                      </div>
                      <span className="font-semibold text-blue-700 dark:text-blue-400">Downloads disabled</span>
                    </div>
                  )}
                  {fileData.share_require_email && (
                    <div className="px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-purple-500/5 dark:bg-purple-500/10">
                      <div className="flex items-center text-purple-700 dark:text-purple-400 font-semibold gap-2">
                        <Mail className="w-4 h-4 shrink-0" /> Email Required
                      </div>
                      <span className="font-semibold text-purple-700 dark:text-purple-400">{emailSubmitted ? 'Submitted' : 'Pending'}</span>
                    </div>
                  )}
                  {fileData.share_expires_at && (
                    <div className="px-4 md:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-orange-500/5 dark:bg-orange-500/10">
                       <div className="flex items-center text-orange-700 dark:text-orange-400 font-semibold gap-2">
                         <AlertCircle className="w-4 h-4 shrink-0" /> Expiration
                       </div>
                       <span className="font-semibold text-orange-700 dark:text-orange-400">
                         {new Date(fileData.share_expires_at).toLocaleDateString()}
                       </span>
                    </div>
                  )}

                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </main>

      {/* Mobile Sticky Bottom Action Bar */}
      <div className="md:hidden fixed bottom-6 left-4 right-4 p-4 bg-card/60 backdrop-blur-2xl border border-border/50 rounded-3xl z-40 shadow-2xl transition-all transform duration-500 animate-in slide-in-from-bottom-full">
         <div className="flex gap-3 max-w-lg mx-auto">
            {supportsPreview(fileData.file_type) && (
              <Button variant="outline" onClick={handlePreview} className="flex-1 h-14 rounded-2xl border-border/50 bg-background/50 hover:bg-background/80 shadow-sm transition-all focus:ring-0 active:scale-95">
                <Eye className="w-5 h-5 mr-2" />
                View
              </Button>
            )}
            <Button onClick={handleDownload} disabled={downloading} className={`h-14 rounded-2xl shadow-lg transition-all active:scale-95 hover:opacity-90 ${supportsPreview(fileData.file_type) ? 'flex-1 bg-primary text-primary-foreground' : 'w-full bg-primary text-primary-foreground'}`}>
              <Download className="w-5 h-5 mr-2" />
              {downloading ? 'Wait...' : 'Download'}
            </Button>
         </div>
      </div>

      {/* Add padding at bottom for mobile to not hide content behind fixed bar */}
      <div className="h-32 md:hidden" />

      {/* Footer Branding */}
      <footer className="mt-auto py-8 text-center text-muted-foreground relative z-10 border-t bg-muted/20">
        <p className="text-sm font-medium tracking-tight">
          Powered by <span className="text-primary font-bold">SquidCloud v11 Feijoa</span>
        </p>
        <p className="text-xs opacity-70 mt-1">Zero-Knowledge Cloud Infrastructure • BYOK Supported</p>
      </footer>

      {/* Modals & Portals */}
      {previewOpen && (
        <EnhancedInstantPreviewModal
          file={getFileForPreview()}
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
};

export default SharePage;
