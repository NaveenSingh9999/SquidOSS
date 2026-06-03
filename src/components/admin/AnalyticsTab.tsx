
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, HardDrive, Upload, TrendingUp } from '@/lib/icon-map';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { toast } from 'sonner';

interface AnalyticsData {
  totalUsers: number;
  totalStorageUsed: number;
  totalFiles: number;
  filesLast7Days: number;
  filesLast30Days: number;
  filesLast6Months: number;
  filesLastYear: number;
  topActiveUsers: any[];
  topStorageUsers: any[];
  uploadTrends: any[];
  userGrowth: any[];
}

const AnalyticsTab = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Use admin-data-access edge function to get global analytics
      const { data: analyticsData, error } = await supabase.functions.invoke('admin-data-access', {
        body: { action: 'global_analytics' }
      });

      if (error) throw error;
      
      setData(analyticsData || {
        totalUsers: 0,
        totalStorageUsed: 0,
        totalFiles: 0,
        filesLast7Days: 0,
        filesLast30Days: 0,
        filesLast6Months: 0,
        filesLastYear: 0,
        topActiveUsers: [],
        topStorageUsers: [],
        uploadTrends: [],
        userGrowth: []
      });
    } catch (error) {
      console.error('Failed to fetch global analytics:', error);
      toast.error('Failed to fetch global analytics data.');
      setData({
        totalUsers: 0,
        totalStorageUsed: 0,
        totalFiles: 0,
        filesLast7Days: 0,
        filesLast30Days: 0,
        filesLast6Months: 0,
        filesLastYear: 0,
        topActiveUsers: [],
        topStorageUsers: [],
        uploadTrends: [],
        userGrowth: []
      });
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return <div className="p-8 text-center">Loading global analytics...</div>;
  }

  if (!data) {
    return <div className="p-8 text-center">Failed to load analytics data</div>;
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics - Global Platform Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Platform Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalUsers}</div>
            <p className="text-xs text-muted-foreground">Registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Platform Storage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(data.totalStorageUsed)}</div>
            <p className="text-xs text-muted-foreground">All users combined</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Platform Files</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalFiles}</div>
            <p className="text-xs text-muted-foreground">All uploaded files</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.filesLast7Days}</div>
            <p className="text-xs text-muted-foreground">Files uploaded (7 days)</p>
          </CardContent>
        </Card>
      </div>

      {/* File Upload Metrics - Platform Wide */}
      <Card>
        <CardHeader>
          <CardTitle>Platform File Upload Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{data.filesLast7Days}</div>
              <div className="text-sm text-gray-600">Last 7 days</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{data.filesLast30Days}</div>
              <div className="text-sm text-gray-600">Last 30 days</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{data.filesLast6Months}</div>
              <div className="text-sm text-gray-600">Last 6 months</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{data.filesLastYear}</div>
              <div className="text-sm text-gray-600">Last year</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts - Platform Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Daily Platform Upload Trends (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.uploadTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="uploads" stroke="#8884d8" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform User Growth (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.userGrowth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="users" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Users - Platform Wide Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Most Active Users (By File Count)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topActiveUsers.map((user, index) => (
                <div key={user.userId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">#{index + 1}</Badge>
                    <span className="font-medium">{user.name}</span>
                    <span className="text-sm text-gray-500">({user.userId.slice(0, 8)}...)</span>
                  </div>
                  <span className="font-bold">{user.count} files</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Highest Storage Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topStorageUsers.map((user, index) => (
                <div key={user.userId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">#{index + 1}</Badge>
                    <span className="font-medium">{user.name}</span>
                    <span className="text-sm text-gray-500">({user.userId.slice(0, 8)}...)</span>
                  </div>
                  <span className="font-bold">{formatBytes(user.storage)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AnalyticsTab;
