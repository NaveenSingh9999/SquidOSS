import React, { useState, useEffect } from 'react';
import { Shield, Lock, FileText, Download, Trash2, Upload, X } from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import EnhancedFileCard from './EnhancedFileCard';
import { backgroundUploadService } from '@/services/backgroundUpload';
import { PINProtectedContent } from './PINProtectedContent';

interface SquidVaultViewProps {
  userId: string;
  onClose: () => void;
}

export default function SquidVaultView({ userId, onClose }: SquidVaultViewProps) {
  const { toast } = useToast();
  const [vaultFiles, setVaultFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVaultFiles();
  }, [userId]);

  const loadVaultFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', userId)
        .eq('in_vault', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVaultFiles(data || []);
    } catch (error) {
      console.error('Error loading vault files:', error);
      toast({
        title: 'Error',
        description: 'Failed to load vault files',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const fileArray = Array.from(files);
      let successCount = 0;
      
      toast({
        title: 'Upload Started',
        description: `Uploading ${fileArray.length} file${fileArray.length > 1 ? 's' : ''} to vault...`
      });

      // Upload files sequentially to vault
      for (const file of fileArray) {
        try {
          // Use background upload service
          const taskId = await backgroundUploadService.addTask(file, '');
          
          // Wait a bit for the upload to complete
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Get the uploaded file and mark it as in vault
          const { data: uploadedFiles, error: findError } = await supabase
            .from('files')
            .select('*')
            .eq('user_id', userId)
            .eq('name', file.name)
            .order('created_at', { ascending: false })
            .limit(1);

          if (!findError && uploadedFiles && uploadedFiles.length > 0) {
            const fileId = uploadedFiles[0].id;
            
            // Mark file as in vault
            const { error: updateError } = await supabase
              .from('files')
              .update({ 
                in_vault: true,
                parent_folder: null  // Files in vault don't have parent folders
              })
              .eq('id', fileId)
              .eq('user_id', userId);

            if (!updateError) {
              successCount++;
            }
          }
        } catch (fileError) {
          console.error(`Error uploading ${file.name}:`, fileError);
        }
      }

      // Refresh vault files
      setTimeout(() => {
        loadVaultFiles();
        
        if (successCount > 0) {
          toast({
            title: 'Upload Complete',
            description: `Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''} to vault`
          });
        }
      }, 2000);
      
    } catch (error) {
      toast({
        title: 'Upload Failed',
        description: 'Failed to upload files to vault',
        variant: 'destructive'
      });
    }
  };

  const removeFromVault = async (fileId: string) => {
    try {
      const { error } = await supabase
        .from('files')
        .update({ in_vault: false, vault_previous_folder: null })
        .eq('id', fileId)
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: 'File Removed',
        description: 'File has been moved out of the vault'
      });

      loadVaultFiles();
    } catch (error) {
      console.error('Error removing from vault:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove file from vault',
        variant: 'destructive'
      });
    }
  };

  return (
    <PINProtectedContent operation="open_vault">
      <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm">
        <div className="container mx-auto h-full py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">SquidVault</h1>
              <p className="text-sm text-slate-400">Secure encrypted storage</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="vault-upload"
              type="file"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
            <Button
              onClick={() => document.getElementById('vault-upload')?.click()}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload to Vault
            </Button>

            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Vault Files */}
        <div className="h-[calc(100vh-200px)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Lock className="w-12 h-12 text-purple-500 mx-auto mb-4 animate-pulse" />
                <p className="text-slate-400">Loading vault...</p>
              </div>
            </div>
          ) : vaultFiles.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Shield className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Vault is Empty</h3>
                <p className="text-slate-400 mb-4">Upload files to keep them secure</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {vaultFiles.map((file) => (
                <EnhancedFileCard
                  key={file.id}
                  file={file}
                  viewMode="grid"
                  onClick={() => {}}
                  onView={() => {}}
                  onDownload={() => {}}
                  onShare={() => {}}
                  onDelete={() => removeFromVault(file.id)}
                  onInfo={() => {}}
                  onVersionHistory={() => {}}
                />
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </PINProtectedContent>
  );
}