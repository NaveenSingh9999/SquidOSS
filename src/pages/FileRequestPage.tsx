import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getFileRequestBySlug, submitFileRequest, uploadFile } from '@/lib/api';
import { Inbox, Upload, Check, AlertCircle, Loader2, Globe, Clock, FileText, HardDrive } from '@/lib/icon-map';
import { formatBytes } from '@/lib/api';

interface FileRequestData {
  id: string;
  title: string;
  description: string;
  slug: string;
  max_files: number;
  max_size_per_file: number;
  allowed_types: string[] | null;
  expires_at: string | null;
  is_active: boolean;
  folder_path: string;
  submission_count: number;
}

const FileRequestPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [request, setRequest] = useState<FileRequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploaderName, setUploaderName] = useState('');
  const [uploaderEmail, setUploaderEmail] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [uploadComplete, setUploadComplete] = useState(false);

  const authRequired = !authLoading && !user;
  const canUpload = !!user && !authLoading;

  const handleSignIn = useCallback(() => {
    const next = slug ? `/r/${slug}` : '/';
    navigate(`/auth?next=${encodeURIComponent(next)}`);
  }, [navigate, slug]);

  const handlePickFiles = useCallback(() => {
    if (!canUpload) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to upload files to this request.',
        variant: 'destructive',
      });
      return;
    }

    document.getElementById('file-input')?.click();
  }, [canUpload, toast]);

  useEffect(() => {
    if (!slug) {
      setError('Invalid file request link');
      setLoading(false);
      return;
    }

    const fetch = async () => {
      try {
        const data = await getFileRequestBySlug(slug);
        setRequest(data);
      } catch (err: any) {
        setError(err.message || 'File request not found or expired');
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [slug]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const validateFiles = (): string | null => {
    if (!request) return 'Request not found';

    if (request.max_files > 0 && selectedFiles.length > request.max_files) {
      return `Maximum ${request.max_files} file(s) allowed`;
    }

    for (const file of selectedFiles) {
      if (request.max_size_per_file > 0 && file.size > request.max_size_per_file) {
        return `"${file.name}" exceeds the maximum file size of ${formatBytes(request.max_size_per_file)}`;
      }

      if (request.allowed_types && request.allowed_types.length > 0) {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!request.allowed_types.some(t => t.toLowerCase() === ext || file.type.startsWith(t))) {
          return `"${file.name}" type is not allowed. Accepted: ${request.allowed_types.join(', ')}`;
        }
      }
    }

    return null;
  };

  const handleSubmit = async () => {
    if (!request || selectedFiles.length === 0) return;
    if (authLoading) return;
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to upload files to this request.',
        variant: 'destructive',
      });
      return;
    }

    const validationError = validateFiles();
    if (validationError) {
      toast({ title: 'Validation error', description: validationError, variant: 'destructive' });
      return;
    }

    setUploading(true);

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setUploadProgress(`Uploading ${i + 1}/${selectedFiles.length}: ${file.name}...`);

      try {
        const uploaded = await uploadFile(file, request.folder_path, (progress) => {
          setUploadProgress(`Uploading ${i + 1}/${selectedFiles.length}: ${Math.round(progress)}%`);
        });

        await submitFileRequest(
          request.id,
          uploaded.id,
          file.name,
          file.size,
          uploaderName || undefined,
          uploaderEmail || undefined,
        );
      } catch (err: any) {
        toast({
          title: `Failed to upload "${file.name}"`,
          description: err.message,
          variant: 'destructive',
        });
        setUploading(false);
        return;
      }
    }

    setUploadComplete(true);
    setUploading(false);
    toast({ title: 'Upload complete!', description: `${selectedFiles.length} file(s) submitted successfully.` });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading upload request...</p>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <CardTitle>Link Expired or Invalid</CardTitle>
            <CardDescription>
              This upload request link is no longer accepting files. Contact the sender for a new link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (uploadComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Files Submitted!</CardTitle>
            <CardDescription>
              Your files have been uploaded successfully. The owner will be notified.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              {selectedFiles.length} file(s) submitted to "{request.title}"
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/50 py-4">
        <div className="max-w-2xl mx-auto px-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Inbox className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">File Upload Request</h1>
            <p className="text-xs text-muted-foreground">Secured by SquidCloud</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{request.title}</CardTitle>
            {request.description && (
              <CardDescription>{request.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {request.max_files > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <FileText className="w-3 h-3" />
                  Max {request.max_files} files
                </Badge>
              )}
              {request.max_size_per_file > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <HardDrive className="w-3 h-3" />
                  Max {formatBytes(request.max_size_per_file)} each
                </Badge>
              )}
              {request.expires_at && (
                <Badge variant="outline" className="gap-1">
                  <Clock className="w-3 h-3" />
                  Expires {new Date(request.expires_at).toLocaleDateString()}
                </Badge>
              )}
              {request.allowed_types && request.allowed_types.length > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Globe className="w-3 h-3" />
                  {request.allowed_types.join(', ')}
                </Badge>
              )}
            </div>

            {authRequired && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Sign in required</AlertTitle>
                <AlertDescription>
                  <p>Uploads for this request need an authenticated account.</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={handleSignIn}>
                    Sign in to upload
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Uploader info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Your name (optional)</Label>
                <Input
                  placeholder="Name"
                  value={uploaderName}
                  onChange={e => setUploaderName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Your email (optional)</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={uploaderEmail}
                  onChange={e => setUploaderEmail(e.target.value)}
                />
              </div>
            </div>

            {/* File selection */}
            <div className="space-y-2">
              <Label>Files</Label>
              <div
                className={`border-2 border-dashed border-border/60 rounded-xl p-6 text-center transition-colors ${canUpload ? 'cursor-pointer hover:border-primary/50' : 'cursor-not-allowed opacity-70'}`}
                onClick={handlePickFiles}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Click to select files</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {request.allowed_types?.length ? request.allowed_types.join(', ') : 'Any file type'} accepted
                </p>
                <input
                  id="file-input"
                  type="file"
                  multiple
                  className="hidden"
                  disabled={!canUpload || uploading}
                  onChange={handleFileSelect}
                />
              </div>

              {selectedFiles.length > 0 && (
                <div className="space-y-1.5">
                  {selectedFiles.map((file, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatBytes(file.size)}</span>
                      </div>
                      <button
                        onClick={() => removeFile(i)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full"
              disabled={uploading || selectedFiles.length === 0 || !canUpload}
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {uploadProgress}</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Upload {selectedFiles.length > 0 ? `(${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''})` : ''}</>
              )}
            </Button>
          </CardContent>
        </Card>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground border-t">
        Powered by SquidCloud · Zero-Knowledge Cloud Infrastructure
      </footer>
    </div>
  );
};

export default FileRequestPage;
