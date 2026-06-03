import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronRight, 
  Home, 
  Folder, 
  Clock, 
  ChevronDown,
  Pin,
  Copy,
  ExternalLink
} from '@/lib/icon-map';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FolderItem } from '@/lib/api';
import { useFolderHistory } from '@/hooks/use-folder-history';
import { useToast } from '@/hooks/use-toast';

interface SmartPathNavigatorProps {
  currentPath: string;
  folders: FolderItem[];
  onNavigate: (path: string) => void;
  onOpenQuickJump?: () => void;
  className?: string;
}

export const SmartPathNavigator: React.FC<SmartPathNavigatorProps> = ({
  currentPath,
  folders,
  onNavigate,
  onOpenQuickJump,
  className,
}) => {
  const { toast } = useToast();
  const { 
    getRecentFolders, 
    addToHistory, 
    pinFolder, 
    unpinFolder, 
    isPinned 
  } = useFolderHistory();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(currentPath);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse path into segments
  const pathSegments = currentPath ? currentPath.split('/').filter(Boolean) : [];
  
  // Get sibling folders for each segment
  const getSiblingFolders = (parentPath: string) => {
    return folders.filter(f => {
      const folderParent = f.path.split('/').slice(0, -1).join('/');
      return folderParent === parentPath;
    });
  };

  // Handle path editing
  const handlePathSubmit = () => {
    setIsEditing(false);
    if (editValue !== currentPath) {
      onNavigate(editValue);
      addToHistory(editValue);
    }
  };

  // Handle keyboard shortcut to focus path input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        setIsEditing(true);
        setEditValue(currentPath);
        setTimeout(() => inputRef.current?.select(), 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPath]);

  // Focus input when editing
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const recentFolders = getRecentFolders(currentPath, 5);

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path || '/');
    toast({
      title: "Path copied",
      description: path || "Root path copied to clipboard",
    });
  };

  if (isEditing) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handlePathSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePathSubmit();
              if (e.key === 'Escape') {
                setIsEditing(false);
                setEditValue(currentPath);
              }
            }}
            placeholder="Enter folder path..."
            className={cn(
              "w-full px-3 py-1.5 text-sm rounded-lg",
              "bg-background border border-primary/50",
              "focus:outline-none focus:ring-2 focus:ring-primary/30",
              "text-foreground placeholder:text-muted-foreground"
            )}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            Enter to confirm
          </span>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn(
        "flex items-center gap-1 px-3 py-1.5 rounded-lg",
        "bg-muted/50 border border-border/40",
        "overflow-x-auto scrollbar-hide",
        className
      )}>
        {/* Home button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 w-7 p-0 rounded-md flex-shrink-0",
                !currentPath && "bg-primary/10 text-primary"
              )}
              onClick={() => {
                onNavigate('');
                addToHistory('', 'Root');
              }}
            >
              <Home className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Root folder
          </TooltipContent>
        </Tooltip>

        {/* Path segments */}
        {pathSegments.map((segment, index) => {
          const segmentPath = pathSegments.slice(0, index + 1).join('/');
          const parentPath = pathSegments.slice(0, index).join('/');
          const siblings = getSiblingFolders(parentPath);
          const isLast = index === pathSegments.length - 1;

          return (
            <React.Fragment key={segmentPath}>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 px-2 gap-1 rounded-md flex-shrink-0 max-w-[140px]",
                      "hover:bg-accent/50",
                      isLast && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    <Folder className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate text-sm">{segment}</span>
                    {siblings.length > 0 && (
                      <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-50" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[180px]">
                  {/* Current folder actions */}
                  <DropdownMenuItem
                    onClick={() => copyPath(segmentPath)}
                    className="gap-2 text-xs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy path
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (isPinned(segmentPath)) {
                        unpinFolder(segmentPath);
                        toast({ title: "Folder unpinned" });
                      } else {
                        pinFolder(segmentPath, segment);
                        toast({ title: "Folder pinned" });
                      }
                    }}
                    className="gap-2 text-xs"
                  >
                    <Pin className={cn(
                      "w-3.5 h-3.5",
                      isPinned(segmentPath) && "fill-current"
                    )} />
                    {isPinned(segmentPath) ? 'Unpin folder' : 'Pin folder'}
                  </DropdownMenuItem>
                  
                  {/* Sibling folders */}
                  {siblings.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                        Switch to
                      </div>
                      {siblings.slice(0, 8).map((sibling) => (
                        <DropdownMenuItem
                          key={sibling.id}
                          onClick={() => {
                            onNavigate(sibling.path);
                            addToHistory(sibling.path, sibling.name);
                          }}
                          className={cn(
                            "gap-2 text-xs",
                            sibling.path === segmentPath && "bg-primary/10"
                          )}
                        >
                          <Folder className="w-3.5 h-3.5 text-blue-400" />
                          <span className="truncate">{sibling.name}</span>
                        </DropdownMenuItem>
                      ))}
                      {siblings.length > 8 && (
                        <div className="px-2 py-1 text-xs text-muted-foreground">
                          +{siblings.length - 8} more...
                        </div>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </React.Fragment>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Recent folders */}
        {recentFolders.length > 0 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-md flex-shrink-0"
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Recent folders
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
                Recent Folders
              </div>
              {recentFolders.map((folder) => (
                <DropdownMenuItem
                  key={folder.path + folder.timestamp}
                  onClick={() => {
                    onNavigate(folder.path);
                    addToHistory(folder.path, folder.name);
                  }}
                  className="gap-2"
                >
                  <Folder className="w-4 h-4 text-blue-400" />
                  <span className="truncate text-sm">{folder.name || 'Root'}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Quick jump shortcut hint */}
        {onOpenQuickJump && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenQuickJump}
                className="h-7 px-2 gap-1.5 rounded-md flex-shrink-0 text-xs text-muted-foreground hover:text-foreground"
              >
                <span className="hidden sm:inline">Jump</span>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                  ⌘G
                </kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Quick jump to any folder
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};

export default SmartPathNavigator;
