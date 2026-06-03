import React, { useState, useEffect, useMemo } from 'react';
import { backgroundUploadService, UploadTask } from '@/services/backgroundUpload';
import { formatBytes } from '@/lib/api';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { 
  Upload, 
  CheckCircle2, 
  XCircle, 
  ChevronUp, 
  ChevronDown,
  X,
  FileIcon,
  Image,
  Video,
  Music,
  FileText,
  Archive,
  Pause,
  Play,
  RotateCcw
} from '@/lib/icon-map';

const MobileUploadNotification: React.FC = () => {
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const unsubscribe = backgroundUploadService.subscribe((newTasks) => {
      setTasks(newTasks);
      
      // Show notification when new uploads start
      if (newTasks.some(task => task.status === 'uploading' || task.status === 'pending')) {
        setIsDismissed(false);
      }
    });

    return unsubscribe;
  }, []);

  // Calculate aggregate stats
  const stats = useMemo(() => {
    const active = tasks.filter(t => t.status === 'uploading' || t.status === 'pending');
    const completed = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');
    
    // Calculate overall progress
    let totalProgress = 0;
    active.forEach(task => {
      totalProgress += task.progress;
    });
    const averageProgress = active.length > 0 ? totalProgress / active.length : 0;
    
    // Calculate total size being uploaded
    const totalSize = active.reduce((acc, task) => acc + task.file.size, 0);
    const uploadedSize = active.reduce((acc, task) => acc + (task.file.size * task.progress / 100), 0);
    
    return {
      active,
      completed,
      failed,
      total: tasks.length,
      averageProgress,
      totalSize,
      uploadedSize,
      isUploading: active.length > 0,
      allCompleted: tasks.length > 0 && active.length === 0 && failed.length === 0,
      hasFailed: failed.length > 0
    };
  }, [tasks]);

  // Auto-dismiss when all uploads complete
  useEffect(() => {
    if (stats.allCompleted && tasks.length > 0) {
      const timer = setTimeout(() => {
        backgroundUploadService.clearCompleted();
        setIsDismissed(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [stats.allCompleted, tasks.length]);

  // Get file icon based on type
  const getFileIcon = (file: File) => {
    const type = file.type;
    if (type.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (type.startsWith('video/')) return <Video className="w-4 h-4" />;
    if (type.startsWith('audio/')) return <Music className="w-4 h-4" />;
    if (type.includes('pdf') || type.includes('document') || type.includes('text')) return <FileText className="w-4 h-4" />;
    if (type.includes('zip') || type.includes('archive') || type.includes('compressed')) return <Archive className="w-4 h-4" />;
    return <FileIcon className="w-4 h-4" />;
  };

  const handlePauseResume = () => {
    if (isPaused) {
      backgroundUploadService.resumeAll();
      setIsPaused(false);
    } else {
      backgroundUploadService.pauseAll();
      setIsPaused(true);
    }
  };

  const handleRetry = () => {
    backgroundUploadService.retryFailed();
  };

  const handleDismiss = () => {
    backgroundUploadService.clearCompleted();
    backgroundUploadService.clearFailed();
    setIsDismissed(true);
  };

  // Don't show if on desktop, no tasks, or dismissed
  if (!isMobile || tasks.length === 0 || isDismissed) {
    return null;
  }

  return (
    <div 
      className={cn(
        "fixed left-4 right-4 z-[55] transition-all duration-300 ease-spring",
        isExpanded 
          ? "bottom-[calc(5rem+env(safe-area-inset-bottom))]" 
          : "bottom-[calc(5.5rem+env(safe-area-inset-bottom))]"
      )}
    >
      {/* Main notification pill */}
      <div 
        className={cn(
          "bg-[#0d1117]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-blue-500/20 overflow-hidden",
          "transition-all duration-300"
        )}
      >
        {/* Collapsed View - Pill notification */}
        <div 
          className="flex items-center gap-3 p-3 cursor-pointer active:bg-white/5"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Progress Ring or Status Icon */}
          <div className="relative flex-shrink-0 w-10 h-10">
            {stats.isUploading ? (
              <>
                {/* Background ring */}
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
                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Upload className="w-4 h-4 text-white" />
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

          {/* Status Text */}
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {stats.isUploading ? (
                <>Uploading {stats.active.length} file{stats.active.length > 1 ? 's' : ''}</>
              ) : stats.allCompleted ? (
                <>Upload complete</>
              ) : stats.hasFailed ? (
                <>{stats.failed.length} upload{stats.failed.length > 1 ? 's' : ''} failed</>
              ) : null}
            </p>
            <p className="text-white/60 text-xs truncate">
              {stats.isUploading ? (
                <>{Math.round(stats.averageProgress)}% • {formatBytes(stats.uploadedSize)} of {formatBytes(stats.totalSize)}</>
              ) : stats.allCompleted ? (
                <>{stats.completed.length} file{stats.completed.length > 1 ? 's' : ''} uploaded successfully</>
              ) : stats.hasFailed ? (
                <>Tap to retry or dismiss</>
              ) : null}
            </p>
          </div>

          {/* Action Button */}
          <div className="flex items-center gap-2">
            {stats.isUploading && (
              <button
                onClick={(e) => { e.stopPropagation(); handlePauseResume(); }}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
              >
                {isPaused ? <Play className="w-4 h-4 text-white" /> : <Pause className="w-4 h-4 text-white" />}
              </button>
            )}
            {stats.hasFailed && (
              <button
                onClick={(e) => { e.stopPropagation(); handleRetry(); }}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
              >
                <RotateCcw className="w-4 h-4 text-white" />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
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

        {/* Expanded File List */}
        {isExpanded && (
          <div className="border-t border-blue-500/20 max-h-64 overflow-y-auto overscroll-contain">
            {tasks.map((task, index) => (
              <div 
                key={task.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  index !== tasks.length - 1 && "border-b border-blue-500/10"
                )}
              >
                {/* File Icon */}
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                  task.status === 'completed' ? "bg-green-500/20 text-green-400" :
                  task.status === 'failed' ? "bg-red-500/20 text-red-400" :
                  "bg-blue-500/20 text-blue-400"
                )}>
                  {getFileIcon(task.file)}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {task.file.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-white/50 text-xs">
                      {formatBytes(task.file.size)}
                    </span>
                    {task.status === 'uploading' && (
                      <>
                        <span className="text-white/30">•</span>
                        <span className="text-blue-400 text-xs font-medium">
                          {task.progress}%
                        </span>
                      </>
                    )}
                    {task.status === 'failed' && task.error && (
                      <>
                        <span className="text-white/30">•</span>
                        <span className="text-red-400 text-xs truncate">
                          {task.error}
                        </span>
                      </>
                    )}
                  </div>
                  
                  {/* Progress bar for uploading files */}
                  {task.status === 'uploading' && (
                    <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {task.status === 'completed' && (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  )}
                  {task.status === 'failed' && (
                    <button
                      onClick={() => backgroundUploadService.retryFailed()}
                      className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <RotateCcw className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                  {task.status === 'uploading' && (
                    <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  )}
                  {task.status === 'pending' && (
                    <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
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

export default MobileUploadNotification;
