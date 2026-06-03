import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/api';
import type { FileItem as FileItemType, FolderItem } from '@/lib/api';

interface StatsPanelProps {
  files: FileItemType[];
  folders: FolderItem[];
  totalSize: number;
  className?: string;
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  Images:    '#3b82f6',
  Video:     '#8b5cf6',
  Documents: '#10b981',
  Audio:     '#f59e0b',
  Other:     '#6b7280',
};

function categorize(files: FileItemType[]) {
  const cats: Record<string, { count: number; size: number }> = {
    Images:    { count: 0, size: 0 },
    Video:     { count: 0, size: 0 },
    Documents: { count: 0, size: 0 },
    Audio:     { count: 0, size: 0 },
    Other:     { count: 0, size: 0 },
  };
  for (const f of files) {
    const t = (f.content_type || f.type || '').toLowerCase();
    const n = (f.name || '').toLowerCase();
    const s = f.size || 0;
    if (t.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg|avif)$/.test(n))
      { cats.Images.count++;    cats.Images.size += s; }
    else if (t.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/.test(n))
      { cats.Video.count++;     cats.Video.size += s; }
    else if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv)$/.test(n) || t.includes('pdf'))
      { cats.Documents.count++; cats.Documents.size += s; }
    else if (t.startsWith('audio/') || /\.(mp3|wav|flac|aac|ogg)$/.test(n))
      { cats.Audio.count++;     cats.Audio.size += s; }
    else
      { cats.Other.count++;     cats.Other.size += s; }
  }
  return cats;
}

const Divider = () => (
  <div className="h-5 w-px bg-border/35 self-center flex-shrink-0" />
);

const Stat: React.FC<{ label: string; value: string; muted?: boolean; active?: boolean; onClick?: () => void }> = ({
  label, value, muted, active, onClick,
}) => (
  <button
    onClick={onClick}
    className={cn(
      'flex flex-col gap-0.5 flex-shrink-0 text-left transition-all duration-100',
      muted && 'opacity-50',
      active && 'opacity-100',
      onClick && 'hover:opacity-80 cursor-pointer'
    )}
  >
    <span className={cn(
      'text-[9.5px] font-semibold uppercase tracking-[0.08em] leading-none',
      active ? 'text-primary' : 'text-muted-foreground/50'
    )}>
      {label}
    </span>
    <span className={cn(
      'text-[14px] font-bold tabular-nums leading-none tracking-tight',
      active ? 'text-primary' : 'text-foreground'
    )}>
      {value}
    </span>
  </button>
);

export const StatsPanel: React.FC<StatsPanelProps> = ({
  files, folders, totalSize, className, activeFilter, onFilterChange,
}) => {
  const shared   = useMemo(() => files.filter(f => f.shared).length, [files]);
  const cats     = useMemo(() => categorize(files), [files]);
  const segments = Object.entries(cats)
    .filter(([, v]) => v.size > 0)
    .sort((a, b) => b[1].size - a[1].size);

  return (
    <div
      className={cn(
        'rounded-[14px] border border-border/40 bg-card px-5 py-3.5 space-y-2.5',
        className
      )}
    >
      {/* Single row of stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <Stat label="Storage" value={totalSize ? formatBytes(totalSize) : '0 B'} onClick={onFilterChange ? () => onFilterChange('all') : undefined} active={activeFilter === 'all' || !activeFilter} />
        <Divider />
        <Stat label="Files"   value={files.length.toLocaleString()} onClick={onFilterChange ? () => onFilterChange('files') : undefined} active={activeFilter === 'files'} />
        <Divider />
        <Stat label="Folders" value={folders.length.toLocaleString()} onClick={onFilterChange ? () => onFilterChange('folders') : undefined} active={activeFilter === 'folders'} />
        <Divider />
        <Stat label="Shared"  value={shared.toLocaleString()} muted={shared === 0} onClick={onFilterChange ? () => onFilterChange('shared') : undefined} active={activeFilter === 'shared'} />

        {/* Type dots legend */}
        {segments.length > 0 && (
          <div className="flex items-center gap-3 ml-auto flex-wrap">
            {segments.slice(0, 4).map(([key]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: TYPE_COLORS[key] }}
                />
                <span className="text-[11px] text-muted-foreground/60 leading-none">
                  {key}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Thin type breakdown bar */}
      {totalSize > 0 && segments.length > 0 ? (
        <div className="flex h-[3px] w-full rounded-full overflow-hidden gap-px">
          {segments.map(([key, val]) => (
            <div
              key={key}
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(1.5, (val.size / totalSize) * 100)}%`,
                background: TYPE_COLORS[key],
              }}
            />
          ))}
        </div>
      ) : (
        <div className="h-[3px] w-full rounded-full bg-border/25" />
      )}
    </div>
  );
};

export default StatsPanel;
