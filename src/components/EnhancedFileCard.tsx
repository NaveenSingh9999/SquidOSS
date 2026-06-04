import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatFileSize } from '@/lib/utils';
import FileCardMenu from '@/components/FileCardMenu';
import { isFeatureEnabled } from '@/hooks/useFeatureFlags';
import { 
  Image, Video, Music, Archive,
  Code, FileJson, FileText, Lock, Share2
} from '@/lib/icon-map';

const sharingEnabled = isFeatureEnabled('sharing')

interface FileItem {
  id: string;
  name: string;
  type?: string;
  size?: number;
  created_at: string;
  encrypted?: boolean;
  shared?: boolean;
}

interface EnhancedFileCardProps {
  file: FileItem;
  viewMode: 'grid' | 'list';
  onClick: () => void;
  onView: () => void;
  onDownload: () => void;
  onShare: () => void;
  onDelete: () => void;
  onInfo: () => void;
  onVersionHistory: () => void;
  onExtract?: () => void;
}

const EnhancedFileCard: React.FC<EnhancedFileCardProps> = ({
  file,
  viewMode,
  onClick,
  onView,
  onDownload,
  onShare,
  onDelete,
  onInfo,
  onVersionHistory,
  onExtract,
}) => {
  
  const isImageFile = (type: string) => type?.startsWith('image/');
  const isVideoFile = (type: string) => type?.startsWith('video/');
  const isAudioFile = (type: string) => type?.startsWith('audio/');
  const isArchiveFile = (name: string) => /\.(zip|rar|7z|tar|gz)$/i.test(name);
  const isCodeFile = (name: string) => /\.(js|jsx|ts|tsx|py|html|css|json|md|php|rb|go|rs|c|cpp|java|sql)$/i.test(name);

  const getFileIcon = () => {
    const fileType = file.type || '';
    const iconClass = "w-4 h-4";
    if (isImageFile(fileType)) return <Image className={`${iconClass} text-emerald-400`} />;
    if (isVideoFile(fileType)) return <Video className={`${iconClass} text-rose-400`} />;
    if (isAudioFile(fileType)) return <Music className={`${iconClass} text-violet-400`} />;
    if (isArchiveFile(file.name)) return <Archive className={`${iconClass} text-amber-400`} />;
    if (isCodeFile(file.name)) return <Code className={`${iconClass} text-sky-400`} />;
    if (file.name.endsWith('.json')) return <FileJson className={`${iconClass} text-yellow-400`} />;
    return <FileText className={`${iconClass} text-muted-foreground`} />;
  };

  const truncateFileName = (name: string, maxLength: number = 22) => {
    if (name.length <= maxLength) return name;
    const ext = name.lastIndexOf('.');
    if (ext > 0 && name.length - ext <= 5) {
      const baseName = name.slice(0, ext);
      const extension = name.slice(ext);
      const truncatedBase = baseName.slice(0, maxLength - extension.length - 2);
      return `${truncatedBase}…${extension}`;
    }
    return `${name.slice(0, maxLength - 1)}…`;
  };

  const formatDate = (dateStr: string) => {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  };

  return (
    <Card 
      className={`
        group cursor-pointer transition-all duration-150 
        hover:bg-accent/30 active:scale-[0.98]
        ${viewMode === 'list' ? 'p-0' : 'p-0'}
      `}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('[role="menuitem"]') || target.closest('[data-radix-dropdown-menu-item]')) {
          return;
        }
        onClick();
      }}
    >
      <CardContent className={`p-3 ${viewMode === 'list' ? '' : 'space-y-2'}`}>
        <div className="flex items-center gap-3">
          {/* Icon container */}
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center">
            {getFileIcon()}
          </div>
          
          {/* File info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate leading-tight" title={file.name}>
              {truncateFileName(file.name)}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-muted-foreground">
                {formatFileSize(file.size || 0)}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground">
                {formatDate(file.created_at)}
              </span>
              {file.encrypted && (
                <Lock className="w-3 h-3 text-sky-400 ml-1" />
              )}
              {sharingEnabled && file.shared && (
                <Share2 className="w-3 h-3 text-violet-400 ml-0.5" />
              )}
            </div>
          </div>
          
          {/* Menu */}
          <div className="flex-shrink-0">
            <FileCardMenu
              file={file}
              onView={onView}
              onDownload={onDownload}
              onShare={onShare}
              onInfo={onInfo}
              onDelete={onDelete}
              onVersionHistory={onVersionHistory}
              onExtract={isArchiveFile(file.name) ? onExtract : undefined}
            />
          </div>
        </div>
        
        {/* Grid-specific layout adjustments */}
        {viewMode === 'grid' && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-0.5">
            {file.encrypted && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 rounded-md font-normal">
                Encrypted
              </Badge>
            )}
            {sharingEnabled && file.shared && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-md font-normal border-border/50">
                Shared
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EnhancedFileCard;