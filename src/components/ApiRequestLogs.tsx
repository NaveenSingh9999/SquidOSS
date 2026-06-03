
import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Search, Download, RefreshCw, ChevronLeft, ChevronRight } from '@/lib/icon-map';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface ApiRequestLog {
  id: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  ip_address: string;
  user_agent: string;
  file_name?: string;
  file_size?: number;
  error_message?: string;
  created_at: string;
  api_key: {
    name: string;
    key_prefix: string;
  };
}

const ApiRequestLogs: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [endpointFilter, setEndpointFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['api-request-logs', searchTerm, statusFilter, endpointFilter, page],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let query = supabase
        .from('api_request_logs')
        .select(`
          *,
          api_key:api_keys(name, key_prefix)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (searchTerm) {
        query = query.or(`endpoint.ilike.%${searchTerm}%,file_name.ilike.%${searchTerm}%`);
      }

      if (statusFilter !== 'all') {
        const statusCode = parseInt(statusFilter);
        if (statusFilter === '2xx') {
          query = query.gte('status_code', 200).lt('status_code', 300);
        } else if (statusFilter === '4xx') {
          query = query.gte('status_code', 400).lt('status_code', 500);
        } else if (statusFilter === '5xx') {
          query = query.gte('status_code', 500).lt('status_code', 600);
        } else if (!isNaN(statusCode)) {
          query = query.eq('status_code', statusCode);
        }
      }

      if (endpointFilter !== 'all') {
        query = query.ilike('endpoint', `%${endpointFilter}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ApiRequestLog[];
    },
    enabled: true
  });

  const getStatusBadge = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300)
      return <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Success</span>;
    if (statusCode >= 400 && statusCode < 500)
      return <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Client Error</span>;
    if (statusCode >= 500)
      return <span className="text-[10px] font-medium text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">Server Error</span>;
    return <span className="text-[10px] text-muted-foreground/50 px-1.5 py-0.5 rounded border border-border/30">{statusCode}</span>;
  };

  const getMethodBadge = (method: string) => {
    const colors: Record<string, string> = {
      GET: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      POST: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      PUT: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      DELETE: 'text-red-400 bg-red-500/10 border-red-500/20',
      PATCH: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    };
    return <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", colors[method] || 'text-muted-foreground/50 border-border/30')}>{method}</span>;
  };

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)}${units[unitIndex]}`;
  };

  const exportLogs = () => {
    if (!logs) return;
    
    const csv = [
      ['Timestamp', 'Method', 'Endpoint', 'Status', 'Response Time', 'IP Address', 'API Key', 'File Name', 'File Size', 'Error'].join(','),
      ...logs.map(log => [
        log.created_at,
        log.method,
        log.endpoint,
        log.status_code,
        log.response_time_ms,
        log.ip_address,
        log.api_key?.name || '',
        log.file_name || '',
        log.file_size || '',
        log.error_message || ''
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">API Request Logs</span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => refetch()} className="inline-flex items-center gap-1 h-7 rounded px-2 text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors border border-border/40">
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
          <button onClick={exportLogs} className="inline-flex items-center gap-1 h-7 rounded px-2 text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors border border-border/40">
            <Download className="w-3 h-3" />
            Export
          </button>
        </div>
      </div>
      <div className="h-px bg-border/40" />

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
          <Input placeholder="Search endpoint or file..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 pl-8 text-xs" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Status</SelectItem>
            <SelectItem value="2xx" className="text-xs">Success (2xx)</SelectItem>
            <SelectItem value="4xx" className="text-xs">Client Error (4xx)</SelectItem>
            <SelectItem value="5xx" className="text-xs">Server Error (5xx)</SelectItem>
            <SelectItem value="200" className="text-xs">200 OK</SelectItem>
            <SelectItem value="401" className="text-xs">401 Unauthorized</SelectItem>
            <SelectItem value="404" className="text-xs">404 Not Found</SelectItem>
            <SelectItem value="500" className="text-xs">500 Server Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={endpointFilter} onValueChange={setEndpointFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Endpoint" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Endpoints</SelectItem>
            <SelectItem value="upload" className="text-xs">File Upload</SelectItem>
            <SelectItem value="metadata" className="text-xs">File Metadata</SelectItem>
            <SelectItem value="download" className="text-xs">File Download</SelectItem>
            <SelectItem value="delete" className="text-xs">File Delete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Logs Table */}
      <div className="rounded-lg border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                {['Timestamp', 'Method', 'Endpoint', 'Status', 'Response', 'API Key', 'Details'].map(h => (
                  <th key={h} className="text-left h-8 px-2.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center h-20 text-[11px] text-muted-foreground/50">Loading logs...</td></tr>
              ) : logs && logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/20 hover:bg-accent/20 transition-colors">
                    <td className="h-9 px-2.5">
                      <div className="text-[11px] text-muted-foreground/80">{new Date(log.created_at).toLocaleString()}</div>
                      <div className="text-[9px] text-muted-foreground/40">{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</div>
                    </td>
                    <td className="h-9 px-2.5">{getMethodBadge(log.method)}</td>
                    <td className="h-9 px-2.5"><code className="text-[11px] font-mono text-muted-foreground/80">{log.endpoint}</code></td>
                    <td className="h-9 px-2.5">
                      <div className="flex items-center gap-1.5">
                        {getStatusBadge(log.status_code)}
                        <span className="text-[11px] text-muted-foreground/50">{log.status_code}</span>
                      </div>
                    </td>
                    <td className="h-9 px-2.5 text-[11px] text-muted-foreground/70">{formatResponseTime(log.response_time_ms)}</td>
                    <td className="h-9 px-2.5">
                      <div className="text-[11px] text-muted-foreground/80">{log.api_key?.name || 'Unknown'}</div>
                      <div className="text-[9px] font-mono text-muted-foreground/40">{log.api_key?.key_prefix}...</div>
                    </td>
                    <td className="h-9 px-2.5">
                      <div className="space-y-0.5">
                        {log.file_name && <div className="text-[10px] text-muted-foreground/60">{log.file_name}{log.file_size && ` (${formatFileSize(log.file_size)})`}</div>}
                        {log.error_message && <div className="text-[10px] text-red-400/70">Error: {log.error_message}</div>}
                        <div className="text-[9px] text-muted-foreground/40">{log.ip_address}</div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={7} className="text-center h-20 text-[11px] text-muted-foreground/50">No API requests found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {logs && logs.length === pageSize && (
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            className="inline-flex items-center gap-1 h-7 rounded px-2 text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors border border-border/40 disabled:opacity-30">
            <ChevronLeft className="w-3 h-3" />
            Previous
          </button>
          <span className="text-[11px] text-muted-foreground/50">Page {page}</span>
          <button onClick={() => setPage(page + 1)} disabled={logs.length < pageSize}
            className="inline-flex items-center gap-1 h-7 rounded px-2 text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors border border-border/40 disabled:opacity-30">
            Next
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ApiRequestLogs;
