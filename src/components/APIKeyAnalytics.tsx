
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { formatDistanceToNow, format, subDays, startOfDay } from 'date-fns';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
}
import { Activity, Globe, FileText, AlertTriangle } from '@/lib/icon-map';

interface RequestLog {
  id: string;
  endpoint: string;
  method: string;
  ip_address: string | null;
  user_agent: string | null;
  status_code: number;
  response_time_ms: number | null;
  file_name: string | null;
  file_size: number | null;
  error_message: string | null;
  created_at: string;
}

interface DailyStats {
  date: string;
  requests: number;
  successful: number;
  failed: number;
}

interface APIKeyAnalyticsProps {
  apiKeyId: string;
}

const APIKeyAnalytics: React.FC<APIKeyAnalyticsProps> = ({ apiKeyId }) => {
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRequests, setTotalRequests] = useState(0);
  const [successRate, setSuccessRate] = useState(0);

  useEffect(() => {
    fetchAnalytics();
  }, [apiKeyId]);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [uniqueEndpoints, setUniqueEndpoints] = useState<string[]>([]);

  const fetchAnalytics = async () => {
    try {
      // Build query for logs with pagination
      let query = supabase
        .from('api_request_logs')
        .select('*', { count: 'exact' })
        .eq('api_key_id', apiKeyId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (dateRange[0] && dateRange[1]) {
        query = query
          .gte('created_at', dateRange[0].toISOString())
          .lte('created_at', dateRange[1].toISOString());
      }

      if (selectedEndpoint) {
        query = query.eq('endpoint', selectedEndpoint);
      }

      // Add pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      // Execute query
      const { data: logs, error: logsError, count } = await query;

      if (logsError) throw logsError;

      // Update total pages
      if (count !== null) {
        setTotalPages(Math.ceil(count / pageSize));
      }

      // Fetch unique endpoints for filter
      const { data: endpoints } = await supabase
        .from('api_request_logs')
        .select('endpoint')
        .eq('api_key_id', apiKeyId)
        .limit(1000);

      if (endpoints) {
        const unique = Array.from(new Set(endpoints.map(e => e.endpoint))).sort();
        setUniqueEndpoints(unique);
      }

      // Fetch daily stats for the past 7 days
      const sevenDaysAgo = subDays(new Date(), 7);
      const { data: allLogs, error: statsError } = await supabase
        .from('api_request_logs')
        .select('created_at, status_code')
        .eq('api_key_id', apiKeyId)
        .gte('created_at', sevenDaysAgo.toISOString());

      if (statsError) throw statsError;

      // Transform the data to match our interface
      const transformedLogs: RequestLog[] = (logs || []).map(log => ({
        ...log,
        ip_address: log.ip_address as string | null
      }));

      setRequestLogs(transformedLogs);
      
      // Process daily stats
      const statsMap = new Map<string, { requests: number; successful: number; failed: number }>();
      
      // Initialize all days with 0
      for (let i = 0; i < 7; i++) {
        const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
        statsMap.set(date, { requests: 0, successful: 0, failed: 0 });
      }

      // Populate with actual data
      allLogs?.forEach(log => {
        const date = format(new Date(log.created_at), 'yyyy-MM-dd');
        const stats = statsMap.get(date);
        if (stats) {
          stats.requests++;
          if (log.status_code >= 200 && log.status_code < 400) {
            stats.successful++;
          } else {
            stats.failed++;
          }
        }
      });

      const dailyStatsArray = Array.from(statsMap.entries())
        .map(([date, stats]) => ({
          date,
          ...stats
        }))
        .reverse();

      setDailyStats(dailyStatsArray);
      
      // Calculate totals
      const total = allLogs?.length || 0;
      const successful = allLogs?.filter(log => log.status_code >= 200 && log.status_code < 400).length || 0;
      
      setTotalRequests(total);
      setSuccessRate(total > 0 ? Math.round((successful / total) * 100) : 0);

    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) {
      return <Badge className="bg-green-100 text-green-800">{statusCode}</Badge>;
    } else if (statusCode >= 400 && statusCode < 500) {
      return <Badge className="bg-yellow-100 text-yellow-800">{statusCode}</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">{statusCode}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-32 bg-gray-200 rounded mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRequests}</div>
            <p className="text-xs text-muted-foreground">
              Last 7 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">
              2xx-3xx responses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{requestLogs.length}</div>
            <p className="text-xs text-muted-foreground">
              Recent requests
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Daily Requests</CardTitle>
            <CardDescription>Request volume over the past 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                />
                <Line 
                  type="monotone" 
                  dataKey="requests" 
                  stroke="#8884d8" 
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Success vs Errors</CardTitle>
            <CardDescription>Request success rates by day</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                />
                <Bar dataKey="successful" fill="#10b981" />
                <Bar dataKey="failed" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Requests Log */}
      <Card>
        <CardHeader>
          <CardTitle>API Request Logs</CardTitle>
          <CardDescription>
            Detailed log of API requests with filtering and pagination
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">Date Range</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  onChange={(e) => setDateRange([e.target.valueAsDate, dateRange[1]])}
                />
                <input
                  type="date"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  onChange={(e) => setDateRange([dateRange[0], e.target.valueAsDate])}
                />
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">Endpoint</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                onChange={(e) => setSelectedEndpoint(e.target.value || null)}
                value={selectedEndpoint || ''}
              >
                <option value="">All Endpoints</option>
                {uniqueEndpoints.map((endpoint) => (
                  <option key={endpoint} value={endpoint}>{endpoint}</option>
                ))}
              </select>
            </div>
          </div>

          <ScrollArea className="h-96">
            {requestLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No requests found for this API key
              </div>
            ) : (
              <div className="space-y-2">
                {requestLogs.map((log) => (
                  <div 
                    key={log.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        {getStatusBadge(log.status_code)}
                        <Badge variant="outline">{log.method}</Badge>
                      </div>
                      <div>
                        <div className="font-medium">{log.endpoint}</div>
                        <div className="text-sm text-muted-foreground">
                          {log.ip_address || 'Unknown IP'} • {log.file_name && `${log.file_name} • `}
                          {formatDistanceToNow(new Date(log.created_at))} ago
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {log.response_time_ms && (
                        <div className="text-sm text-muted-foreground">
                          {log.response_time_ms}ms
                        </div>
                      )}
                      {log.file_size && (
                        <div className="text-xs text-muted-foreground">
                          {(log.file_size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </div>
        <div className="flex gap-2">
          <button
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <button
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default APIKeyAnalytics;
