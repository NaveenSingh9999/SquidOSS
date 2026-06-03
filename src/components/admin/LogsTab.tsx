import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, RefreshCw, AlertTriangle, Activity, TerminalSquare } from '@/lib/icon-map';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
} from 'recharts';
import { toast } from 'sonner';

interface GlobalLogItem {
  id: string;
  source: string;
  timestamp: string;
  level: string;
  path: string | null;
  statusCode: number | null;
  message: string;
  eventMessage: string;
}

interface SourceBreakdown {
  source: string;
  total: number;
}

interface LogsSummary {
  totalLogs: number;
  errorLogs: number;
  sourceFilter: string;
  severity: string;
  windowHours: number;
  sourceBreakdown: SourceBreakdown[];
  projectRef: string;
}

interface TimelinePoint {
  bucket: string;
  total: number;
}

interface LogsPagination {
  page: number;
  pageSize: number;
  totalFiltered: number;
  totalPages: number;
}

const PAGE_SIZE = 50;

const SOURCE_LABELS: Record<string, string> = {
  all: 'All Services',
  api: 'API Gateway',
  edge_functions: 'Edge Functions',
  edge_logs: 'API Edge Logs',
  function_edge_logs: 'Function Invocations',
  function_logs: 'Function Runtime Logs',
  auth: 'Auth',
  auth_logs: 'Auth',
  postgres: 'Postgres',
  postgres_logs: 'Postgres',
  realtime: 'Realtime',
  realtime_logs: 'Realtime',
  storage: 'Storage',
  storage_logs: 'Storage',
};

const truncateMessage = (value: string, limit = 200) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
};

const getLevelClassName = (level: string) => {
  const normalized = level.toLowerCase();
  if (normalized.includes('error') || normalized.includes('fatal')) {
    return 'bg-red-100 text-red-800 border-red-200';
  }
  if (normalized.includes('warn')) {
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }
  return 'bg-blue-100 text-blue-800 border-blue-200';
};

const sourceOptions = [
  { value: 'all', label: 'All Services' },
  { value: 'api', label: 'API Gateway' },
  { value: 'edge_functions', label: 'Edge Functions (All)' },
  { value: 'function_edge_logs', label: 'Function Invocations' },
  { value: 'function_logs', label: 'Function Runtime Logs' },
  { value: 'auth', label: 'Auth' },
  { value: 'postgres', label: 'Postgres' },
  { value: 'realtime', label: 'Realtime' },
  { value: 'storage', label: 'Storage' },
];

const severityOptions = [
  { value: 'all', label: 'All Events' },
  { value: 'errors', label: 'Errors Only' },
  { value: 'warnings', label: 'Warnings Only' },
];

const windowOptions = [
  { value: '1', label: 'Last 1 hour' },
  { value: '3', label: 'Last 3 hours' },
  { value: '6', label: 'Last 6 hours' },
  { value: '12', label: 'Last 12 hours' },
  { value: '24', label: 'Last 24 hours' },
];

const LogsTab = () => {
  const [logs, setLogs] = useState<GlobalLogItem[]>([]);
  const [summary, setSummary] = useState<LogsSummary>({
    totalLogs: 0,
    errorLogs: 0,
    sourceFilter: 'all',
    severity: 'all',
    windowHours: 24,
    sourceBreakdown: [],
    projectRef: '',
  });
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [pagination, setPagination] = useState<LogsPagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalFiltered: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [windowHours, setWindowHours] = useState('24');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [sourceFilter, severity, debouncedSearchTerm, windowHours]);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);

      const { data, error } = await supabase.functions.invoke('admin-data-access', {
        body: {
          action: 'global_logs',
          page,
          pageSize: PAGE_SIZE,
          sourceFilter,
          severity,
          windowHours: Number(windowHours),
          searchTerm: debouncedSearchTerm,
        },
      });

      if (error) throw error;

      const responseError = typeof data?.error === 'string' ? data.error : null;

      setLogs(data?.logs || []);
      setTimeline(data?.timeline || []);
      setFetchError(responseError);
      setSummary(
        data?.summary || {
          totalLogs: 0,
          errorLogs: 0,
          sourceFilter,
          severity,
          windowHours: Number(windowHours),
          sourceBreakdown: [],
          projectRef: '',
        }
      );
      setPagination(
        data?.pagination || {
          page,
          pageSize: PAGE_SIZE,
          totalFiltered: 0,
          totalPages: 1,
        }
      );
    } catch (err: any) {
      console.error('Failed to fetch global service logs:', err);
      const message = err?.message || 'Failed to fetch global Supabase service logs.';
      setFetchError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm, page, severity, sourceFilter, windowHours]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const timelineChartData = useMemo(
    () =>
      timeline.map((point) => ({
        ...point,
        label: point.bucket.length >= 16 ? point.bucket.slice(5, 16) : point.bucket,
      })),
    [timeline]
  );

  const sourceBreakdownChartData = useMemo(
    () =>
      summary.sourceBreakdown.map((item) => ({
        ...item,
        label: SOURCE_LABELS[item.source] || item.source,
      })),
    [summary.sourceBreakdown]
  );

  if (loading) {
    return <div className="p-8 text-center">Loading global Supabase service logs...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TerminalSquare className="h-4 w-4" />
            Global Supabase Logs
          </CardTitle>
          <CardDescription>
            Live project-wide logs from Supabase services (API, Auth, Edge Functions, Postgres, Realtime, and Storage) via Management API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search message text across all selected services..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-full xl:w-[220px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {sourceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-full xl:w-[190px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                {severityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={windowHours} onValueChange={setWindowHours}>
              <SelectTrigger className="w-full xl:w-[170px]">
                <SelectValue placeholder="Window" />
              </SelectTrigger>
              <SelectContent>
                {windowOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={fetchLogs} variant="outline" className="w-full xl:w-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          {fetchError && (
            <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-medium">Logs API configuration issue</p>
                  <p className="mt-1">{fetchError}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Events</p>
            <p className="mt-1 text-2xl font-bold">{summary.totalLogs}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Error Events</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{summary.errorLogs}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active Sources</p>
            <p className="mt-1 text-2xl font-bold">{summary.sourceBreakdown.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Time Window</p>
            <p className="mt-1 text-2xl font-bold">{summary.windowHours}h</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Log Volume Timeline</CardTitle>
            <CardDescription>Hourly totals across selected services.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <RechartsTooltip />
                <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Source Breakdown</CardTitle>
            <CardDescription>Which Supabase services are producing logs.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceBreakdownChartData} layout="vertical" margin={{ left: 20, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={170}
                  tickFormatter={(value: string) =>
                    value.length > 22 ? `${value.slice(0, 22)}...` : value
                  }
                />
                <RechartsTooltip />
                <Bar dataKey="total" fill="#0f766e" radius={[4, 4, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span>Global Log Stream</span>
            <Badge variant="outline">{pagination.totalFiltered} filtered</Badge>
          </CardTitle>
          <CardDescription>
            Project: {summary.projectRef || 'unknown'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No logs matched the selected filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Timestamp</TableHead>
                  <TableHead className="min-w-[160px]">Source</TableHead>
                  <TableHead className="min-w-[100px]">Level</TableHead>
                  <TableHead className="min-w-[80px]">Status</TableHead>
                  <TableHead className="min-w-[220px]">Path</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[11px]">
                        {SOURCE_LABELS[log.source] || log.source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getLevelClassName(log.level)}>
                        {log.level}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {typeof log.statusCode === 'number' ? (
                        <span className="font-mono text-xs">{log.statusCode}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.path || '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      <p title={log.eventMessage} className="max-w-[700px] break-words leading-5">
                        {truncateMessage(log.message)}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {pagination.totalPages > 1 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                disabled={page === pagination.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" />
          Data source: Supabase Management API endpoint analytics/endpoints/logs.all (not database tables).
        </div>
      </div>
    </div>
  );
};

export default LogsTab;
