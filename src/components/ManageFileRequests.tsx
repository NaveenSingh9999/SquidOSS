import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  getMyFileRequests, toggleFileRequest, deleteFileRequest, getFileRequestSubmissions,
} from '@/lib/api';
import { Inbox, Copy, ExternalLink, Trash2, Eye, Download, Loader2, Calendar } from '@/lib/icon-map';
import { formatDistanceToNow } from 'date-fns';
import { formatBytes } from '@/lib/api';

interface FileRequestItem {
  id: string;
  title: string;
  description: string;
  slug: string;
  folder_path: string;
  max_files: number;
  max_size_per_file: number;
  allowed_types: string[] | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface ManageFileRequestsProps {
  refreshToken?: number;
}

export const ManageFileRequests: React.FC<ManageFileRequestsProps> = ({ refreshToken = 0 }) => {
  const [requests, setRequests] = useState<FileRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const { toast } = useToast();

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const data = await getMyFileRequests();
      setRequests(data);
    } catch (err: any) {
      toast({ title: 'Failed to load', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, [refreshToken]);

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/r/${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Copied', description: 'Link copied to clipboard' });
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await toggleFileRequest(id, isActive);
      setRequests(prev => prev.map(r => r.id === id ? { ...r, is_active: isActive } : r));
      toast({ title: isActive ? 'Activated' : 'Deactivated' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}" and all submissions?`)) return;
    try {
      await deleteFileRequest(id);
      setRequests(prev => prev.filter(r => r.id !== id));
      toast({ title: 'Deleted', description: `"${title}" removed` });
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setSubmissionsLoading(true);
    try {
      const data = await getFileRequestSubmissions(id);
      setSubmissions(data);
    } catch (err: any) {
      toast({ title: 'Failed to load submissions', description: err.message, variant: 'destructive' });
    } finally {
      setSubmissionsLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" /> File Requests</CardTitle>
          <CardDescription>Loading your file requests...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" /> File Requests</CardTitle>
            <CardDescription>{requests.length} request{requests.length !== 1 ? 's' : ''}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Inbox className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No file requests yet</p>
            <p className="text-sm mt-2">Create a file request to get uploads from anyone.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => (
              <div key={req.id} className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium truncate">{req.title}</h4>
                      <Badge variant={req.is_active ? 'default' : 'secondary'} className="text-[10px]">
                        {req.is_active ? 'Active' : 'Paused'}
                      </Badge>
                      {req.expires_at && new Date(req.expires_at) < new Date() && (
                        <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>/r/{req.slug}</span>
                      {req.folder_path && <span>→ {req.folder_path}</span>}
                      {req.expires_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDistanceToNow(new Date(req.expires_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3 shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggleExpand(req.id)} title="View submissions">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => copyLink(req.slug)} title="Copy link">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => window.open(`/r/${req.slug}`, '_blank')} title="Open link">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Switch checked={req.is_active} onCheckedChange={(v) => handleToggle(req.id, v)} />
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDelete(req.id, req.title)} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Submissions */}
                {expandedId === req.id && (
                  <div className="border-t bg-muted/20 px-4 py-3">
                    {submissionsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : submissions.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No submissions yet</p>
                    ) : (
                      <div className="space-y-2">
                        {submissions.map((sub: any) => (
                          <div key={sub.id} className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm border">
                            <div className="flex items-center gap-2 min-w-0">
                              <Download className="w-3.5 h-3.5 text-green-500 shrink-0" />
                              <span className="truncate font-medium">{sub.file_name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{formatBytes(sub.file_size)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                              {sub.uploader_name && <span>{sub.uploader_name}</span>}
                              <span>{formatDistanceToNow(new Date(sub.created_at), { addSuffix: true })}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ManageFileRequests;
