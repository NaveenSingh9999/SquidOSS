import { supabase } from '@/integrations/supabase/client';

export interface StorageMetrics {
  totalStorage: number;
  usedStorage: number;
  availableStorage: number;
  storageGrowth: number;
  fileCount: number;
  fileTypes: { [key: string]: number };
  storageByType: { [key: string]: number };
}

export interface ActivityMetrics {
  uploads: number;
  downloads: number;
  shares: number;
  views: number;
  dailyActivity: { date: string; uploads: number; downloads: number; views: number }[];
  popularFiles: { name: string; views: number; downloads: number }[];
  accessPatterns: { hour: number; activity: number }[];
}

export interface UserMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  userGrowth: number;
  loginPatterns: { date: string; logins: number }[];
  featureUsage: { feature: string; usage: number }[];
}

export interface PerformanceMetrics {
  avgUploadSpeed: number;
  avgDownloadSpeed: number;
  errorRate: number;
  uptime: number;
  responseTime: number;
  systemHealth: 'excellent' | 'good' | 'fair' | 'poor';
  bandwidthUsage: { date: string; upload: number; download: number }[];
}

class AnalyticsService {
  private userId: string | null = null;
  private initializeUserPromise: Promise<void> | null = null;
  private hasInitializedUser = false;

  constructor() {}

  private async initializeUser() {
    const { data: { session } } = await supabase.auth.getSession();
    this.userId = session?.user?.id || null;
    this.hasInitializedUser = true;
  }

  private async ensureUserInitialized() {
    if (this.hasInitializedUser) return;

    if (this.initializeUserPromise) {
      await this.initializeUserPromise;
      return;
    }

    this.initializeUserPromise = this.initializeUser().finally(() => {
      this.initializeUserPromise = null;
    });

    await this.initializeUserPromise;
  }

  async logEvent(eventType: string, metadata?: any): Promise<void> {
    await this.ensureUserInitialized();

    try {
      // Use existing tables to log events - we'll use the files table for tracking
      const eventData = {
        user_id: this.userId,
        event_type: eventType,
        metadata: JSON.stringify(metadata || {}),
        created_at: new Date().toISOString()
      };
      
      // Store in browser localStorage as a simple event log
      const existingEvents = JSON.parse(localStorage.getItem('analytics_events') || '[]');
      existingEvents.push(eventData);
      localStorage.setItem('analytics_events', JSON.stringify(existingEvents));
    } catch (error) {
      console.error('Error logging analytics event:', error);
    }
  }

  async getStorageMetrics(): Promise<StorageMetrics> {
    try {
      // Ensure we have the current user ID
      if (!this.userId) {
        await this.ensureUserInitialized();
      }

      // Get real storage data from existing files table
      const { data: files } = await supabase
        .from('files')
        .select('size, type')
        .eq('user_id', this.userId)
        .eq('is_deleted', false);

      if (!files || !this.userId) return {
        totalStorage: -1, // -1 indicates unlimited
        usedStorage: 0,
        availableStorage: -1, // -1 indicates unlimited
        storageGrowth: 0,
        fileCount: 0,
        fileTypes: {},
        storageByType: {}
      };

      const usedStorage = files.reduce((acc, file) => acc + (file.size || 0), 0);
      const fileCount = files.length;
      const totalStorage = -1; // Unlimited storage
      const availableStorage = -1; // Unlimited available

      // Calculate type breakdown
      const fileTypes: { [key: string]: number } = {};
      const storageByType: { [key: string]: number } = {};
      
      files.forEach(file => {
        const type = file.type || 'unknown';
        const category = this.getFileTypeCategory(type);
        fileTypes[category] = (fileTypes[category] || 0) + 1;
        storageByType[category] = (storageByType[category] || 0) + (file.size || 0);
      });

      return {
        totalStorage,
        usedStorage,
        availableStorage,
        storageGrowth: Math.floor(Math.random() * 20) + 5, // Mock growth percentage
        fileCount,
        fileTypes,
        storageByType
      };
    } catch (error) {
      console.error('Error getting storage metrics:', error);
      return {
        totalStorage: -1, // Unlimited
        usedStorage: 0,
        availableStorage: -1, // Unlimited
        storageGrowth: 0,
        fileCount: 0,
        fileTypes: {},
        storageByType: {}
      };
    }
  }

  private getFileTypeCategory(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'Images';
    if (mimeType.startsWith('video/')) return 'Videos';
    if (mimeType.startsWith('audio/')) return 'Audio';
    if (mimeType.includes('pdf')) return 'Documents';
    if (mimeType.includes('document') || mimeType.includes('text')) return 'Documents';
    if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return 'Spreadsheets';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'Archives';
    return 'Other';
  }

  async getActivityMetrics(): Promise<ActivityMetrics> {
    try {
      // Get real events from localStorage
      const events = JSON.parse(localStorage.getItem('analytics_events') || '[]');
      const userEvents = events.filter((e: any) => e.user_id === this.userId);
      
      // Count different event types
      const uploads = userEvents.filter((e: any) => e.event_type === 'file_upload').length;
      const downloads = userEvents.filter((e: any) => e.event_type === 'file_download').length;
      const shares = userEvents.filter((e: any) => e.event_type === 'file_share').length;
      const views = userEvents.filter((e: any) => e.event_type === 'file_view').length;

      // Generate daily activity for the last 7 days
      const dailyActivity = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateString = date.toISOString().split('T')[0];
        const dayEvents = userEvents.filter((e: any) => 
          e.created_at && e.created_at.startsWith(dateString)
        );
        
        dailyActivity.push({
          date: dateString,
          uploads: dayEvents.filter((e: any) => e.event_type === 'file_upload').length,
          downloads: dayEvents.filter((e: any) => e.event_type === 'file_download').length,
          views: dayEvents.filter((e: any) => e.event_type === 'file_view').length
        });
      }

      // Get popular files from file access events
      const fileEvents = userEvents.filter((e: any) => 
        e.event_type === 'file_view' || e.event_type === 'file_download'
      );
      
      const fileStats: { [key: string]: { views: number; downloads: number } } = {};
      fileEvents.forEach((event: any) => {
        try {
          const metadata = JSON.parse(event.metadata || '{}');
          const fileName = metadata.fileName || 'Unknown File';
          if (!fileStats[fileName]) {
            fileStats[fileName] = { views: 0, downloads: 0 };
          }
          if (event.event_type === 'file_view') fileStats[fileName].views++;
          if (event.event_type === 'file_download') fileStats[fileName].downloads++;
        } catch (e) {
          // Skip invalid metadata
        }
      });

      const popularFiles = Object.entries(fileStats)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => (b.views + b.downloads) - (a.views + a.downloads))
        .slice(0, 5);

      // Generate access patterns (hourly activity)
      const accessPatterns = Array.from({ length: 24 }, (_, hour) => {
        const hourEvents = userEvents.filter((e: any) => {
          if (!e.created_at) return false;
          const eventHour = new Date(e.created_at).getHours();
          return eventHour === hour;
        });
        return { hour, activity: hourEvents.length };
      }).filter(p => p.activity > 0);

      return {
        uploads,
        downloads,
        shares,
        views,
        dailyActivity,
        popularFiles,
        accessPatterns
      };
    } catch (error) {
      console.error('Error getting activity metrics:', error);
      return {
        uploads: 0,
        downloads: 0,
        shares: 0,
        views: 0,
        dailyActivity: [],
        popularFiles: [],
        accessPatterns: []
      };
    }
  }

  async getUserMetrics(): Promise<UserMetrics> {
    try {
      // Mock user metrics for now
      return {
        totalUsers: Math.floor(Math.random() * 200) + 100,
        activeUsers: Math.floor(Math.random() * 100) + 50,
        newUsers: Math.floor(Math.random() * 20) + 5,
        userGrowth: Math.floor(Math.random() * 30) + 10, // Growth percentage
        loginPatterns: [
          { date: '2024-01-01', logins: 50 },
          { date: '2024-01-02', logins: 55 },
          { date: '2024-01-03', logins: 60 },
          { date: '2024-01-04', logins: 58 },
          { date: '2024-01-05', logins: 65 },
          { date: '2024-01-06', logins: 70 },
          { date: '2024-01-07', logins: 75 }
        ],
        featureUsage: [
          { feature: 'File Upload', usage: 85 },
          { feature: 'File Sharing', usage: 72 },
          { feature: 'File Preview', usage: 90 },
          { feature: 'Mobile Access', usage: 65 }
        ]
      };
    } catch (error) {
      console.error('Error getting user metrics:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        newUsers: 0,
        userGrowth: 0,
        loginPatterns: [],
        featureUsage: []
      };
    }
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    try {
      // Mock performance metrics for now
      return {
        avgUploadSpeed: Math.floor(Math.random() * 10) + 5, // MB/s
        avgDownloadSpeed: Math.floor(Math.random() * 20) + 15, // MB/s
        errorRate: Math.round((Math.random() * 2 + 0.5) * 100) / 100, // Percentage
        uptime: Math.round((Math.random() * 2 + 98) * 100) / 100, // Percentage
        responseTime: Math.floor(Math.random() * 200) + 100, // ms
        systemHealth: 'excellent' as const,
        bandwidthUsage: [
          { date: '2024-01-01', upload: 120, download: 450 },
          { date: '2024-01-02', upload: 110, download: 380 },
          { date: '2024-01-03', upload: 130, download: 520 },
          { date: '2024-01-04', upload: 100, download: 400 },
          { date: '2024-01-05', upload: 115, download: 475 },
          { date: '2024-01-06', upload: 125, download: 495 },
          { date: '2024-01-07', upload: 105, download: 425 }
        ]
      };
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      return {
        avgUploadSpeed: 0,
        avgDownloadSpeed: 0,
        errorRate: 0,
        uptime: 0,
        responseTime: 0,
        systemHealth: 'poor',
        bandwidthUsage: []
      };
    }
  }

  private generateDailyActivity(events: any[]): { date: string; uploads: number; downloads: number; views: number }[] {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    return last30Days.map(date => {
      const dayEvents = events.filter(e => e.timestamp.startsWith(date));
      return {
        date,
        uploads: dayEvents.filter(e => e.event_type === 'file_upload').length,
        downloads: dayEvents.filter(e => e.event_type === 'file_download').length,
        views: dayEvents.filter(e => e.event_type === 'file_view').length
      };
    });
  }

  private getPopularFiles(events: any[]): { name: string; views: number; downloads: number }[] {
    const fileStats: { [key: string]: { views: number; downloads: number } } = {};

    events.forEach(event => {
      const fileName = event.metadata?.fileName || 'Unknown File';
      if (!fileStats[fileName]) {
        fileStats[fileName] = { views: 0, downloads: 0 };
      }

      if (event.event_type === 'file_view') {
        fileStats[fileName].views++;
      } else if (event.event_type === 'file_download') {
        fileStats[fileName].downloads++;
      }
    });

    return Object.entries(fileStats)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => (b.views + b.downloads) - (a.views + a.downloads))
      .slice(0, 10);
  }

  private getAccessPatterns(events: any[]): { hour: number; activity: number }[] {
    const hourlyActivity = Array.from({ length: 24 }, (_, i) => ({ hour: i, activity: 0 }));

    events.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      hourlyActivity[hour].activity++;
    });

    return hourlyActivity;
  }

  private generateBandwidthData(): { date: string; upload: number; download: number }[] {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return {
        date: date.toISOString().split('T')[0],
        upload: Math.random() * 1000 + 500,
        download: Math.random() * 2000 + 1000
      };
    }).reverse();

    return last30Days;
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('analytics_session_id', sessionId);
    }
    return sessionId;
  }

  private getDefaultStorageMetrics(): StorageMetrics {
    return {
      totalStorage: 100 * 1024 * 1024 * 1024,
      usedStorage: 0,
      availableStorage: 100 * 1024 * 1024 * 1024,
      storageGrowth: 0,
      fileCount: 0,
      fileTypes: {},
      storageByType: {}
    };
  }

  private getDefaultActivityMetrics(): ActivityMetrics {
    return {
      uploads: 0,
      downloads: 0,
      shares: 0,
      views: 0,
      dailyActivity: [],
      popularFiles: [],
      accessPatterns: Array.from({ length: 24 }, (_, i) => ({ hour: i, activity: 0 }))
    };
  }

  // Event tracking methods
  async trackFileUpload(fileName: string, fileSize: number, fileType: string) {
    await this.logEvent('file_upload', { fileName, fileSize, fileType });
  }

  async trackFileDownload(fileName: string) {
    await this.logEvent('file_download', { fileName });
  }

  async trackFileView(fileName: string) {
    await this.logEvent('file_view', { fileName });
  }

  async trackFileShare(fileName: string, shareType: string) {
    await this.logEvent('file_share', { fileName, shareType });
  }

  async trackSearch(query: string, resultCount: number) {
    await this.logEvent('search', { query, resultCount });
  }

  async trackFeatureUsage(feature: string, action: string) {
    await this.logEvent('feature_usage', { feature, action });
  }
}

export const analyticsService = new AnalyticsService();
