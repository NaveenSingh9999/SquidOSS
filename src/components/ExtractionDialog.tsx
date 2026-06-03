import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Archive, FolderOpen, Loader2 } from '@/lib/icon-map';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ExtractionDialogProps {
  open: boolean;
  onClose: () => void;
  file: {
    id: string;
    name: string;
    type: string;
    size: number;
  };
  onExtractionComplete?: () => void;
}

interface Folder {
  id: string;
  name: string;
  path: string;
}

const ExtractionDialog: React.FC<ExtractionDialogProps> = ({
  open,
  onClose,
  file,
  onExtractionComplete
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('root');
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingFolders, setLoadingFolders] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchFolders();
    }
  }, [open, user]);

  const fetchFolders = async () => {
    if (!user) return;
    
    setLoadingFolders(true);
    try {
      const { data, error } = await supabase
        .from('folders')
        .select('id, name, path')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;

      setFolders(data || []);
    } catch (error) {
      console.error('Error fetching folders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load folders',
        variant: 'destructive',
      });
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleExtract = async () => {
    if (!user) return;

    setExtracting(true);
    setProgress(0);

    try {
      // Create extraction record
      const { data: extraction, error: insertError } = await supabase
        .from('archive_extractions' as any)
        .insert({
          user_id: user.id,
          source_file_id: file.id,
          source_file_name: file.name,
          destination_folder: selectedFolder === 'root' ? null : selectedFolder,
          status: 'pending',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const extractionRecord = extraction as any;

      toast({
        title: 'Extraction Started',
        description: `Extracting ${file.name}...`,
      });

      // Call extraction service
      const { default: archiveService } = await import('@/services/archiveService');
      
      // Set up real-time progress monitoring
      const progressMonitor = setInterval(async () => {
        const { data: currentExtraction } = await supabase
          .from('archive_extractions' as any)
          .select('progress, status')
          .eq('id', extractionRecord.id)
          .single();
        
        if (currentExtraction) {
          setProgress((currentExtraction as any).progress || 0);
          
          if ((currentExtraction as any).status === 'completed' || (currentExtraction as any).status === 'failed') {
            clearInterval(progressMonitor);
          }
        }
      }, 500);

      try {
        await archiveService.extractArchive(
          extractionRecord.id,
          file.id,
          selectedFolder === 'root' ? null : selectedFolder
        );

        clearInterval(progressMonitor);
        setProgress(100);

        toast({
          title: 'Extraction Complete',
          description: `Successfully extracted ${file.name}`,
        });

        // Wait a moment for user to see completion
        setTimeout(() => {
          onClose();
          if (onExtractionComplete) {
            onExtractionComplete();
          }
        }, 1000);
      } catch (extractError: any) {
        clearInterval(progressMonitor);
        throw extractError;
      }

    } catch (error: any) {
      console.error('Extraction error:', error);
      toast({
        title: 'Extraction Failed',
        description: error.message || 'Failed to extract archive',
        variant: 'destructive',
      });
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Extract Archive
          </DialogTitle>
          <DialogDescription>
            Extract the contents of this archive to a folder
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Name */}
          <div className="space-y-2">
            <Label>Archive File</Label>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Archive className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium truncate">{file.name}</span>
            </div>
          </div>

          {/* Destination Folder */}
          <div className="space-y-2">
            <Label>Extract to Folder</Label>
            <Select
              value={selectedFolder}
              onValueChange={setSelectedFolder}
              disabled={extracting || loadingFolders}
            >
              <SelectTrigger>
                <SelectValue>
                  {selectedFolder === 'root' ? (
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      <span>Root Folder (My Files)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      <span>{folders.find(f => f.id === selectedFolder)?.name || 'Select folder'}</span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    <span>Root Folder (My Files)</span>
                  </div>
                </SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      <span>{folder.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Progress Bar (shown during extraction) */}
          {extracting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <Label>Extracting...</Label>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={extracting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExtract}
            disabled={extracting || loadingFolders}
          >
            {extracting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Archive className="mr-2 h-4 w-4" />
                Extract
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExtractionDialog;
