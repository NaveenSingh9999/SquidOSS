import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Eye, Download, Clock, Calendar, Globe, Lock } from '@/lib/icon-map';
import { formatDistanceToNow } from 'date-fns';

interface ShareAnalyticsProps {
  shareId: string;
  fileId: string;
}

interface ShareStats {
  share_views: number;
  download_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  share_type: string;
}

export const ShareLinkAnalytics: React.FC<ShareAnalyticsProps> = ({ shareId, fileId }) => {
  const [stats, setStats] = useState<ShareStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data: shareData } = await supabase
          .from('shares')
          .select('share_views, download_count, is_active, expires_at, created_at, share_type')
          .eq('share_id', shareId)
          .single();

        if (shareData) setStats(shareData as ShareStats);

        const { data: logsData } = await supabase
          .from('share_audit_logs')
          .select('event_type, created_at, ip_address, geo_city, geo_country')
          .eq('share_id', shareId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (logsData) setRecentActivity(logsData);
      } catch (err) {
        console.error('Failed to load share analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    if (shareId) fetch();
  }, [shareId]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Share Analytics</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Loading stats...</p></CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/50 bg-card/60 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Eye className="w-4 h-4" />
            <span className="text-xs font-medium">Views</span>
          </div>
          <p className="text-2xl font-bold">{stats.share_views || 0}</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/60 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Download className="w-4 h-4" />
            <span className="text-xs font-medium">Downloads</span>
          </div>
          <p className="text-2xl font-bold">{stats.download_count || 0}</p>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant={stats.is_active ? 'default' : 'secondary'} className="gap-1">
          {stats.is_active ? 'Active' : 'Inactive'}
        </Badge>
        <Badge variant="outline" className="gap-1">
          {stats.share_type === 'public' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          {stats.share_type === 'public' ? 'Public' : 'Restricted'}
        </Badge>
        {stats.expires_at && (
          <Badge variant="outline" className="gap-1 text-orange-600 border-orange-200">
            <Calendar className="w-3 h-3" />
            Expires {formatDistanceToNow(new Date(stats.expires_at), { addSuffix: true })}
          </Badge>
        )}
      </div>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Recent Activity
          </h4>
          <div className="space-y-1.5">
            {recentActivity.map((log, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  {log.event_type === 'view' ? (
                    <Eye className="w-3 h-3 text-blue-500" />
                  ) : (
                    <Download className="w-3 h-3 text-green-500" />
                  )}
                  <span className="font-medium capitalize">{log.event_type}</span>
                  {log.geo_city && (
                    <span className="text-muted-foreground">
                      {log.geo_city}{log.geo_country ? `, ${log.geo_country}` : ''}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground">
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShareLinkAnalytics;
