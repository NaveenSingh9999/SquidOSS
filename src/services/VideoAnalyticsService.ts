import { supabase } from '@/integrations/supabase/client';

// Video Analytics Service
export class VideoAnalyticsService {
  private static sessionId: string | null = null;
  private static bufferedEvents: any[] = [];
  private static flushTimeout: NodeJS.Timeout | null = null;

  // Initialize a new video session
  static async initializeSession(fileId: string): Promise<string> {
    const sessionId = crypto.randomUUID();
    this.sessionId = sessionId;

    try {
      // Create stream session record
      await supabase.rpc('upsert_stream_session', {
        p_session_id: sessionId,
        p_file_id: fileId,
      });

      return sessionId;
    } catch (error) {
      console.error('Failed to initialize video session:', error);
      return sessionId; // Return sessionId anyway for client-side tracking
    }
  }

  // Log a playback event
  static async logEvent(
    fileId: string,
    eventType: 'play' | 'pause' | 'seek' | 'quality_change' | 'speed_change' | 'buffer_start' | 'buffer_end' | 'complete' | 'error',
    position?: number,
    metadata?: any
  ): Promise<void> {
    if (!this.sessionId) {
      console.warn('No active video session for logging events, initializing session for file:', fileId);
      // Auto-initialize session if not already done
      try {
        await this.initializeSession(fileId);
        console.log('Auto-initialized video session for analytics');
      } catch (error) {
        console.error('Failed to auto-initialize video session:', error);
        return;
      }
    }

    const event = {
      file_id: fileId,
      session_id: this.sessionId,
      event_type: eventType,
      position,
      metadata,
      ip_address: null, // Will be populated server-side
      user_agent: navigator.userAgent,
    };

    // Buffer events to reduce database calls
    this.bufferedEvents.push(event);

    // Flush events periodically or on critical events
    if (eventType === 'complete' || eventType === 'error' || this.bufferedEvents.length >= 10) {
      await this.flushEvents();
    } else {
      this.scheduleFlush();
    }
  }

  // Update stream session metrics
  static async updateSession(
    fileId: string,
    updates: {
      quality?: string;
      bandwidthUsed?: number;
      streamDuration?: number;
      errorsCount?: number;
      completed?: boolean;
    }
  ): Promise<void> {
    if (!this.sessionId) return;

    try {
      await supabase.rpc('upsert_stream_session', {
        p_session_id: this.sessionId,
        p_file_id: fileId,
        p_quality: updates.quality,
        p_bandwidth_used: updates.bandwidthUsed || 0,
        p_stream_duration: updates.streamDuration || 0,
        p_errors_count: updates.errorsCount || 0,
        p_completed: updates.completed || false,
      });
    } catch (error) {
      console.error('Failed to update stream session:', error);
    }
  }

  // Save playback resume position
  static async saveResumePosition(fileId: string, position: number, duration?: number): Promise<void> {
    try {
      await supabase.rpc('update_playback_resume', {
        p_file_id: fileId,
        p_position: position,
        p_duration: duration,
      });
    } catch (error) {
      console.error('Failed to save resume position:', error);
    }
  }

  // Get saved resume position
  static async getResumePosition(fileId: string): Promise<{ position: number; duration?: number } | null> {
    try {
      const { data, error } = await supabase.rpc('get_playback_resume', {
        p_file_id: fileId,
      });

      if (error || !data || data.length === 0) {
        return null;
      }

      return {
        position: data[0].position,
        duration: data[0].duration,
      };
    } catch (error) {
      console.error('Failed to get resume position:', error);
      return null;
    }
  }

  // Record quality metrics
  static async recordQualityMetrics(metrics: {
    quality: string;
    bandwidth?: number;
    bufferLevel?: number;
    droppedFrames?: number;
    rebufferCount?: number;
    startupTime?: number;
  }): Promise<void> {
    if (!this.sessionId) return;

    try {
      await supabase.from('video_quality_metrics').insert({
        session_id: this.sessionId,
        quality: metrics.quality,
        bandwidth: metrics.bandwidth,
        buffer_level: metrics.bufferLevel,
        dropped_frames: metrics.droppedFrames || 0,
        rebuffer_count: metrics.rebufferCount || 0,
        startup_time: metrics.startupTime,
      });
    } catch (error) {
      console.error('Failed to record quality metrics:', error);
    }
  }

  // Flush buffered events to database
  private static async flushEvents(): Promise<void> {
    if (this.bufferedEvents.length === 0) return;

    const eventsToFlush = [...this.bufferedEvents];
    this.bufferedEvents = [];

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    try {
      // Insert all events in a single batch
      const { error } = await supabase.from('media_playback_logs').insert(eventsToFlush);
      
      if (error) {
        console.error('Failed to flush events:', error);
        // Re-add events to buffer for retry
        this.bufferedEvents.unshift(...eventsToFlush);
      }
    } catch (error) {
      console.error('Failed to flush events:', error);
      // Re-add events to buffer for retry
      this.bufferedEvents.unshift(...eventsToFlush);
    }
  }

  // Schedule periodic event flushing
  private static scheduleFlush(): void {
    if (this.flushTimeout) return;

    this.flushTimeout = setTimeout(async () => {
      await this.flushEvents();
    }, 5000); // Flush every 5 seconds
  }

  // Clean up session
  static async endSession(fileId: string, finalPosition?: number, completed = false): Promise<void> {
    if (!this.sessionId) return;

    try {
      // Flush any remaining events
      await this.flushEvents();

      // Update final session state
      await this.updateSession(fileId, { completed });

      // Save final resume position
      if (finalPosition !== undefined) {
        await this.saveResumePosition(fileId, finalPosition);
      }

      this.sessionId = null;
    } catch (error) {
      console.error('Failed to end video session:', error);
    }
  }

  // Get analytics summary for a file
  static async getFileAnalytics(fileId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('video_analytics_summary')
        .select('*')
        .eq('file_id', fileId)
        .single();

      return error ? null : data;
    } catch (error) {
      console.error('Failed to get file analytics:', error);
      return null;
    }
  }

  // Get user's video watch history
  static async getWatchHistory(limit = 50): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('media_playback_logs')
        .select(`
          *,
          files (
            id,
            name,
            type,
            size
          )
        `)
        .eq('event_type', 'play')
        .order('timestamp', { ascending: false })
        .limit(limit);

      return error ? [] : data;
    } catch (error) {
      console.error('Failed to get watch history:', error);
      return [];
    }
  }
}

// Video Streaming Service
export class VideoStreamingService {
  // Request signed streaming URLs
  static async getStreamingUrls(
    fileId: string,
    requestedQualities?: string[],
    playbackMode: 'stream' | 'download' = 'stream'
  ): Promise<{
    url: string;
    qualities: any[];
    hlsManifest?: string;
    sessionId: string;
    ttlSeconds: number;
  } | null> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user?.id) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('video-stream-url', {
        body: {
          fileId,
          requestedQualities,
          requesterUserId: user.user.id,
          playbackMode,
        },
      });

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to get streaming URLs:', error);
      return null;
    }
  }

  // Check if file supports video streaming
  static isVideoFile(file: { type: string; size: number }): boolean {
    return file.type.startsWith('video/') && file.size > 0;
  }

  // Determine optimal streaming strategy
  static getStreamingStrategy(file: { type: string; size: number }): 'direct' | 'hls' | 'progressive' {
    if (!this.isVideoFile(file)) {
      return 'direct';
    }

    // Large files should use HLS for adaptive streaming
    if (file.size > 100 * 1024 * 1024) { // > 100MB
      return 'hls';
    }

    // Medium files can use progressive streaming
    if (file.size > 10 * 1024 * 1024) { // > 10MB
      return 'progressive';
    }

    // Small files can be streamed directly
    return 'direct';
  }

  // Estimate bandwidth requirements
  static estimateBandwidth(file: { type: string; size: number }, quality = '720p'): number {
    const qualityBandwidth = {
      '360p': 800000, // 800 kbps
      '480p': 1500000, // 1.5 Mbps
      '720p': 3000000, // 3 Mbps
      '1080p': 5000000, // 5 Mbps
      '4k': 25000000, // 25 Mbps
    };

    return qualityBandwidth[quality as keyof typeof qualityBandwidth] || qualityBandwidth['720p'];
  }
}

// HLS Generation Service (for future implementation)
export class HLSGenerationService {
  // Generate HLS manifest and segments
  static async generateHLS(
    fileId: string,
    qualities: string[] = ['360p', '720p', '1080p']
  ): Promise<{ manifest: string; segments: string[] } | null> {
    // This would be implemented as a background job
    console.log('HLS generation not yet implemented for file:', fileId);
    return null;
  }

  // Check if HLS is available for file
  static async isHLSAvailable(fileId: string): Promise<boolean> {
    try {
      // Check if HLS manifest exists in storage
      // This would check for pre-generated HLS files
      return false; // Not implemented yet
    } catch (error) {
      return false;
    }
  }
}

export default {
  VideoAnalyticsService,
  VideoStreamingService,
  HLSGenerationService,
};