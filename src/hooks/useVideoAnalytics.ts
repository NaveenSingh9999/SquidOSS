import { useEffect, useRef, useCallback, useState } from 'react';
import { VideoAnalyticsService, VideoStreamingService } from '@/services/VideoAnalyticsService';

interface UseVideoAnalyticsOptions {
  fileId: string;
  autoSaveInterval?: number; // Interval in seconds to save resume position
  enableQualityMetrics?: boolean;
}

interface VideoAnalyticsHook {
  onPlay: (position: number) => void;
  onPause: (position: number) => void;
  onSeek: (from: number, to: number) => void;
  onQualityChange: (quality: { id: string; label: string; bandwidth: number }) => void;
  onSpeedChange: (speed: number) => void;
  onBufferStart: (position: number) => void;
  onBufferEnd: (position: number) => void;
  onComplete: () => void;
  onError: (error: string) => void;
  saveResumePosition: (position: number, duration?: number) => void;
  getResumePosition: () => Promise<{ position: number; duration?: number } | null>;
  recordQualityMetrics: (metrics: {
    quality: string;
    bandwidth?: number;
    bufferLevel?: number;
    droppedFrames?: number;
    rebufferCount?: number;
    startupTime?: number;
  }) => void;
}

export const useVideoAnalytics = (options: UseVideoAnalyticsOptions): VideoAnalyticsHook => {
  const { fileId, autoSaveInterval = 30, enableQualityMetrics = true } = options;
  
  const sessionInitialized = useRef(false);
  const lastSavedPosition = useRef(0);
  const saveIntervalRef = useRef<NodeJS.Timeout>();
  const startTime = useRef<number>();
  const totalWatchTime = useRef(0);
  const qualityChanges = useRef(0);
  const bufferEvents = useRef(0);

  // Initialize session on mount
  useEffect(() => {
    if (!sessionInitialized.current && fileId) {
      console.log('Initializing video analytics session for file:', fileId);
      VideoAnalyticsService.initializeSession(fileId).then(sessionId => {
        console.log('Video analytics session initialized:', sessionId);
        sessionInitialized.current = true;
      }).catch(error => {
        console.error('Failed to initialize video analytics session:', error);
        sessionInitialized.current = true; // Mark as initialized even on error to prevent retries
      });
      startTime.current = Date.now();
    }

    return () => {
      // Cleanup on unmount
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      
      if (sessionInitialized.current) {
        const watchTime = startTime.current ? (Date.now() - startTime.current) / 1000 : 0;
        VideoAnalyticsService.updateSession(fileId, {
          streamDuration: totalWatchTime.current + watchTime,
          completed: false,
        });
        VideoAnalyticsService.endSession(fileId, lastSavedPosition.current);
      }
    };
  }, [fileId]);

  // Auto-save resume position periodically
  useEffect(() => {
    if (autoSaveInterval > 0) {
      saveIntervalRef.current = setInterval(() => {
        if (lastSavedPosition.current > 0) {
          VideoAnalyticsService.saveResumePosition(fileId, lastSavedPosition.current);
        }
      }, autoSaveInterval * 1000);

      return () => {
        if (saveIntervalRef.current) {
          clearInterval(saveIntervalRef.current);
        }
      };
    }
  }, [fileId, autoSaveInterval]);

  const onPlay = useCallback((position: number) => {
    VideoAnalyticsService.logEvent(fileId, 'play', position);
    lastSavedPosition.current = position;
    startTime.current = Date.now();
  }, [fileId]);

  const onPause = useCallback((position: number) => {
    VideoAnalyticsService.logEvent(fileId, 'pause', position);
    lastSavedPosition.current = position;
    
    // Update total watch time
    if (startTime.current) {
      const sessionTime = (Date.now() - startTime.current) / 1000;
      totalWatchTime.current += sessionTime;
    }
  }, [fileId]);

  const onSeek = useCallback((from: number, to: number) => {
    VideoAnalyticsService.logEvent(fileId, 'seek', to, {
      from_position: from,
      to_position: to,
      seek_distance: Math.abs(to - from),
    });
    lastSavedPosition.current = to;
  }, [fileId]);

  const onQualityChange = useCallback((quality: { id: string; label: string; bandwidth: number }) => {
    VideoAnalyticsService.logEvent(fileId, 'quality_change', lastSavedPosition.current, {
      quality_id: quality.id,
      quality_label: quality.label,
      bandwidth: quality.bandwidth,
    });
    
    qualityChanges.current += 1;
    
    // Update session with new quality
    VideoAnalyticsService.updateSession(fileId, {
      quality: quality.label,
    });

    // Record quality metrics if enabled
    if (enableQualityMetrics) {
      VideoAnalyticsService.recordQualityMetrics({
        quality: quality.label,
        bandwidth: quality.bandwidth,
      });
    }
  }, [fileId, enableQualityMetrics]);

  const onSpeedChange = useCallback((speed: number) => {
    VideoAnalyticsService.logEvent(fileId, 'speed_change', lastSavedPosition.current, {
      playback_speed: speed,
    });
  }, [fileId]);

  const onBufferStart = useCallback((position: number) => {
    VideoAnalyticsService.logEvent(fileId, 'buffer_start', position);
    bufferEvents.current += 1;
  }, [fileId]);

  const onBufferEnd = useCallback((position: number) => {
    VideoAnalyticsService.logEvent(fileId, 'buffer_end', position);
    
    if (enableQualityMetrics) {
      VideoAnalyticsService.recordQualityMetrics({
        quality: 'current', // Would be filled with actual current quality
        rebufferCount: bufferEvents.current,
      });
    }
  }, [fileId, enableQualityMetrics]);

  const onComplete = useCallback(() => {
    VideoAnalyticsService.logEvent(fileId, 'complete', lastSavedPosition.current);
    
    // Update session as completed
    const finalWatchTime = startTime.current ? 
      totalWatchTime.current + (Date.now() - startTime.current) / 1000 : 
      totalWatchTime.current;
    
    VideoAnalyticsService.updateSession(fileId, {
      streamDuration: finalWatchTime,
      completed: true,
    });
  }, [fileId]);

  const onError = useCallback((error: string) => {
    VideoAnalyticsService.logEvent(fileId, 'error', lastSavedPosition.current, {
      error_message: error,
      quality_changes: qualityChanges.current,
      buffer_events: bufferEvents.current,
    });
    
    // Update session with error count
    VideoAnalyticsService.updateSession(fileId, {
      errorsCount: 1,
    });
  }, [fileId]);

  const saveResumePosition = useCallback((position: number, duration?: number) => {
    lastSavedPosition.current = position;
    VideoAnalyticsService.saveResumePosition(fileId, position, duration);
  }, [fileId]);

  const getResumePosition = useCallback(() => {
    return VideoAnalyticsService.getResumePosition(fileId);
  }, [fileId]);

  const recordQualityMetrics = useCallback((metrics: {
    quality: string;
    bandwidth?: number;
    bufferLevel?: number;
    droppedFrames?: number;
    rebufferCount?: number;
    startupTime?: number;
  }) => {
    if (enableQualityMetrics) {
      VideoAnalyticsService.recordQualityMetrics(metrics);
    }
  }, [enableQualityMetrics]);

  return {
    onPlay,
    onPause,
    onSeek,
    onQualityChange,
    onSpeedChange,
    onBufferStart,
    onBufferEnd,
    onComplete,
    onError,
    saveResumePosition,
    getResumePosition,
    recordQualityMetrics,
  };
};

// Hook for video streaming
interface UseVideoStreamingOptions {
  fileId: string;
  requestedQualities?: string[];
  playbackMode?: 'stream' | 'download';
  enabled?: boolean; // Add enabled option to conditionally fetch
}

interface VideoStreamingHook {
  streamingData: {
    url: string;
    qualities: any[];
    hlsManifest?: string;
    sessionId: string;
    ttlSeconds: number;
  } | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useVideoStreaming = (options: UseVideoStreamingOptions): VideoStreamingHook => {
  const { fileId, requestedQualities, playbackMode = 'stream', enabled = true } = options;
  
  const [streamingData, setStreamingData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStreamingData = useCallback(async () => {
    // Skip fetching if disabled or no fileId
    if (!fileId || !enabled) {
      setStreamingData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await VideoStreamingService.getStreamingUrls(
        fileId,
        requestedQualities,
        playbackMode
      );

      if (data) {
        setStreamingData(data);
      } else {
        setError('Failed to get streaming URLs');
      }
    } catch (err: any) {
      console.error('Failed to get streaming URLs:', err);
      setError(err.message || 'Failed to initialize video streaming');
    } finally {
      setIsLoading(false);
    }
  }, [fileId, requestedQualities, playbackMode, enabled]);

  useEffect(() => {
    fetchStreamingData();
  }, [fetchStreamingData]);

  return {
    streamingData,
    isLoading,
    error,
    refetch: fetchStreamingData,
  };
};

export default {
  useVideoAnalytics,
  useVideoStreaming,
};