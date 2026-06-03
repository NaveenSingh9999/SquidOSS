
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  CheckCircle, 
  XCircle, 
  Clock, 
  X, 
  Pause, 
  Play,
  RotateCcw,
  Trash2,
  ChevronUp,
  ChevronDown
} from '@/lib/icon-map';
import { backgroundUploadService, UploadTask } from '@/services/backgroundUpload';
import { formatBytes } from '@/lib/api';

const BackgroundUploadPanel = () => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const unsubscribe = backgroundUploadService.subscribe((newTasks) => {
      setTasks(newTasks);
      
      // Auto-expand when there are active uploads
      if (newTasks.some(task => task.status === 'uploading' || task.status === 'pending')) {
        setIsExpanded(true);
      }
    });

    return unsubscribe;
  }, []);

  const handlePauseResume = () => {
    if (isPaused) {
      backgroundUploadService.resumeAll();
      setIsPaused(false);
    } else {
      backgroundUploadService.pauseAll();
      setIsPaused(true);
    }
  };

  const handleRetryFailed = () => {
    backgroundUploadService.retryFailed();
  };

  const handleClearCompleted = () => {
    backgroundUploadService.clearCompleted();
  };

  const handleClearFailed = () => {
    backgroundUploadService.clearFailed();
  };

  const handleRemoveTask = (taskId: string) => {
    backgroundUploadService.removeTask(taskId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'uploading':
        return <Upload className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'secondary',
      uploading: 'default',
      completed: 'success',
      failed: 'destructive'
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (tasks.length === 0) {
    return null;
  }

  const activeTasks = tasks.filter(task => task.status === 'uploading' || task.status === 'pending');
  const completedTasks = tasks.filter(task => task.status === 'completed');
  const failedTasks = tasks.filter(task => task.status === 'failed');

  return (
    <div className="fixed bottom-4 right-4 w-96 z-50">
      <Card className="shadow-lg border-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Background Uploads
              {activeTasks.length > 0 && (
                <Badge variant="default" className="ml-2">
                  {activeTasks.length} active
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {activeTasks.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePauseResume}
                >
                  {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="pt-0">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                  <div className="flex-shrink-0">
                    {getStatusIcon(task.status)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium truncate" title={task.file.name}>
                        {task.file.name}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveTask(task.id)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{formatBytes(task.file.size)}</span>
                      {getStatusBadge(task.status)}
                    </div>
                    
                    {task.status === 'uploading' && (
                      <>
                        <Progress value={task.progress} className="h-1" />
                        {task.estimatedTimeRemaining && task.estimatedTimeRemaining > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {task.estimatedTimeRemaining < 1000 ? 'Almost done...' :
                             task.estimatedTimeRemaining < 60000 ? `${Math.ceil(task.estimatedTimeRemaining / 1000)}s remaining` :
                             `${Math.ceil(task.estimatedTimeRemaining / 60000)}m remaining`}
                          </p>
                        )}
                      </>
                    )}
                    
                    {task.error && (
                      <p className="text-xs text-red-500 mt-1">{task.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {(completedTasks.length > 0 || failedTasks.length > 0) && (
              <div className="flex items-center justify-between mt-4 pt-2 border-t">
                <div className="flex gap-2">
                  {failedTasks.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetryFailed}
                      className="h-7 text-xs"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Retry Failed
                    </Button>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {completedTasks.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearCompleted}
                      className="h-7 text-xs"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear Completed
                    </Button>
                  )}
                  
                  {failedTasks.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearFailed}
                      className="h-7 text-xs text-red-500"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear Failed
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default BackgroundUploadPanel;
