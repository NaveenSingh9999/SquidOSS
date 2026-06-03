import React, { useState, useMemo } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Calendar, 
  FileType, 
  HardDrive,
  Image,
  Video,
  Music,
  FileText,
  Code,
  Archive,
  File,
  Folder,
  Clock,
  ChevronsUpDown
} from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { FileItem as FileItemType, formatBytes } from '@/lib/api';

type GroupByOption = 'none' | 'date' | 'type' | 'size';

interface FileGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  files: FileItemType[];
  totalSize: number;
}

interface FileGroupingProps {
  files: FileItemType[];
  groupBy: GroupByOption;
  onGroupByChange: (groupBy: GroupByOption) => void;
  renderFile: (file: FileItemType) => React.ReactNode;
  className?: string;
  /** When true, only renders the dropdown control without file content or empty state */
  controlOnly?: boolean;
}

// Date grouping helpers
const getDateGroup = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= thisWeek) return 'This Week';
  if (date >= thisMonth) return 'This Month';
  return 'Older';
};

const dateGroupOrder = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];

// Type grouping helpers
const getTypeGroup = (file: FileItemType): string => {
  const type = file.type?.toLowerCase() || '';
  const name = file.name?.toLowerCase() || '';

  if (type.startsWith('image/')) return 'Images';
  if (type.startsWith('video/')) return 'Videos';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.includes('pdf') || type.includes('document') || type.includes('word')) return 'Documents';
  if (name.match(/\.(zip|rar|7z|tar|gz)$/)) return 'Archives';
  if (name.match(/\.(js|ts|jsx|tsx|py|java|c|cpp|go|rs|rb|php|html|css|json|yaml|yml|xml|sh|bash)$/)) return 'Code';
  if (type.startsWith('text/')) return 'Text';
  return 'Other';
};

const typeGroupIcons: Record<string, React.ReactNode> = {
  'Images': <Image className="w-4 h-4 text-green-500" />,
  'Videos': <Video className="w-4 h-4 text-red-500" />,
  'Audio': <Music className="w-4 h-4 text-purple-500" />,
  'Documents': <FileText className="w-4 h-4 text-blue-500" />,
  'Archives': <Archive className="w-4 h-4 text-orange-500" />,
  'Code': <Code className="w-4 h-4 text-yellow-500" />,
  'Text': <FileText className="w-4 h-4 text-gray-500" />,
  'Other': <File className="w-4 h-4 text-muted-foreground" />,
};

const typeGroupOrder = ['Images', 'Videos', 'Audio', 'Documents', 'Archives', 'Code', 'Text', 'Other'];

// Size grouping helpers
const getSizeGroup = (size: number): string => {
  if (size >= 100 * 1024 * 1024) return 'Large (>100MB)';
  if (size >= 10 * 1024 * 1024) return 'Medium (10-100MB)';
  if (size >= 1 * 1024 * 1024) return 'Small (1-10MB)';
  return 'Tiny (<1MB)';
};

const sizeGroupOrder = ['Large (>100MB)', 'Medium (10-100MB)', 'Small (1-10MB)', 'Tiny (<1MB)'];

const sizeGroupIcons: Record<string, React.ReactNode> = {
  'Large (>100MB)': <HardDrive className="w-4 h-4 text-red-500" />,
  'Medium (10-100MB)': <HardDrive className="w-4 h-4 text-orange-500" />,
  'Small (1-10MB)': <HardDrive className="w-4 h-4 text-blue-500" />,
  'Tiny (<1MB)': <HardDrive className="w-4 h-4 text-green-500" />,
};

export const FileGrouping: React.FC<FileGroupingProps> = ({
  files,
  groupBy,
  onGroupByChange,
  renderFile,
  className,
  controlOnly = false,
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);

  // Group files based on selected option
  const groups = useMemo((): FileGroup[] => {
    if (groupBy === 'none') {
      return [{
        id: 'all',
        label: 'All Files',
        icon: <Folder className="w-4 h-4 text-blue-400" />,
        files,
        totalSize: files.reduce((sum, f) => sum + (f.size || 0), 0),
      }];
    }

    const groupMap = new Map<string, FileItemType[]>();

    files.forEach(file => {
      let groupKey: string;
      
      switch (groupBy) {
        case 'date':
          groupKey = getDateGroup(file.created_at);
          break;
        case 'type':
          groupKey = getTypeGroup(file);
          break;
        case 'size':
          groupKey = getSizeGroup(file.size || 0);
          break;
        default:
          groupKey = 'All';
      }

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
      }
      groupMap.get(groupKey)!.push(file);
    });

    // Sort groups by predefined order
    let orderedKeys: string[];
    switch (groupBy) {
      case 'date':
        orderedKeys = dateGroupOrder;
        break;
      case 'type':
        orderedKeys = typeGroupOrder;
        break;
      case 'size':
        orderedKeys = sizeGroupOrder;
        break;
      default:
        orderedKeys = Array.from(groupMap.keys());
    }

    return orderedKeys
      .filter(key => groupMap.has(key))
      .map(key => {
        const groupFiles = groupMap.get(key)!;
        let icon: React.ReactNode;
        
        switch (groupBy) {
          case 'date':
            icon = <Clock className="w-4 h-4 text-primary" />;
            break;
          case 'type':
            icon = typeGroupIcons[key] || <File className="w-4 h-4" />;
            break;
          case 'size':
            icon = sizeGroupIcons[key] || <HardDrive className="w-4 h-4" />;
            break;
          default:
            icon = <Folder className="w-4 h-4" />;
        }

        return {
          id: key,
          label: key,
          icon,
          files: groupFiles,
          totalSize: groupFiles.reduce((sum, f) => sum + (f.size || 0), 0),
        };
      });
  }, [files, groupBy]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleAllGroups = () => {
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(groups.map(g => g.id)));
    }
    setAllCollapsed(!allCollapsed);
  };

  const groupByOptions = [
    { value: 'none' as const, label: 'No Grouping', icon: <File className="w-4 h-4" /> },
    { value: 'date' as const, label: 'By Date', icon: <Calendar className="w-4 h-4" /> },
    { value: 'type' as const, label: 'By Type', icon: <FileType className="w-4 h-4" /> },
    { value: 'size' as const, label: 'By Size', icon: <HardDrive className="w-4 h-4" /> },
  ];

  const currentOption = groupByOptions.find(o => o.value === groupBy);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Grouping controls */}
      <div className="flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-sm border-border/40"
            >
              {currentOption?.icon}
              <span className="hidden sm:inline">{currentOption?.label}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            {groupByOptions.map(option => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => onGroupByChange(option.value)}
                className={cn(
                  "gap-2",
                  groupBy === option.value && "bg-primary/10"
                )}
              >
                {option.icon}
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {!controlOnly && groupBy !== 'none' && groups.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleAllGroups}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronsUpDown className="w-3.5 h-3.5" />
            {allCollapsed ? 'Expand All' : 'Collapse All'}
          </Button>
        )}
      </div>

      {/* Groups - Only render when not in controlOnly mode */}
      {!controlOnly && (
      <div className="space-y-4">
        {groups.map(group => {
          const isCollapsed = collapsedGroups.has(group.id);
          
          return (
            <div key={group.id} className="space-y-2">
              {/* Group header */}
              {groupBy !== 'none' && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 rounded-lg",
                    "text-left transition-colors",
                    "hover:bg-accent/50",
                    "sticky top-0 z-10 bg-background/95 backdrop-blur-sm"
                  )}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                  {group.icon}
                  <span className="font-medium text-sm">{group.label}</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    ({group.files.length} file{group.files.length !== 1 ? 's' : ''})
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatBytes(group.totalSize)}
                  </span>
                </button>
              )}

              {/* Group content */}
              {!isCollapsed && (
                <div className={cn(
                  "grid gap-2",
                  groupBy !== 'none' && "pl-6"
                )}>
                  {group.files.map(file => renderFile(file))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* Empty state - Only show when not in controlOnly mode */}
      {!controlOnly && files.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <File className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No files to display</p>
        </div>
      )}
    </div>
  );
};

export default FileGrouping;
