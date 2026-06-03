import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { createFileRequest } from '@/lib/api';
import { Inbox, Loader2 } from '@/lib/icon-map';

interface CreateFileRequestDialogProps {
  open: boolean;
  onClose: () => void;
  currentFolder?: string;
  onCreated?: () => void;
}

export const CreateFileRequestDialog: React.FC<CreateFileRequestDialogProps> = ({
  open,
  onClose,
  currentFolder = '',
  onCreated,
}) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxFiles, setMaxFiles] = useState(0);
  const [maxSizeMB, setMaxSizeMB] = useState(0);
  const [allowedTypes, setAllowedTypes] = useState('');
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ slug: string; url: string } | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({ title: 'Title required', description: 'Please enter a title for this file request.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const parsedTypes = allowedTypes
        ? allowedTypes.split(',').map(t => t.trim()).filter(Boolean)
        : undefined;

      const res = await createFileRequest({
        title: title.trim(),
        description: description.trim(),
        folderPath: currentFolder,
        maxFiles: maxFiles > 0 ? maxFiles : undefined,
        maxSizePerFile: maxSizeMB > 0 ? maxSizeMB * 1024 * 1024 : undefined,
        allowedTypes: parsedTypes,
        expiresAt,
      });

      const url = `${window.location.origin}/r/${res.slug}`;
      await navigator.clipboard.writeText(url);
      setResult({ slug: res.slug, url });

      toast({ title: 'File request created', description: 'Link copied to clipboard!' });
      if (onCreated) onCreated();
    } catch (err: any) {
      toast({ title: 'Failed to create', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (result) {
      navigator.clipboard.writeText(result.url);
      toast({ title: 'Copied', description: 'Link copied to clipboard' });
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setMaxFiles(0);
    setMaxSizeMB(0);
    setAllowedTypes('');
    setExpiresIn(null);
    setResult(null);
    onClose();
  };

  if (result) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Inbox className="w-5 h-5 text-green-500" />
              File Request Created
            </DialogTitle>
            <DialogDescription>
              Share this link so anyone can upload files to your folder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-4">
              <Label className="text-sm font-medium">Public upload link</Label>
              <div className="mt-1 flex gap-2">
                <Input value={result.url} readOnly className="font-mono text-sm" />
                <Button onClick={copyLink} variant="outline" size="sm">Copy</Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone with this link can upload files. You'll find them in your folder.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Inbox className="w-5 h-5" />
            Create File Request
          </DialogTitle>
          <DialogDescription>
            Get a public upload link for anyone to submit files to your folder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              placeholder="e.g. Design Assets for Project X"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Tell uploaders what files you need..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Max files</Label>
              <Input
                type="number"
                min={0}
                placeholder="0 = unlimited"
                value={maxFiles || ''}
                onChange={e => setMaxFiles(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Max size (MB) per file</Label>
              <Input
                type="number"
                min={0}
                placeholder="0 = unlimited"
                value={maxSizeMB || ''}
                onChange={e => setMaxSizeMB(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Allowed file types (comma separated)</Label>
            <Input
              placeholder="e.g. .jpg,.png,.pdf (leave empty for all)"
              value={allowedTypes}
              onChange={e => setAllowedTypes(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Link expiration</Label>
            <div className="flex gap-2">
              {[
                { value: null, label: 'Never' },
                { value: 1, label: '1 day' },
                { value: 7, label: '7 days' },
                { value: 30, label: '30 days' },
              ].map(opt => (
                <Button
                  key={opt.label}
                  type="button"
                  variant={expiresIn === opt.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExpiresIn(opt.value)}
                  className="flex-1"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleCreate}
            className="w-full"
            disabled={loading || !title.trim()}
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
            ) : (
              <><Inbox className="w-4 h-4 mr-2" /> Create File Request</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateFileRequestDialog;
