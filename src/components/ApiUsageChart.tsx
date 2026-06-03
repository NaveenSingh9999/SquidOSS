
import React, { useState, useEffect } from 'react';
import { Activity, TrendingUp, Database, Clock, CheckCircle2, XCircle, AlertCircle } from '@/lib/icon-map';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface LogEntry {
  created_at: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  error_message?: string;
}

function useApiLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchLogs = async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from('api_request_logs')
        .select('created_at, endpoint, method, status_code, response_time_ms, error_message')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: true });
      if (!error && data) setLogs(data as LogEntry[]);
      setLoading(false);
    };
    fetchLogs();
  }, [user]);

  const today = logs.filter(l => new Date(l.created_at) > new Date(Date.now() - 86400000));
  const yesterday = logs.filter(l => {
    const d = new Date(l.created_at);
    const now = new Date();
    return d > new Date(now.getTime() - 172800000) && d < new Date(now.getTime() - 86400000);
  });

  const requestsToday = today.length;
  const requestsYesterday = yesterday.length;
  const todayPct = requestsYesterday > 0 ? Math.round(((requestsToday - requestsYesterday) / requestsYesterday) * 100) : 0;
  const avgResponse = today.length > 0 ? Math.round(today.reduce((s, l) => s + (l.response_time_ms || 0), 0) / today.length) : 0;
  const yesterdayAvg = yesterday.length > 0 ? Math.round(yesterday.reduce((s, l) => s + (l.response_time_ms || 0), 0) / yesterday.length) : 0;
  const respDiff = yesterdayAvg > 0 ? avgResponse - yesterdayAvg : 0;
  const successToday = today.filter(l => l.status_code < 400).length;
  const successRate = today.length > 0 ? Math.round((successToday / today.length) * 100) : 100;
  const yesterdaySuccess = yesterday.filter(l => l.status_code < 400).length;
  const ySuccessRate = yesterday.length > 0 ? Math.round((yesterdaySuccess / yesterday.length) * 100) : 100;
  const rateDiff = ySuccessRate > 0 ? successRate - ySuccessRate : 0;
  const totalBytes = today.reduce((s, l) => s + (0), 0);
  const bandwidth = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;

  const hourlyBuckets: { hour: string; requests: number; ok: number; err: number }[] = [];
  for (let h = 0; h < 24; h++) {
    const label = `${h.toString().padStart(2, '0')}:00`;
    const hLogs = today.filter(l => new Date(l.created_at).getHours() === h);
    hourlyBuckets.push({ hour: label, requests: hLogs.length, ok: hLogs.filter(l => l.status_code < 400).length, err: hLogs.filter(l => l.status_code >= 400).length });
  }

  const endpointCounts: Record<string, { count: number; errors: number }> = {};
  today.forEach(l => { if (!endpointCounts[l.endpoint]) endpointCounts[l.endpoint] = { count: 0, errors: 0 }; endpointCounts[l.endpoint].count++; if (l.status_code >= 400) endpointCounts[l.endpoint].errors++; });
  const topEndpoints = Object.entries(endpointCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  const maxEpCount = topEndpoints.length > 0 ? topEndpoints[0][1].count : 1;

  const statusDist = { '2xx': 0, '4xx': 0, '5xx': 0 };
  today.forEach(l => { if (l.status_code < 300) statusDist['2xx']++; else if (l.status_code < 500) statusDist['4xx']++; else statusDist['5xx']++; });
  const totalStatus = statusDist['2xx'] + statusDist['4xx'] + statusDist['5xx'] || 1;

  const responseTimeline = today.slice(-50).map(l => l.response_time_ms || 0);
  const maxResp = Math.max(...responseTimeline, 1);

  const recentErrors = today.filter(l => l.status_code >= 400).slice(-5);
  const recentActivity = today.slice(-5).reverse();

  return {
    loading,
    requestsToday, todayPct,
    avgResponse, respDiff,
    successRate, rateDiff,
    bandwidth,
    hourlyBuckets,
    topEndpoints, maxEpCount,
    statusDist, totalStatus,
    responseTimeline, maxResp,
    recentErrors, recentActivity,
  };
}

const SvgAreaSparkline: React.FC<{ data: number[]; color: string; height?: number; gradient?: boolean }> = ({ data, color, height = 32, gradient }) => {
  const w = data.length * 6;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${i * 6 + 3},${height - (v / max) * (height - 4) - 2}`).join(' ');
  const base = `M3,${height - 2}L${pts}L${data.length * 6 + 3},${height - 2}Z`;
  return (
    <svg width={data.length * 6 + 6} height={height} className="w-full">
      {gradient && <defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25" /><stop offset="100%" stopColor={color} stopOpacity="0.02" /></linearGradient></defs>}
      <path d={base} fill={gradient ? 'url(#areaFill)' : `${color}15`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const DonutChart: React.FC<{ segments: { label: string; value: number; color: string }[]; size?: number }> = ({ segments, size = 80 }) => {
  const total = segments.reduce((s, s_) => s + s_.value, 0) || 1;
  const r = 30;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" className="flex-shrink-0">
      <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
      {segments.filter(s => s.value > 0).map((seg, i) => {
        const len = (seg.value / total) * c;
        const dash = `${len} ${c - len}`;
        const o = offset;
        offset -= len;
        return <circle key={i} cx="40" cy="40" r={r} fill="none" stroke={seg.color} strokeWidth="6" strokeDasharray={dash} strokeDashoffset={o} transform="rotate(-90 40 40)" strokeLinecap="round" />;
      })}
    </svg>
  );
};

const ApiUsageChart: React.FC = () => {
  const {
    loading, requestsToday, todayPct, avgResponse, respDiff, successRate, rateDiff,
    hourlyBuckets, topEndpoints, maxEpCount, statusDist, totalStatus,
    responseTimeline, maxResp, recentErrors, recentActivity,
  } = useApiLogs();

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/80 p-6 space-y-3">
        <div className="flex items-center justify-center h-40 text-[12px] text-muted-foreground/50">Loading usage data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { label: 'Requests Today', value: requestsToday.toLocaleString(), sub: `${todayPct >= 0 ? '+' : ''}${todayPct}% vs yesterday`, icon: Activity, valColor: '' },
          { label: 'Avg Response', value: `${avgResponse}ms`, sub: `${respDiff >= 0 ? '+' : ''}${respDiff}ms vs yesterday`, icon: Clock, valColor: respDiff > 10 ? 'text-red-400' : 'text-emerald-400' },
          { label: 'Success Rate', value: `${successRate}%`, sub: `${rateDiff >= 0 ? '+' : ''}${rateDiff}% vs yesterday`, icon: TrendingUp, valColor: successRate < 90 ? 'text-red-400' : successRate < 99 ? 'text-amber-400' : '' },
          { label: 'Active Endpoints', value: String(topEndpoints.length), sub: 'Most used today', icon: Database, valColor: '' },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-border/40 bg-gradient-to-br from-muted/20 to-muted/10 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-[0.08em] font-medium">{item.label}</span>
              <item.icon className="w-3 h-3 text-muted-foreground/30" />
            </div>
            <div className={cn("text-xl font-semibold tabular-nums tracking-tight", item.valColor)}>{item.value}</div>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Hourly volume — area chart */}
        <div className="lg:col-span-3 rounded-2xl border border-border/50 bg-card/80 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium">Hourly Requests</p>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary/60" /><span className="text-[9px] text-muted-foreground/50">Success</span></span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400/60" /><span className="text-[9px] text-muted-foreground/50">Errors</span></span>
            </div>
          </div>
          <div className="relative h-36">
            {/* Grid lines */}
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="absolute left-0 right-0 border-t border-border/10" style={{ bottom: `${i * 25}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-px">
              {hourlyBuckets.map((h, i) => {
                const maxH = Math.max(...hourlyBuckets.map(x => x.requests), 1);
                const totalH = h.requests || 0;
                const errH = h.err || 0;
                const okH = h.ok || 0;
                const pct = totalH / maxH;
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end h-full group relative">
                    <div className="relative w-full" style={{ height: `${pct * 100}%` }}>
                      {errH > 0 && <div className="absolute bottom-0 w-full bg-red-400/60 rounded-t" style={{ height: `${(errH / totalH) * 100}%` }} />}
                      {okH > 0 && <div className="absolute bottom-0 w-full bg-primary/60 rounded-t" style={{ height: `${(okH / totalH) * 100}%` }} />}
                    </div>
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-popover/90 backdrop-blur px-1.5 py-0.5 rounded text-[9px] text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-sm border border-border/30">
                      {h.hour} — {totalH} req{h.requests !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground/40 pt-0.5">
            {[0, 6, 12, 18, 23].map(h => <span key={h}>{h.toString().padStart(2, '0')}:00</span>)}
          </div>
        </div>

        {/* Status distribution + Top endpoints */}
        <div className="lg:col-span-2 space-y-3">
          {/* Donut — status distribution */}
          <div className="rounded-2xl border border-border/50 bg-card/80 p-3 space-y-2">
            <p className="text-[13px] font-medium">Status Distribution</p>
            <div className="flex items-center gap-3">
              <DonutChart segments={[
                { label: '2xx', value: statusDist['2xx'], color: 'hsl(var(--primary) / 0.7)' },
                { label: '4xx', value: statusDist['4xx'], color: '#f59e0b' },
                { label: '5xx', value: statusDist['5xx'], color: '#ef4444' },
              ]} />
              <div className="flex-1 space-y-1.5">
                {[
                  { label: '2xx Success', value: statusDist['2xx'], pct: Math.round((statusDist['2xx'] / totalStatus) * 100), color: 'bg-primary/60' },
                  { label: '4xx Client Error', value: statusDist['4xx'], pct: Math.round((statusDist['4xx'] / totalStatus) * 100), color: 'bg-amber-400/60' },
                  { label: '5xx Server Error', value: statusDist['5xx'], pct: Math.round((statusDist['5xx'] / totalStatus) * 100), color: 'bg-red-400/60' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", s.color)} style={{ width: `${s.pct}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground/50 w-12 text-right tabular-nums">{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top endpoints */}
          <div className="rounded-2xl border border-border/50 bg-card/80 p-3 space-y-2">
            <p className="text-[13px] font-medium">Top Endpoints</p>
            <div className="space-y-1.5">
              {topEndpoints.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/50 text-center py-2">No requests today</p>
              ) : topEndpoints.map(([ep, data], i) => (
                <div key={ep} className="space-y-0.5 group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[9px] text-muted-foreground/30 w-3 text-right tabular-nums">{i + 1}</span>
                      <code className="text-[11px] font-mono text-muted-foreground/80 truncate">{ep}</code>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground/50 tabular-nums">{data.count}</span>
                      {data.errors > 0 && <span className="text-[9px] text-red-400/60">{data.errors} err</span>}
                    </div>
                  </div>
                  <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary/50 to-primary/30" style={{ width: `${(data.count / maxEpCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Response time sparkline + Recent errors */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3 rounded-2xl border border-border/50 bg-card/80 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium">Response Time (last 50)</p>
            <span className="text-[10px] text-muted-foreground/50">Avg: <span className="tabular-nums text-foreground/70 font-medium">{avgResponse}ms</span></span>
          </div>
          <div className="h-10">
            {responseTimeline.length > 1 ? (
              <svg width="100%" height="40" viewBox={`0 0 ${responseTimeline.length * 8 + 10} 40`} preserveAspectRatio="none" className="w-full h-full">
                <defs>
                  <linearGradient id="respGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={`M5,35L${responseTimeline.map((v, i) => `${i * 8 + 5},${35 - (v / maxResp) * 30}`).join('L')}L${responseTimeline.length * 8 + 5},35Z`} fill="url(#respGrad)" />
                <polyline points={responseTimeline.map((v, i) => `${i * 8 + 5},${35 - (v / maxResp) * 30}`).join(' ')} fill="none" stroke="hsl(var(--primary) / 0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="5" y1="35" x2={responseTimeline.length * 8 + 5} y2="35" stroke="hsl(var(--border))" strokeWidth="0.5" />
              </svg>
            ) : (
              <div className="flex items-center justify-center h-full text-[11px] text-muted-foreground/40">Not enough data</div>
            )}
          </div>
        </div>

        {/* Recent errors */}
        <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card/80 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-400/60" />
            <p className="text-[13px] font-medium">Recent Errors</p>
            {recentErrors.length > 0 && <span className="text-[9px] text-red-400/50 ml-auto">{recentErrors.length} today</span>}
          </div>
          <div className="h-px bg-border/40" />
          {recentErrors.length === 0 ? (
            <div className="flex items-center gap-2 py-3 text-[11px] text-muted-foreground/40">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60" />
              No errors in the last 24h
            </div>
          ) : (
            <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
              {recentErrors.map((l, i) => (
                <div key={i} className="flex items-center gap-2 px-1.5 h-6 rounded hover:bg-accent/20 transition-colors">
                  <span className="text-[9px] font-mono text-red-400/60 w-7">{l.status_code}</span>
                  <code className="text-[10px] font-mono text-muted-foreground/60 truncate flex-1">{l.endpoint}</code>
                  <span className="text-[8px] text-muted-foreground/40">{new Date(l.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiUsageChart;