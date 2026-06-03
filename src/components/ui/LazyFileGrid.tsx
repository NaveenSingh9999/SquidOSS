import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { FileItem as FileItemType } from '@/lib/api';

interface LazyFileGridProps {
  files: FileItemType[];
  viewMode: 'grid' | 'list';
  renderFile: (file: FileItemType, index: number) => React.ReactNode;
  loading?: boolean;
  emptyState?: React.ReactNode;
  batchSize?: number;
}

/* ── Skeletons ───────────────────────────────────────────── */

const GridSkeleton = () => (
  <div className="rounded-[14px] border border-border/40 bg-card overflow-hidden">
    <div className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[10px] bg-muted animate-pulse" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 bg-muted rounded-[6px] animate-pulse w-3/4" />
          <div className="h-2.5 bg-muted rounded-[6px] animate-pulse w-1/2" />
        </div>
      </div>
    </div>
  </div>
);

const ListSkeleton = () => (
  <div className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] border border-border/30">
    <div className="w-8 h-8 rounded-[8px] bg-muted animate-pulse flex-shrink-0" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3 bg-muted rounded-[6px] animate-pulse w-48" />
      <div className="h-2.5 bg-muted rounded-[6px] animate-pulse w-24" />
    </div>
    <div className="w-16 h-2.5 bg-muted rounded-[6px] animate-pulse" />
  </div>
);

/* ── Component ───────────────────────────────────────────── */

export const LazyFileGrid: React.FC<LazyFileGridProps> = ({
  files,
  viewMode,
  renderFile,
  loading = false,
  emptyState,
  batchSize = 20,
}) => {
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // Keep a ref so the observer callback never uses stale state
  const visibleCountRef = useRef(visibleCount);
  const filesLengthRef = useRef(files.length);

  useEffect(() => {
    visibleCountRef.current = visibleCount;
  }, [visibleCount]);

  useEffect(() => {
    filesLengthRef.current = files.length;
  }, [files.length]);

  // Reset when file list changes
  useEffect(() => {
    setVisibleCount(batchSize);
  }, [files.length, batchSize]);

  // Load more callback — uses refs, never stale
  const loadMore = useCallback(() => {
    setVisibleCount(prev => {
      const next = Math.min(prev + batchSize, filesLengthRef.current);
      return next;
    });
  }, [batchSize]);

  // Single, stable IntersectionObserver — attached via callback ref
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
    if (observerRef.current) observerRef.current.disconnect();

    if (node) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (
            entries[0].isIntersecting &&
            visibleCountRef.current < filesLengthRef.current
          ) {
            loadMore();
          }
        },
        {
          threshold: 0,
          rootMargin: '400px', // preload before reaching bottom
        }
      );
      observerRef.current.observe(node);
    }
  }, [loadMore]);

  // Re-check sentinel after visibleCount changes —
  // if sentinel is still visible (short content), keep loading
  useEffect(() => {
    if (visibleCount >= files.length) return;
    const sentinel = nodeRef.current;
    if (!sentinel) return;

    const rect = sentinel.getBoundingClientRect();
    const inView = rect.top < window.innerHeight + 400;
    if (inView) {
      // Sentinel is still visible after batch loaded — load next
      const t = setTimeout(() => {
        setVisibleCount(prev => Math.min(prev + batchSize, files.length));
      }, 16);
      return () => clearTimeout(t);
    }
  }, [visibleCount, files.length, batchSize]);

  /* ── Loading state ───────────────────────────────────── */
  if (loading) {
    const count = Math.min(batchSize, 12);
    return viewMode === 'grid' ? (
      <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-3">
        {Array.from({ length: count }).map((_, i) => <GridSkeleton key={i} />)}
      </div>
    ) : (
      <div className="space-y-1">
        {Array.from({ length: count }).map((_, i) => <ListSkeleton key={i} />)}
      </div>
    );
  }

  /* ── Empty state ─────────────────────────────────────── */
  if (!loading && files.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const visibleFiles = files.slice(0, visibleCount);
  const hasMore = visibleCount < files.length;
  const remaining = Math.min(4, files.length - visibleCount);

  return (
    <div>
      {/* Rendered files */}
      <div
        className={cn(
          viewMode === 'grid'
            ? 'grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-3'
            : 'space-y-1'
        )}
      >
        {visibleFiles.map((file, index) => (
          <React.Fragment key={file.id}>
            {renderFile(file, index)}
          </React.Fragment>
        ))}
      </div>

      {/* Sentinel — always rendered so observer fires */}
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />

      {/* Skeleton preview of next batch */}
      {hasMore && (
        <div
          className={cn(
            'mt-3',
            viewMode === 'grid'
              ? 'grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-3'
              : 'space-y-1'
          )}
        >
          {Array.from({ length: remaining }).map((_, i) =>
            viewMode === 'grid'
              ? <GridSkeleton key={i} />
              : <ListSkeleton key={i} />
          )}
        </div>
      )}
    </div>
  );
};

export default LazyFileGrid;
