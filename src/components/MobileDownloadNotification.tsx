import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Download, FileIcon, X, XCircle } from '@/lib/icon-map';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/api';
import { backgroundDownloadService, DownloadTask } from '@/services/backgroundDownload';

const MobileDownloadNotification: React.FC = () => {
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const unsubscribe = backgroundDownloadService.subscribe((newTasks) => {
      setTasks(newTasks);
      if (newTasks.some((task) => task.status === 'downloading')) {
        setIsDismissed(false);
      }
    });
    return unsubscribe;
  }, []);

  const stats = useMemo(() => {
    const active = tasks.filter((task) => task.status === 'downloading');
    const completed = tasks.filter((task) => task.status === 'completed');
    const failed = tasks.filter((task) => task.status === 'failed');
    const totalSize = active.reduce((acc, task) => acc + task.fileSize, 0);
    const downloadedSize = active.reduce(
      (acc, task) => acc + (task.fileSize * task.progress) / 100,
      0,
    );
    const averageProgress =
      active.length > 0
        ? active.reduce((acc, task) => acc + task.progress, 0) / active.length
        : 0;

    return {
      active,
      completed,
      failed,
      totalSize,
      downloadedSize,
      averageProgress,
      isDownloading: active.length > 0,
      allCompleted: tasks.length > 0 && active.length === 0 && failed.length === 0,
      hasFailed: failed.length > 0,
    };
  }, [tasks]);

  useEffect(() => {
    if (stats.allCompleted && tasks.length > 0) {
      const timer = setTimeout(() => {
        backgroundDownloadService.clearCompleted();
        setIsDismissed(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [stats.allCompleted, tasks.length]);

  const handleDismiss = () => {
    backgroundDownloadService.clearCompleted();
    backgroundDownloadService.clearFailed();
    setIsDismissed(true);
  };

  if (!isMobile || tasks.length === 0 || isDismissed) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed left-4 right-4 z-[54] transition-all duration-300 ease-spring',
        isExpanded
          ? 'bottom-[calc(11rem+env(safe-area-inset-bottom))]'
          : 'bottom-[calc(11.5rem+env(safe-area-inset-bottom))]',
      )}
    >
      <div className="bg-[#0d1117]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-blue-500/20 overflow-hidden transition-all duration-300">
        <div
          className="flex items-center gap-3 p-3 cursor-pointer active:bg-white/5"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <div className="relative flex-shrink-0 w-10 h-10">
            {stats.isDownloading ? (
              <>
                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    className="text-white/10"
                    strokeWidth="3"
                    stroke="currentColor"
                    fill="none"
                    r="15.5"
                    cx="18"
                    cy="18"
                  />
                  <circle
                    className="text-blue-500 transition-all duration-300"
                    strokeWidth="3"
                    strokeDasharray={`${stats.averageProgress}, 100`}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    r="15.5"
                    cx="18"
                    cy="18"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Download className="w-4 h-4 text-white" />
                </div>
              </>
            ) : stats.allCompleted ? (
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
            ) : stats.hasFailed ? (
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
            ) : null}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {stats.isDownloading
                ? `Downloading ${stats.active.length} file${stats.active.length > 1 ? 's' : ''}`
                : stats.allCompleted
                  ? 'Download complete'
                  : `${stats.failed.length} download${stats.failed.length > 1 ? 's' : ''} failed`}
            </p>
            <p className="text-white/60 text-xs truncate">
              {stats.isDownloading
                ? `${Math.round(stats.averageProgress)}% • ${formatBytes(stats.downloadedSize)} of ${formatBytes(stats.totalSize)}`
                : stats.allCompleted
                  ? `${stats.completed.length} file${stats.completed.length > 1 ? 's' : ''} downloaded successfully`
                  : 'Tap to dismiss'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
            >
              <X className="w-4 h-4 text-white/70" />
            </button>
            <div className="w-6 h-6 flex items-center justify-center">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-white/50" />
              ) : (
                <ChevronUp className="w-4 h-4 text-white/50" />
              )}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-blue-500/20 max-h-64 overflow-y-auto overscroll-contain">
            {tasks.map((task, index) => (
              <div
                key={task.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  index !== tasks.length - 1 && 'border-b border-blue-500/10',
                )}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                    task.status === 'completed'
                      ? 'bg-green-500/20 text-green-400'
                      : task.status === 'failed'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-blue-500/20 text-blue-400',
                  )}
                >
                  <FileIcon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{task.fileName}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-white/50 text-xs">{formatBytes(task.fileSize)}</span>
                    {task.status === 'downloading' && (
                      <>
                        <span className="text-white/30">•</span>
                        <span className="text-blue-400 text-xs font-medium">{Math.round(task.progress)}%</span>
                      </>
                    )}
                    {task.status === 'failed' && task.error && (
                      <>
                        <span className="text-white/30">•</span>
                        <span className="text-red-400 text-xs truncate">{task.error}</span>
                      </>
                    )}
                  </div>
                  {task.status === 'downloading' && (
                    <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {task.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                  {task.status === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
                  {task.status === 'downloading' && (
                    <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileDownloadNotification;
