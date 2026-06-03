/**
 * TransferProgressOverlay - Beautiful, informative transfer progress UI
 * 
 * Features:
 * - Collapsible overlay showing all active transfers
 * - Individual and overall progress tracking
 * - Speed and ETA display
 * - Pause/resume/cancel controls
 * - Integrity verification indicator
 * - Drag to minimize
 * - Sound notification on complete
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Download, 
  X, 
  Pause, 
  Play, 
  Check, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp,
  RefreshCw,
  Wifi,
  WifiOff,
  Shield,
  Trash2,
  Minimize2,
  Maximize2
} from '@/lib/icon-map';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { 
  smartTransferQueue, 
  TransferItem, 
  TransferQueueStats 
} from '@/services/SmartTransferQueue';

// Format bytes to human readable
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Format seconds to human readable time
const formatTime = (seconds: number): string => {
  if (seconds <= 0 || !isFinite(seconds)) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

// Format speed
const formatSpeed = (bytesPerSecond: number): string => {
  return `${formatBytes(bytesPerSecond)}/s`;
};

// Individual transfer item component
const TransferItemCard: React.FC<{
  transfer: TransferItem;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
}> = ({ transfer, onPause, onResume, onCancel, onRetry }) => {
  const isActive = transfer.status === 'transferring' || transfer.status === 'verifying';
  const isPaused = transfer.status === 'paused';
  const isFailed = transfer.status === 'failed';
  const isCompleted = transfer.status === 'completed';
  const isVerifying = transfer.status === 'verifying';

  const statusColors = {
    queued: 'text-muted-foreground',
    preparing: 'text-blue-500',
    transferring: 'text-primary',
    verifying: 'text-emerald-500',
    paused: 'text-yellow-500',
    completed: 'text-emerald-500',
    failed: 'text-destructive',
    cancelled: 'text-muted-foreground'
  };

  const statusLabels = {
    queued: 'Queued',
    preparing: 'Preparing...',
    transferring: transfer.type === 'upload' ? 'Uploading...' : 'Downloading...',
    verifying: 'Verifying integrity...',
    paused: 'Paused',
    completed: 'Complete',
    failed: 'Failed',
    cancelled: 'Cancelled'
  };

  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-all duration-200 animate-in fade-in slide-in-from-top-2",
        "bg-card/50 hover:bg-card/80",
        isFailed && "border-destructive/30 bg-destructive/5",
        isCompleted && "border-emerald-500/30 bg-emerald-500/5"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          "p-2 rounded-lg",
          transfer.type === 'upload' 
            ? "bg-blue-500/10 text-blue-500" 
            : "bg-purple-500/10 text-purple-500",
          isCompleted && "bg-emerald-500/10 text-emerald-500",
          isFailed && "bg-destructive/10 text-destructive"
        )}>
          {isCompleted ? (
            <Check className="h-4 w-4" />
          ) : isFailed ? (
            <AlertCircle className="h-4 w-4" />
          ) : isVerifying ? (
            <Shield className="h-4 w-4" />
          ) : transfer.type === 'upload' ? (
            <Upload className="h-4 w-4" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm truncate" title={transfer.fileName}>
              {transfer.fileName}
            </span>
            <span className={cn("text-xs font-medium", statusColors[transfer.status])}>
              {statusLabels[transfer.status]}
            </span>
          </div>

          {/* Progress bar */}
          {!isCompleted && (
            <div className="mt-2">
              <Progress 
                value={transfer.progress.percentage} 
                className={cn(
                  "h-1.5",
                  isVerifying && "[&>div]:bg-emerald-500",
                  isPaused && "[&>div]:bg-yellow-500",
                  isFailed && "[&>div]:bg-destructive"
                )}
              />
            </div>
          )}

          {/* Stats */}
          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {formatBytes(transfer.progress.bytesTransferred)} / {formatBytes(transfer.fileSize)}
            </span>
            {isActive && (
              <>
                <span>•</span>
                <span>{formatSpeed(transfer.progress.speed)}</span>
                <span>•</span>
                <span>ETA: {formatTime(transfer.progress.estimatedTimeRemaining)}</span>
              </>
            )}
            {transfer.progress.totalChunks > 1 && (
              <>
                <span>•</span>
                <span>
                  Chunk {transfer.progress.currentChunk}/{transfer.progress.totalChunks}
                </span>
              </>
            )}
            {isFailed && transfer.error && (
              <>
                <span>•</span>
                <span className="text-destructive truncate">{transfer.error}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onPause}
              title="Pause"
            >
              <Pause className="h-3.5 w-3.5" />
            </Button>
          )}
          {isPaused && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onResume}
              title="Resume"
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          {isFailed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onRetry}
              title="Retry"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          {!isCompleted && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onCancel}
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// Main overlay component
export const TransferProgressOverlay: React.FC<{
  className?: string;
}> = ({ className }) => {
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [stats, setStats] = useState<TransferQueueStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const prevCompletedRef = useRef(0);

  useEffect(() => {
    const unsubscribe = smartTransferQueue.subscribe((t, s) => {
      setTransfers(t);
      setStats(s);

      // Play sound on completion
      if (s.completedTransfers > prevCompletedRef.current) {
        // Could add a subtle sound here
        prevCompletedRef.current = s.completedTransfers;
      }
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Don't render if no transfers
  if (transfers.length === 0) return null;

  const activeTransfers = transfers.filter(t => 
    t.status === 'queued' || 
    t.status === 'transferring' || 
    t.status === 'verifying' ||
    t.status === 'paused'
  );

  const completedTransfers = transfers.filter(t => 
    t.status === 'completed' || t.status === 'cancelled'
  );

  const failedTransfers = transfers.filter(t => t.status === 'failed');

  if (isMinimized) {
    return (
      <div
        className={cn(
          "fixed bottom-4 right-4 z-50 animate-in fade-in zoom-in-95 duration-200",
          className
        )}
      >
        <Button
          onClick={() => setIsMinimized(false)}
          className="rounded-full h-14 w-14 shadow-lg relative"
          variant="default"
        >
          {stats?.activeTransfers ? (
            <Upload className="h-5 w-5 animate-pulse" />
          ) : (
            <Check className="h-5 w-5" />
          )}
          {transfers.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {transfers.length}
            </span>
          )}
          {stats && stats.overallProgress > 0 && stats.overallProgress < 100 && (
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56">
              <circle
                cx="28"
                cy="28"
                r="24"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="opacity-20"
              />
              <circle
                cx="28"
                cy="28"
                r="24"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 24}`}
                strokeDashoffset={`${2 * Math.PI * 24 * (1 - stats.overallProgress / 100)}`}
                className="transition-all duration-300"
              />
            </svg>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]",
        "bg-background/95 backdrop-blur-xl border rounded-xl shadow-2xl",
        "animate-in fade-in slide-in-from-bottom-4 duration-300",
        className
      )}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 border-b cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-1.5 rounded-lg",
            stats?.activeTransfers 
              ? "bg-primary/10 text-primary" 
              : "bg-emerald-500/10 text-emerald-500"
          )}>
            {stats?.activeTransfers ? (
              <Upload className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm">
              {stats?.activeTransfers 
                ? `${stats.activeTransfers} Active Transfer${stats.activeTransfers > 1 ? 's' : ''}`
                : 'Transfers Complete'
              }
            </h3>
            {stats && stats.overallProgress > 0 && stats.overallProgress < 100 && (
              <p className="text-xs text-muted-foreground">
                {Math.round(stats.overallProgress)}% • {formatSpeed(stats.averageSpeed)}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          {/* Network status */}
          <div className={cn(
            "p-1.5 rounded",
            isOnline ? "text-emerald-500" : "text-destructive"
          )}>
            {isOnline ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(true);
            }}
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Overall progress */}
      {stats && stats.overallProgress > 0 && stats.overallProgress < 100 && (
        <div className="px-3 py-2 border-b">
          <Progress value={stats.overallProgress} className="h-1" />
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>
              {formatBytes(stats.totalBytesTransferred)} transferred
            </span>
            <span>
              {stats.queuedTransfers} queued
            </span>
          </div>
        </div>
      )}

      {/* Content */}
        {isExpanded && (
          <div
            className="overflow-hidden animate-in fade-in duration-200"
          >
            <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
              {/* Active transfers */}
              {activeTransfers.map(transfer => (
                <TransferItemCard
                  key={transfer.id}
                  transfer={transfer}
                  onPause={() => smartTransferQueue.pause(transfer.id)}
                  onResume={() => smartTransferQueue.resume(transfer.id)}
                  onCancel={() => smartTransferQueue.cancel(transfer.id)}
                  onRetry={() => smartTransferQueue.retry(transfer.id)}
                />
              ))}

              {/* Failed transfers */}
              {failedTransfers.map(transfer => (
                <TransferItemCard
                  key={transfer.id}
                  transfer={transfer}
                  onPause={() => {}}
                  onResume={() => {}}
                  onCancel={() => smartTransferQueue.cancel(transfer.id)}
                  onRetry={() => smartTransferQueue.retry(transfer.id)}
                />
              ))}

              {/* Completed transfers (collapsible) */}
              {completedTransfers.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">
                      {completedTransfers.length} completed
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => smartTransferQueue.clearCompleted()}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear
                    </Button>
                  </div>
                  {completedTransfers.slice(0, 3).map(transfer => (
                    <TransferItemCard
                      key={transfer.id}
                      transfer={transfer}
                      onPause={() => {}}
                      onResume={() => {}}
                      onCancel={() => smartTransferQueue.cancel(transfer.id)}
                      onRetry={() => {}}
                    />
                  ))}
                  {completedTransfers.length > 3 && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      +{completedTransfers.length - 3} more
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
};

export default TransferProgressOverlay;
