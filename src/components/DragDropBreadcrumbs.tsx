import React, { useState, useRef } from 'react';
import { 
  Home, 
  Folder, 
  ChevronRight, 
  MoreHorizontal,
  Copy,
  Pin,
  ExternalLink
} from '@/lib/icon-map';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useFolderHistory } from '@/hooks/use-folder-history';
import { useToast } from '@/hooks/use-toast';

interface DragDropBreadcrumbsProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onMoveFile?: (fileId: string, targetPath: string) => Promise<void>;
  folderColors?: Record<string, string>;
  className?: string;
}

interface BreadcrumbSegment {
  name: string;
  path: string;
  color?: string;
}

export const DragDropBreadcrumbs: React.FC<DragDropBreadcrumbsProps> = ({
  currentPath,
  onNavigate,
  onMoveFile,
  folderColors = {},
  className,
}) => {
  const { toast } = useToast();
  const { pinFolder, unpinFolder, isPinned, addToHistory } = useFolderHistory();
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse path into segments
  const segments: BreadcrumbSegment[] = [
    { name: 'Home', path: '', color: undefined }
  ];
  
  if (currentPath) {
    const parts = currentPath.split('/').filter(Boolean);
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      segments.push({
        name: part,
        path,
        color: folderColors[path],
      });
    });
  }

  // Determine if we need to collapse
  const shouldCollapse = segments.length > 4;
  const visibleSegments = shouldCollapse && !isCollapsed
    ? [
        segments[0],
        { name: '...', path: '__collapsed__', color: undefined },
        ...segments.slice(-2)
      ]
    : segments;

  // Handle drag events
  const handleDragOver = (e: React.DragEvent, path: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(path);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    setDropTarget(null);

    const fileData = e.dataTransfer.getData('application/json');
    if (!fileData || !onMoveFile) return;

    try {
      const { id, name } = JSON.parse(fileData);
      await onMoveFile(id, targetPath);
      toast({
        title: "File moved",
        description: `${name} moved to ${targetPath || 'Root'}`,
      });
    } catch (error) {
      toast({
        title: "Move failed",
        description: "Could not move the file",
        variant: "destructive",
      });
    }
  };

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path || '/');
    toast({
      title: "Path copied",
      description: path || "Root path copied to clipboard",
    });
  };

  const handleNavigate = (path: string) => {
    if (path === '__collapsed__') {
      setIsCollapsed(true);
      return;
    }
    onNavigate(path);
    addToHistory(path);
  };

  return (
    <TooltipProvider>
      <div 
        ref={containerRef}
        className={cn(
          "flex items-center gap-1 py-2 overflow-x-auto scrollbar-hide",
          className
        )}
        onMouseLeave={() => setIsCollapsed(false)}
      >
        {visibleSegments.map((segment, index) => {
          const isLast = index === visibleSegments.length - 1;
          const isHome = segment.path === '';
          const isCollapsedIndicator = segment.path === '__collapsed__';
          const isDropping = dropTarget === segment.path;

          return (
            <React.Fragment key={segment.path + index}>
              {index > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              )}

              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleNavigate(segment.path)}
                        onDragOver={(e) => !isCollapsedIndicator && handleDragOver(e, segment.path)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => !isCollapsedIndicator && handleDrop(e, segment.path)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
                          "text-sm font-medium transition-all duration-150",
                          "border border-transparent",
                          isCollapsedIndicator && "hover:bg-accent/50 cursor-pointer",
                          !isCollapsedIndicator && [
                            isLast 
                              ? "bg-primary/10 text-primary border-primary/20" 
                              : "bg-muted/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                            isDropping && "ring-2 ring-primary ring-offset-2 ring-offset-background scale-105",
                            onMoveFile && "cursor-pointer",
                          ]
                        )}
                      >
                        {/* Color indicator */}
                        {segment.color && (
                          <div 
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: segment.color }}
                          />
                        )}
                        
                        {/* Icon */}
                        {isCollapsedIndicator ? (
                          <MoreHorizontal className="w-4 h-4" />
                        ) : isHome ? (
                          <Home className="w-3.5 h-3.5" />
                        ) : (
                          <Folder className={cn(
                            "w-3.5 h-3.5",
                            isLast ? "text-primary" : "text-blue-400"
                          )} />
                        )}
                        
                        {/* Name */}
                        {!isCollapsedIndicator && (
                          <span className="truncate max-w-[100px]">
                            {segment.name}
                          </span>
                        )}

                        {/* Pinned indicator */}
                        {!isCollapsedIndicator && isPinned(segment.path) && (
                          <Pin className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {isCollapsedIndicator ? (
                        "Click to expand full path"
                      ) : onMoveFile ? (
                        <>
                          <div>{segment.path || 'Root folder'}</div>
                          <div className="text-muted-foreground">Drop files here to move</div>
                        </>
                      ) : (
                        segment.path || 'Root folder'
                      )}
                    </TooltipContent>
                  </Tooltip>
                </ContextMenuTrigger>

                {!isCollapsedIndicator && (
                  <ContextMenuContent className="min-w-[160px]">
                    <ContextMenuItem 
                      onClick={() => handleNavigate(segment.path)}
                      className="gap-2"
                    >
                      <Folder className="w-4 h-4" />
                      Open folder
                    </ContextMenuItem>
                    <ContextMenuItem 
                      onClick={() => copyPath(segment.path)}
                      className="gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      Copy path
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem 
                      onClick={() => {
                        if (isPinned(segment.path)) {
                          unpinFolder(segment.path);
                          toast({ title: "Folder unpinned" });
                        } else {
                          pinFolder(segment.path, segment.name);
                          toast({ title: "Folder pinned" });
                        }
                      }}
                      className="gap-2"
                    >
                      <Pin className={cn(
                        "w-4 h-4",
                        isPinned(segment.path) && "fill-current text-yellow-400"
                      )} />
                      {isPinned(segment.path) ? 'Unpin folder' : 'Pin folder'}
                    </ContextMenuItem>
                  </ContextMenuContent>
                )}
              </ContextMenu>
            </React.Fragment>
          );
        })}

        {/* Current location indicator */}
        {segments.length > 1 && (
          <div className="ml-2 px-2 py-1 bg-muted/40 rounded-md">
            <span className="text-xs text-muted-foreground">
              {segments.length - 1} level{segments.length > 2 ? 's' : ''} deep
            </span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default DragDropBreadcrumbs;
