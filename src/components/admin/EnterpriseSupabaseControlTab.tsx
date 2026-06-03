import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Database,
  RefreshCcw,
  ShieldCheck,
  TableProperties,
} from '@/lib/icon-map';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';

interface EnterpriseMetrics {
  users: number;
  workspaces: number;
  filesTotal: number;
  encryptedFiles: number;
  folders: number;
  shares: number;
  publicFiles: number;
  deletedFiles: number;
  providers: number;
  apiKeys: number;
  apiRequests24h: number;
  apiErrors24h: number;
  adminAccess24h: number;
  supportOpen: number;
  supportNotifications: number;
  repositories: number;
  audit24h: number;
  analytics24h: number;
  archiveJobs: number;
  maintenanceFlags: number;
}

interface RecentUpload {
  id: string;
  name: string;
  size: number;
  encrypted: boolean;
  storage_path: string;
  created_at: string;
  user_id: string;
}

interface RecentAudit {
  id: string;
  action: string;
  resource: string;
  created_at: string;
  user_id: string;
}

interface TopStorageUser {
  userId: string;
  name: string;
  size: number;
}

interface IntegrityReport {
  brokenWorkspaceRefs: number;
  brokenProviderRefs: number;
  orphanShares: number;
  unsafePublicFiles: number;
  maintenanceEnabled: boolean;
}

interface ForecastReport {
  next7DayFiles: number;
  next7DayUsers: number;
  fileGrowthRate: number;
  userGrowthRate: number;
}

interface EnterpriseOverview {
  metrics: EnterpriseMetrics;
  recentUploads: RecentUpload[];
  recentAudit: RecentAudit[];
  topStorageUsers: TopStorageUser[];
  integrityReport: IntegrityReport;
  forecastReport: ForecastReport;
}

interface ExplorerColumn {
  name: string;
  type: string;
}

interface ExplorerPagination {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

interface ExplorerResponse {
  tableName: string;
  rows: Record<string, unknown>[];
  columns: ExplorerColumn[];
  pagination: ExplorerPagination;
}

const TABLE_OPTIONS = [
  { value: 'files', label: 'files' },
  { value: 'profiles', label: 'profiles' },
  { value: 'folders', label: 'folders' },
  { value: 'workspaces', label: 'workspaces' },
  { value: 'storage_providers', label: 'storage_providers' },
  { value: 'shares', label: 'shares' },
  { value: 'repositories', label: 'repositories' },
  { value: 'api_keys', label: 'api_keys' },
  { value: 'api_request_logs', label: 'api_request_logs' },
  { value: 'admin_access_logs', label: 'admin_access_logs' },
  { value: 'audit_logs', label: 'audit_logs' },
  { value: 'analytics_events', label: 'analytics_events' },
  { value: 'support_tickets', label: 'support_tickets' },
  { value: 'support_notifications', label: 'support_notifications' },
  { value: 'archive_extractions', label: 'archive_extractions' },
  { value: 'collections', label: 'collections' },
];

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const formatRate = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
};

const compactCellValue = (value: unknown) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return json.length > 96 ? `${json.slice(0, 93)}...` : json;
  }

  const stringValue = String(value);
  return stringValue.length > 96 ? `${stringValue.slice(0, 93)}...` : stringValue;
};

const MetricCard = ({ title, value, helper }: { title: string; value: string | number; helper: string }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </CardContent>
  </Card>
);

const EnterpriseSupabaseControlTab = () => {
  const [overview, setOverview] = useState<EnterpriseOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState('files');
  const [tablePage, setTablePage] = useState(1);
  const [explorer, setExplorer] = useState<ExplorerResponse | null>(null);

  const fetchOverview = async () => {
    try {
      setOverviewLoading(true);
      const { data, error } = await supabase.functions.invoke('admin-data-access', {
        body: { action: 'enterprise_overview' },
      });

      if (error) throw error;
      setOverview(data as EnterpriseOverview);
    } catch (error) {
      console.error('Failed to fetch enterprise overview:', error);
      toast.error('Failed to fetch enterprise overview data.');
    } finally {
      setOverviewLoading(false);
    }
  };

  const fetchExplorer = async (tableName: string, page: number) => {
    try {
      setTableLoading(true);
      const { data, error } = await supabase.functions.invoke('admin-data-access', {
        body: {
          action: 'table_explorer',
          tableName,
          page,
          pageSize: 15,
        },
      });

      if (error) throw error;
      setExplorer(data as ExplorerResponse);
    } catch (error) {
      console.error('Failed to fetch table explorer data:', error);
      toast.error('Failed to fetch table explorer data.');
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  useEffect(() => {
    fetchExplorer(selectedTable, tablePage);
  }, [selectedTable, tablePage]);

  const handleTableChange = (table: string) => {
    setSelectedTable(table);
    setTablePage(1);
  };

  const topStorageChart = useMemo(
    () => (overview?.topStorageUsers || []).map((item) => ({
      user: item.name.length > 18 ? `${item.name.slice(0, 18)}...` : item.name,
      bytes: item.size,
    })),
    [overview?.topStorageUsers]
  );

  const integrityChart = useMemo(
    () => [
      { name: 'Broken Workspace Links', count: overview?.integrityReport.brokenWorkspaceRefs || 0 },
      { name: 'Broken Provider Links', count: overview?.integrityReport.brokenProviderRefs || 0 },
      { name: 'Orphan Shares', count: overview?.integrityReport.orphanShares || 0 },
      { name: 'Unsafe Public Files', count: overview?.integrityReport.unsafePublicFiles || 0 },
    ],
    [overview?.integrityReport]
  );

  const columns = explorer?.columns || [];
  const rows = explorer?.rows || [];
  const visibleColumns = columns.slice(0, 8);

  if (overviewLoading && !overview) {
    return <div className="p-8 text-center">Loading enterprise control surface...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Global Supabase Control</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Privileged platform observability and cross-table inspection from admin-data-access.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            Global Scope
          </Badge>
          <Button
            variant="outline"
            onClick={() => {
              fetchOverview();
              fetchExplorer(selectedTable, tablePage);
            }}
            disabled={overviewLoading || tableLoading}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Users" value={overview?.metrics.users || 0} helper="Total accounts" />
        <MetricCard title="Workspaces" value={overview?.metrics.workspaces || 0} helper="Global workspace count" />
        <MetricCard title="Files" value={overview?.metrics.filesTotal || 0} helper="All uploaded files" />
        <MetricCard
          title="Encrypted Files"
          value={overview?.metrics.encryptedFiles || 0}
          helper="Files marked encrypted"
        />
        <MetricCard title="Storage Providers" value={overview?.metrics.providers || 0} helper="Active provider configs" />
        <MetricCard title="API Requests (24h)" value={overview?.metrics.apiRequests24h || 0} helper="Platform-wide API traffic" />
        <MetricCard title="API Errors (24h)" value={overview?.metrics.apiErrors24h || 0} helper="Status >= 400" />
        <MetricCard title="Admin Access (24h)" value={overview?.metrics.adminAccess24h || 0} helper="Privileged access attempts" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Top Storage Consumers
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topStorageChart} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value) => formatBytes(Number(value))} />
                <YAxis type="category" dataKey="user" width={150} />
                <Tooltip formatter={(value: number) => formatBytes(Number(value))} />
                <Bar dataKey="bytes" fill="#2563eb" radius={[4, 4, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Integrity Sentinel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={integrityChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" hide />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {integrityChart.map((entry) => (
                <div key={entry.name} className="rounded-lg border p-2">
                  <p className="text-muted-foreground">{entry.name}</p>
                  <p className="text-lg font-semibold">{entry.count}</p>
                </div>
              ))}
            </div>
            <Badge variant={overview?.integrityReport.maintenanceEnabled ? 'destructive' : 'outline'}>
              {overview?.integrityReport.maintenanceEnabled ? 'Maintenance Enabled' : 'Maintenance Disabled'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Forecast Engine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">Projected Files (7d)</p>
              <p className="text-2xl font-semibold">{overview?.forecastReport.next7DayFiles || 0}</p>
              <p className="text-xs text-muted-foreground">Growth rate {formatRate(overview?.forecastReport.fileGrowthRate || 0)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">Projected Users (7d)</p>
              <p className="text-2xl font-semibold">{overview?.forecastReport.next7DayUsers || 0}</p>
              <p className="text-xs text-muted-foreground">Growth rate {formatRate(overview?.forecastReport.userGrowthRate || 0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Uploads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(overview?.recentUploads || []).slice(0, 6).map((upload) => (
              <div key={upload.id} className="rounded-lg border p-2 text-sm">
                <p className="font-medium truncate">{upload.name || upload.storage_path}</p>
                <p className="text-muted-foreground">{formatBytes(upload.size || 0)} • {new Date(upload.created_at).toLocaleString()}</p>
              </div>
            ))}
            {(overview?.recentUploads || []).length === 0 && (
              <p className="text-sm text-muted-foreground">No recent uploads found.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Audit Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(overview?.recentAudit || []).slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-lg border p-2 text-sm">
                <p className="font-medium truncate">{item.action}</p>
                <p className="text-muted-foreground truncate">{item.resource || 'resource:unknown'}</p>
                <p className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
              </div>
            ))}
            {(overview?.recentAudit || []).length === 0 && (
              <p className="text-sm text-muted-foreground">No recent audit events found.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center gap-2">
            <TableProperties className="h-4 w-4" />
            Global Table Explorer
          </CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={selectedTable} onValueChange={handleTableChange}>
              <SelectTrigger className="w-full sm:w-[260px]">
                <SelectValue placeholder="Select table" />
              </SelectTrigger>
              <SelectContent>
                {TABLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => fetchExplorer(selectedTable, tablePage)} disabled={tableLoading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh Table
            </Button>
            <Badge variant="outline" className="ml-auto">
              {explorer?.pagination.totalRows || 0} rows
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tableLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading table snapshot...</div>
          ) : (
            <>
              {columns.length > 8 && (
                <p className="text-xs text-muted-foreground">
                  Showing first 8 columns for readability. Full row payload remains available via edge function response.
                </p>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    {visibleColumns.map((column) => (
                      <TableHead key={column.name}>{column.name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, rowIndex) => (
                    <TableRow key={`row-${rowIndex}`}>
                      {visibleColumns.map((column) => (
                        <TableCell key={`${rowIndex}-${column.name}`}>{compactCellValue(row[column.name])}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={Math.max(visibleColumns.length, 1)} className="text-center text-muted-foreground">
                        No rows returned for this table.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setTablePage(Math.max(1, tablePage - 1))}
                  disabled={tablePage <= 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {explorer?.pagination.page || 1} of {explorer?.pagination.totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setTablePage(Math.min(explorer?.pagination.totalPages || 1, tablePage + 1))}
                  disabled={tablePage >= (explorer?.pagination.totalPages || 1)}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EnterpriseSupabaseControlTab;
