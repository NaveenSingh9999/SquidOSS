import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  Folder, 
  Clock, 
  Pin, 
  ChevronRight,
  Home,
  X,
  CornerDownLeft
} from '@/lib/icon-map';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FolderItem } from '@/lib/api';
import { useFolderHistory } from '@/hooks/use-folder-history';

interface QuickJumpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: FolderItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
}

interface FolderTreeNode {
  name: string;
  path: string;
  children: FolderTreeNode[];
}

export const QuickJumpModal: React.FC<QuickJumpModalProps> = ({
  open,
  onOpenChange,
  folders,
  currentPath,
  onNavigate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { 
    getRecentFolders, 
    pinnedFolders, 
    addToHistory,
    pinFolder,
    unpinFolder,
    isPinned 
  } = useFolderHistory();

  // Build folder tree for preview
  const folderTree = useMemo((): FolderTreeNode => {
    const root: FolderTreeNode = { name: 'Root', path: '', children: [] };
    
    folders.forEach(folder => {
      const parts = folder.path.split('/').filter(Boolean);
      let current = root;
      
      parts.forEach((part, index) => {
        const existingChild = current.children.find(c => c.name === part);
        if (existingChild) {
          current = existingChild;
        } else {
          const newNode: FolderTreeNode = {
            name: part,
            path: parts.slice(0, index + 1).join('/'),
            children: [],
          };
          current.children.push(newNode);
          current = newNode;
        }
      });
    });
    
    return root;
  }, [folders]);

  // Fuzzy search folders
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    return folders
      .filter(folder => 
        folder.name.toLowerCase().includes(query) ||
        folder.path.toLowerCase().includes(query)
      )
      .sort((a, b) => {
        // Prioritize name matches over path matches
        const aNameMatch = a.name.toLowerCase().startsWith(query);
        const bNameMatch = b.name.toLowerCase().startsWith(query);
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }, [folders, searchQuery]);

  // Combined results list
  const allResults = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults.map(f => ({
        type: 'search' as const,
        path: f.path,
        name: f.name,
      }));
    }
    
    const results: Array<{
      type: 'pinned' | 'recent' | 'search';
      path: string;
      name: string;
    }> = [];
    
    // Add root
    results.push({
      type: 'recent',
      path: '',
      name: 'Root',
    });
    
    // Add pinned folders
    pinnedFolders.forEach(f => {
      results.push({
        type: 'pinned',
        path: f.path,
        name: f.name,
      });
    });
    
    // Add recent folders
    getRecentFolders(currentPath, 5).forEach(f => {
      if (!pinnedFolders.some(p => p.path === f.path)) {
        results.push({
          type: 'recent',
          path: f.path,
          name: f.name,
        });
      }
    });
    
    return results;
  }, [searchQuery, searchResults, pinnedFolders, getRecentFolders, currentPath]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, allResults.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (allResults[selectedIndex]) {
            handleSelect(allResults[selectedIndex].path, allResults[selectedIndex].name);
          }
          break;
        case 'Escape':
          onOpenChange(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, allResults, selectedIndex, onOpenChange]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    
    const selectedEl = list.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = (path: string, name: string) => {
    onNavigate(path);
    addToHistory(path, name);
    onOpenChange(false);
  };

  // Get tree preview for hovered/selected path
  const getTreePreview = (targetPath: string) => {
    const parts = targetPath.split('/').filter(Boolean);
    const preview: { name: string; path: string; depth: number; isTarget: boolean }[] = [];
    
    let currentNode = folderTree;
    preview.push({ name: 'Root', path: '', depth: 0, isTarget: targetPath === '' });
    
    parts.forEach((part, depth) => {
      const child = currentNode.children.find(c => c.name === part);
      if (child) {
        preview.push({ 
          name: child.name, 
          path: child.path, 
          depth: depth + 1,
          isTarget: child.path === targetPath
        });
        
        // Also show siblings at target level
        if (child.path === targetPath && currentNode.children.length > 1) {
          currentNode.children
            .filter(c => c.name !== part)
            .slice(0, 3)
            .forEach(sibling => {
              preview.push({
                name: sibling.name,
                path: sibling.path,
                depth: depth + 1,
                isTarget: false,
              });
            });
        }
        
        currentNode = child;
      }
    });
    
    return preview;
  };

  const previewPath = hoveredPath ?? (allResults[selectedIndex]?.path || '');
  const treePreview = getTreePreview(previewPath);

  // Highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) return text;
    
    return (
      <>
        {text.slice(0, index)}
        <span className="bg-primary/30 text-primary font-medium">
          {text.slice(index, index + query.length)}
        </span>
        {text.slice(index + query.length)}
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Search header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
          <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Jump to folder..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-base placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs text-muted-foreground">
            <span>esc</span>
          </kbd>
        </div>

        <div className="flex min-h-[300px] max-h-[400px]">
          {/* Results list */}
          <div 
            ref={listRef}
            className="flex-1 overflow-y-auto border-r border-border/40"
          >
            {/* Pinned section */}
            {!searchQuery && pinnedFolders.length > 0 && (
              <div className="px-2 pt-2">
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Pin className="w-3 h-3" />
                  Pinned
                </div>
              </div>
            )}
            
            {/* Recent section header */}
            {!searchQuery && pinnedFolders.length === 0 && (
              <div className="px-2 pt-2">
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Recent & Suggestions
                </div>
              </div>
            )}

            {/* Results */}
            <div className="p-2 space-y-0.5">
              {allResults.map((result, index) => (
                <div
                  key={result.path + result.type}
                  data-index={index}
                  onClick={() => handleSelect(result.path, result.name)}
                  onMouseEnter={() => {
                    setSelectedIndex(index);
                    setHoveredPath(result.path);
                  }}
                  onMouseLeave={() => setHoveredPath(null)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                    selectedIndex === index 
                      ? "bg-primary/10 text-foreground" 
                      : "hover:bg-accent/50 text-muted-foreground"
                  )}
                >
                  {result.path === '' ? (
                    <Home className="w-4 h-4 text-primary" />
                  ) : (
                    <Folder className={cn(
                      "w-4 h-4",
                      result.type === 'pinned' ? "text-yellow-400" : "text-blue-400"
                    )} />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {searchQuery ? highlightMatch(result.name, searchQuery) : result.name}
                    </div>
                    {result.path && (
                      <div className="text-xs text-muted-foreground truncate">
                        {searchQuery ? highlightMatch(result.path, searchQuery) : result.path}
                      </div>
                    )}
                  </div>

                  {result.type === 'pinned' && (
                    <Pin className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                  )}
                  
                  {selectedIndex === index && (
                    <CornerDownLeft className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              ))}

              {searchQuery && allResults.length === 0 && (
                <div className="px-3 py-6 text-center text-muted-foreground">
                  <Folder className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No folders found</p>
                  <p className="text-xs mt-1">Try a different search term</p>
                </div>
              )}
            </div>
          </div>

          {/* Tree preview */}
          <div className="w-48 bg-muted/30 p-3 overflow-y-auto hidden sm:block">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Folder Tree
            </div>
            <div className="space-y-0.5">
              {treePreview.map((item, index) => (
                <div
                  key={item.path + index}
                  className={cn(
                    "flex items-center gap-1.5 py-1 text-xs transition-colors",
                    item.isTarget ? "text-primary font-medium" : "text-muted-foreground"
                  )}
                  style={{ paddingLeft: item.depth * 12 }}
                >
                  {item.depth === 0 ? (
                    <Home className="w-3 h-3" />
                  ) : (
                    <Folder className={cn(
                      "w-3 h-3",
                      item.isTarget ? "text-primary" : "text-blue-400"
                    )} />
                  )}
                  <span className="truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border/40 bg-muted/30 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded">↑↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded">↵</kbd>
            Open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded">esc</kbd>
            Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickJumpModal;
