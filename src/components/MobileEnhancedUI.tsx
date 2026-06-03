import React, { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Files, 
  Share, 
  Download, 
  Settings, 
  Plus,
  Search,
  Filter,
  Grid3X3,
  List,
  Cloud,
  Shield,
  Smartphone,
  HardDrive
} from '@/lib/icon-map';
import { Input } from '@/components/ui/input';
import CreateButton from '@/components/CreateButton';
import EnhancedFileCard from '@/components/EnhancedFileCard';
import DownloadManager from '@/components/DownloadManager';
import TrashTab from '@/components/TrashTab';
import EnhancedInstantPreviewModal from '@/components/EnhancedInstantPreviewModal';

interface MobileEnhancedUIProps {
  files: any[];
  sharedFiles: any[];
  onFileSelect: (file: any) => void;
  onFileDelete: (file: any) => void;
  onFileShare: (file: any) => void;
  onFileDownload: (file: any) => void;
  currentFolder: string;
  selectedFiles: Set<string>;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const MobileEnhancedUI: React.FC<MobileEnhancedUIProps> = ({
  files,
  sharedFiles,
  onFileSelect,
  onFileDelete,
  onFileShare,
  onFileDownload,
  currentFolder,
  selectedFiles,
  viewMode,
  onViewModeChange,
  activeTab,
  onTabChange
}) => {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalSize: 0,
    sharedCount: 0
  });

  useEffect(() => {
    calculateStats();
  }, [files, sharedFiles]);

  const calculateStats = () => {
    const totalFiles = files.length;
    const totalSize = files.reduce((acc, file) => acc + (file.size || 0), 0);
    const sharedCount = sharedFiles.length;
    
    setStats({ totalFiles, totalSize, sharedCount });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSharedFiles = sharedFiles.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isMobile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header - Refined */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        <div className="px-4 py-3">
          {/* Top row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Cloud className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-foreground">CloudBliss</h1>
                <p className="text-[11px] text-muted-foreground">Secure Storage</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon"
                className="h-9 w-9"
                onClick={() => onViewModeChange(viewMode === 'grid' ? 'list' : 'grid')}
              >
                {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
              </Button>
              <CreateButton 
                currentPath={currentFolder}
                onFileCreated={() => window.location.reload()}
              />
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-muted-foreground/60 w-4 h-4" />
            <Input
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10 bg-muted/30 border-transparent focus-visible:border-border"
            />
          </div>
        </div>
      </header>

      {/* Stats Row - Clean & Minimal */}
      <div className="px-4 py-4">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-xl bg-card border border-border/40 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Files className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Files</span>
            </div>
            <div className="text-lg font-semibold text-foreground">{stats.totalFiles}</div>
          </div>
          <div className="rounded-xl bg-card border border-border/40 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Share className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Shared</span>
            </div>
            <div className="text-lg font-semibold text-foreground">{stats.sharedCount}</div>
          </div>
          <div className="rounded-xl bg-card border border-border/40 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <HardDrive className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Used</span>
            </div>
            <div className="text-lg font-semibold text-foreground">{formatBytes(stats.totalSize)}</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 pb-28">
        <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-4 h-11">
            <TabsTrigger value="files" className="text-xs px-2">Files</TabsTrigger>
            <TabsTrigger value="shared" className="text-xs px-2">Shared</TabsTrigger>
            <TabsTrigger value="downloads" className="text-xs px-2">Downloads</TabsTrigger>
            <TabsTrigger value="trash" className="text-xs px-2">Trash</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs px-2">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="space-y-2.5">
            {filteredFiles.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                    <Files className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-medium text-foreground mb-1.5">No files yet</h3>
                  <p className="text-sm text-muted-foreground mb-5">
                    Upload your first file to get started
                  </p>
                  <CreateButton
                    currentPath={currentFolder}
                    onFileCreated={() => window.location.reload()}
                  />
                </CardContent>
              </Card>
            ) : (
              <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-2.5' : 'space-y-2'}>
                {filteredFiles.map((file) => (
                  <EnhancedFileCard
                    key={file.id}
                    file={file}
                    onClick={() => onFileSelect(file)}
                    onView={() => setPreviewFile(file)}
                    onDownload={() => onFileDownload(file)}
                    onShare={() => onFileShare(file)}
                    onDelete={() => onFileDelete(file)}
                    onInfo={() => {}}
                    onVersionHistory={() => {}}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="shared" className="space-y-2.5">
            {filteredSharedFiles.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                    <Share className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-medium text-foreground mb-1.5">No shared files</h3>
                  <p className="text-sm text-muted-foreground">
                    Files you share will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-2.5' : 'space-y-2'}>
                {filteredSharedFiles.map((file) => (
                  <EnhancedFileCard
                    key={file.id}
                    file={file}
                    onClick={() => onFileSelect(file)}
                    onView={() => setPreviewFile(file)}
                    onDownload={() => onFileDownload(file)}
                    onShare={() => onFileShare(file)}
                    onDelete={() => onFileDelete(file)}
                    onInfo={() => {}}
                    onVersionHistory={() => {}}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="downloads">
            <DownloadManager />
          </TabsContent>

          <TabsContent value="trash">
            <TrashTab />
          </TabsContent>

          <TabsContent value="settings" className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  Account Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <Button variant="outline" className="w-full justify-start h-11">
                  <Smartphone className="w-4 h-4 mr-2.5 text-muted-foreground" />
                  Mobile Preferences
                </Button>
                <Button variant="outline" className="w-full justify-start h-11">
                  <Shield className="w-4 h-4 mr-2.5 text-muted-foreground" />
                  Security Settings
                </Button>
                <Button variant="outline" className="w-full justify-start h-11">
                  <Download className="w-4 h-4 mr-2.5 text-muted-foreground" />
                  Download Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Enhanced Instant Preview Modal */}
      {previewFile && (
        <EnhancedInstantPreviewModal
          file={previewFile}
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={() => onFileDownload(previewFile)}
          onShare={() => onFileShare(previewFile)}
        />
      )}
    </div>
  );
};

export default MobileEnhancedUI;