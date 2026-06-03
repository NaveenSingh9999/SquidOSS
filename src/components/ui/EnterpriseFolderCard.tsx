import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Folder, MoreHorizontal, Trash2, Star, Palette, FolderOpen, Code2, Share2, AlertTriangle } from '@/lib/icon-map';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EnhancedShareDialog } from '../EnhancedShareDialog';

const FOLDER_COLORS = [
  { name: 'Default', value: '' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Cyan', value: '#06b6d4' },
];

interface FolderCardProps {
  folder: {
    id: string;
    name: string;
    path: string;
    created_at: string;
  };
  viewMode: 'grid' | 'list';
  color?: string;
  isBookmarked?: boolean;
  onOpen: () => void;
  onDelete?: () => void;
  onToggleBookmark: () => void;
  onSetColor: (color: string) => void;
  onOpenInCbCode?: () => void;
}

export const EnterpriseFolderCard: React.FC<FolderCardProps> = ({
  folder, viewMode, color, isBookmarked, onOpen, onDelete, onToggleBookmark, onSetColor, onOpenInCbCode
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEnhancedShareDialog, setShowEnhancedShareDialog] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleDeleteClick = () => {
    setMenuOpen(false);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    onDelete?.();
  };

  const content = (
    <>
      {/* Color accent strip */}
      {color && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
          style={{ backgroundColor: color }}
        />
      )}

      {viewMode === 'grid' ? (
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-150 group-hover:scale-105"
              style={color
                ? { backgroundColor: `${color}20`, border: `1px solid ${color}40` }
                : { backgroundColor: 'hsl(var(--primary) / 0.08)', border: '1px solid hsl(var(--primary) / 0.15)' }
              }
            >
              <Folder
                className="w-5 h-5"
                style={color ? { color } : { color: 'hsl(var(--primary))' }}
              />
            </div>
            {isBookmarked && (
              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 flex-shrink-0" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate leading-snug" title={folder.name}>{folder.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {formatDistanceToNow(new Date(folder.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={color
              ? { backgroundColor: `${color}20`, border: `1px solid ${color}40` }
              : { backgroundColor: 'hsl(var(--primary) / 0.08)' }
            }
          >
            <Folder
              className="w-4 h-4"
              style={color ? { color } : { color: 'hsl(var(--primary))' }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate" title={folder.name}>{folder.name}</p>
          </div>
          {isBookmarked && (
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
          )}
        </div>
      )}
    </>
  );

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/50 bg-card',
        'transition-all duration-150 cursor-pointer select-none',
        'hover:border-border/80 hover:shadow-md hover:-translate-y-px',
        menuOpen && 'border-border/80 shadow-md'
      )}
    >
      {/* Click area */}
      <div onClick={onOpen} className="w-full">
        {content}
      </div>

      {/* Dropdown trigger - positioned absolutely */}
      <div
        className={cn(
          'absolute z-10 transition-opacity duration-100',
          viewMode === 'grid' ? 'top-2.5 right-2.5' : 'top-1/2 -translate-y-1/2 right-2',
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        onClick={e => e.stopPropagation()}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button className="h-6 w-6 flex items-center justify-center rounded-md bg-background/80 backdrop-blur-sm border border-border/40 hover:bg-accent transition-colors">
              <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-xl p-1" onClick={e => e.stopPropagation()}>
            <DropdownMenuItem className="rounded-lg gap-2 cursor-pointer" onClick={onOpen}>
              <FolderOpen className="w-3.5 h-3.5" /><span>Open</span>
            </DropdownMenuItem>
            {onOpenInCbCode && (
              <DropdownMenuItem className="rounded-lg gap-2 cursor-pointer" onClick={onOpenInCbCode}>
                <Code2 className="w-3.5 h-3.5" /><span>Open in cbCode</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="rounded-lg gap-2 cursor-pointer" onClick={onToggleBookmark}>
              <Star className={cn('w-3.5 h-3.5', isBookmarked && 'fill-yellow-400 text-yellow-400')} />
              <span>{isBookmarked ? 'Unfavorite' : 'Favorite'}</span>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="rounded-lg gap-2 cursor-pointer">
                <Palette className="w-3.5 h-3.5" />
                <span>Set color</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="rounded-xl p-1">
                {FOLDER_COLORS.map(c => (
                  <DropdownMenuItem
                    key={c.name}
                    className="rounded-lg gap-2.5 cursor-pointer"
                    onClick={() => onSetColor(c.value)}
                  >
                    <div
                      className={cn('w-3.5 h-3.5 rounded-full flex-shrink-0', !c.value && 'border-2 border-dashed border-muted-foreground/50')}
                      style={c.value ? { backgroundColor: c.value } : {}}
                    />
                    <span className="text-[13px]">{c.name}</span>
                    {color === c.value && <span className="ml-auto text-primary text-xs">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="rounded-lg gap-2 cursor-pointer" onClick={() => {
              setMenuOpen(false);
              setShowEnhancedShareDialog(true);
            }}>
              <Share2 className="w-3.5 h-3.5" /><span>Share</span>
            </DropdownMenuItem>
            {onDelete && (
              <DropdownMenuItem
                className="rounded-lg gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                onClick={handleDeleteClick}
              >
                <Trash2 className="w-3.5 h-3.5" /><span>Delete</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EnhancedShareDialog
        open={showEnhancedShareDialog}
        onClose={() => setShowEnhancedShareDialog(false)}
        file={{ ...folder, type: 'folder' }}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete folder?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{folder.name}</strong> and all its contents will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EnterpriseFolderCard;
