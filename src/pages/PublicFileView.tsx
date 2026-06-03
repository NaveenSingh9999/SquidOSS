import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Eye, FileText, Image, Video, Music } from '@/lib/icon-map';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ImageViewer from '@/components/ImageViewer';
import JWPlayer from '@/components/JWPlayer';
import PDFViewer from '@/components/PDFViewer';
import { formatBytes } from '@/lib/utils';

const PublicFileView = () => {
  const { id } = useParams();
  const [file, setFile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadPublicFile();
    }
  }, [id]);

  const loadPublicFile = async () => {
    if (!id) {
      setError('File ID is missing');
      setLoading(false);
      return;
    }

    try {
      // Query public files
      const { data: fileData, error: fileError } = await supabase
        .from('files')
        .select('*')
        .eq('id', id)
        .eq('is_public', true)
        .single();

      if (fileError) {
        throw new Error('File not found or not public');
      }

      setFile(fileData);
    } catch (error: any) {
      console.error('Error loading public file:', error);
      setError(error.message || 'Failed to load file');
      toast.error(error.message || 'Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!file) return;

    try {
      const { data } = supabase.storage
        .from('files')
        .getPublicUrl(file.storage_path);

      if (data?.publicUrl) {
        const link = document.createElement('a');
        link.href = data.publicUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.success('Download started');
      }
    } catch (error: any) {
      console.error('Download error:', error);
      toast.error('Failed to download file');
    }
  };

  const loadFileUrl = async () => {
    if (fileUrl) return fileUrl;
    
    if (!file) return null;

    const { data } = supabase.storage
      .from('files')
      .getPublicUrl(file.storage_path);

    const url = data?.publicUrl;
    if (url) {
      setFileUrl(url);
      return url;
    }
    
    toast.error('File URL not available');
    return null;
  };

  const handleView = async () => {
    const url = await loadFileUrl();
    if (url) {
      setShowViewer(true);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-16 h-16 text-green-500" />;
    if (type.startsWith('video/')) return <Video className="w-16 h-16 text-purple-500" />;
    if (type.startsWith('audio/')) return <Music className="w-16 h-16 text-yellow-500" />;
    return <FileText className="w-16 h-16 text-gray-500" />;
  };

  const renderViewer = () => {
    if (!file || !showViewer || !fileUrl) return null;

    const fileForViewer = {
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      created_at: file.created_at,
      updated_at: file.updated_at || file.created_at,
      user_id: file.user_id,
      storage_path: file.storage_path,
      encrypted: file.encrypted || false,
      shared: true,
      encryption_key: file.encryption_key,
      tags: file.tags || [],
      github_repo: file.github_repo,
      parent_folder: file.parent_folder
    };

    if (file.type.startsWith('image/')) {
      return (
        <ImageViewer
          file={fileForViewer}
          src={fileUrl}
          open={showViewer}
          onClose={() => setShowViewer(false)}
          onDownload={handleDownload}
        />
      );
    }

    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      return (
        <JWPlayer
          src={fileUrl}
          title={file.name}
          open={showViewer}
          onClose={() => setShowViewer(false)}
        />
      );
    }

    if (file.type === 'application/pdf') {
      return (
        <PDFViewer
          file={fileForViewer}
          src={fileUrl}
          open={showViewer}
          onClose={() => setShowViewer(false)}
          onDownload={handleDownload}
        />
      );
    }

    // For other file types, show a simple modal
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4">{file.name}</h3>
          <p className="text-gray-600 mb-4">
            This file type cannot be previewed in the browser.
          </p>
          <div className="flex gap-2 justify-end">
            <Button onClick={() => setShowViewer(false)} variant="outline">
              Close
            </Button>
            <Button onClick={handleDownload}>
              Download
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading file...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">File Not Found</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p>The requested file could not be found or is not public.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-8 px-4">
          <Card className="w-full max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-4">
                {getFileIcon(file.type)}
                <div>
                  <h1 className="text-2xl font-bold">{file.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {formatBytes(file.size)} • {file.type}
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div className="text-center">
                <p className="text-muted-foreground mb-6">
                  This is a public file. You can view or download it below.
                </p>
                
                <div className="flex gap-4 justify-center">
                  <Button onClick={handleView} className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    View File
                  </Button>
                  
                  <Button onClick={handleDownload} variant="outline" className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              </div>
              
              <div className="border-t pt-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">File Name:</span>
                    <p className="text-muted-foreground break-all">{file.name}</p>
                  </div>
                  <div>
                    <span className="font-medium">File Size:</span>
                    <p className="text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  <div>
                    <span className="font-medium">File Type:</span>
                    <p className="text-muted-foreground">{file.type}</p>
                  </div>
                  <div>
                    <span className="font-medium">Created:</span>
                    <p className="text-muted-foreground">{new Date(file.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {renderViewer()}
    </>
  );
};

export default PublicFileView;
