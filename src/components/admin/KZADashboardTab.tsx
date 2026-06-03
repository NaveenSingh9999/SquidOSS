import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { AlertTriangle, Eye, Shield, ShieldAlert, ShieldCheck } from '@/lib/icon-map';

type KzaIncident = {
  id?: string;
  threat_tier?: string;
  incident_title?: string;
  attacker_profile?: Record<string, unknown>;
  attack_timeline?: Array<{ timestamp: string; action: string; endpoint: string; result: string }>;
  what_was_targeted?: string;
  potential_harm?: string;
  techniques_used?: string[];
  actions_taken?: string[];
  linked_accounts?: unknown;
  network_intel?: Record<string, unknown>;
  status?: string;
  created_at?: string;
  threat_event_id?: string;
};

type KzaThreatEvent = {
  id: string;
  threat_tier?: string;
  threat_type?: string;
  endpoint_hit?: string;
  ip_address?: string;
  created_at?: string;
  payload_snapshot?: Record<string, any>;
  user_id?: string;
};

type KzaBan = {
  id: string;
  user_id?: string;
  ip_address?: string;
  ban_type?: string;
  ban_reason?: string;
  ban_tier?: string;
  attack_summary?: string;
  banned_until?: string;
  created_at?: string;
  is_active?: boolean;
};

type KzaUserProfile = {
  user_id: string;
  threat_score?: number;
  is_watchlisted?: boolean;
  typical_endpoints?: string[];
  typical_countries?: string[];
  typical_devices?: unknown;
  typical_active_hours?: number[];
};

const tierStyles: Record<string, string> = {
  YELLOW: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30',
  ORANGE: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  RED: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  BLACK: 'bg-neutral-900/80 text-white border-neutral-700',
};

const countryCoordinates: Record<string, [number, number]> = {
  US: [37, -95],
  IN: [21, 78],
  GB: [54, -2],
  DE: [51, 10],
  SG: [1, 103],
  AU: [-25, 133],
  BR: [-14, -51],
  JP: [36, 138],
};

const hashCoordinate = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  const lon = hash - 180;
  const lat = ((hash * 7) % 180) - 90;
  return [lat, lon] as [number, number];
};

const toMapPoint = (event: KzaThreatEvent) => {
  const country = event.payload_snapshot?.country;
  const ip = event.ip_address ?? 'unknown';
  const [lat, lon] = countryCoordinates[country] ?? hashCoordinate(ip);
  return {
    id: event.id,
    lat,
    lon,
    tier: event.threat_tier ?? 'YELLOW',
  };
};

const KZADashboardTab = () => {
  const [incidents, setIncidents] = useState<KzaIncident[]>([]);
  const [threatEvents, setThreatEvents] = useState<KzaThreatEvent[]>([]);
  const [bans, setBans] = useState<KzaBan[]>([]);
  const [watchlist, setWatchlist] = useState<KzaUserProfile[]>([]);
  const [honeypotHits, setHoneypotHits] = useState<number>(0);
  const [selectedIncident, setSelectedIncident] = useState<KzaIncident | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTable = useCallback(async (tableName: string, pageSize = 200) => {
    const { data, error } = await supabase.functions.invoke('admin-data-access', {
      body: { action: 'table_explorer', tableName, page: 1, pageSize },
    });
    if (error) {
      throw error;
    }
    return (data?.rows ?? []) as any[];
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [incidentRows, threatRows, banRows, profileRows, honeypotRows] = await Promise.all([
        fetchTable('kza_admin_incidents', 100),
        fetchTable('kza_threat_events', 300),
        fetchTable('kza_banned_entities', 200),
        fetchTable('kza_user_profiles', 200),
        fetchTable('kza_honeypot_hits', 200),
      ]);

      setIncidents(incidentRows);
      setThreatEvents(threatRows);
      setBans(banRows.filter((ban: KzaBan) => ban.is_active));
      setWatchlist(profileRows.filter((profile: KzaUserProfile) => profile.is_watchlisted));
      setHoneypotHits(honeypotRows.length);
    } catch (error) {
      console.error('Failed to load KZA data', error);
      toast.error('Unable to load KZA data.');
    } finally {
      setLoading(false);
    }
  }, [fetchTable]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('kza-incidents')
      .on('broadcast', { event: 'incident' }, ({ payload }) => {
        setIncidents((prev) => [payload as KzaIncident, ...prev].slice(0, 100));
      })
      .subscribe();

    const interval = window.setInterval(() => {
      loadData();
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [loadData]);

  const stats = useMemo(() => {
    const now = Date.now();
    const last24h = threatEvents.filter((event) => event.created_at && now - new Date(event.created_at).getTime() < 24 * 60 * 60 * 1000);
    const last7d = threatEvents.filter((event) => event.created_at && now - new Date(event.created_at).getTime() < 7 * 24 * 60 * 60 * 1000);
    const last30d = threatEvents.filter((event) => event.created_at && now - new Date(event.created_at).getTime() < 30 * 24 * 60 * 60 * 1000);
    const tiers = threatEvents.reduce<Record<string, number>>((acc, event) => {
      const tier = event.threat_tier ?? 'YELLOW';
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, {});

    const endpointCounts = threatEvents.reduce<Record<string, number>>((acc, event) => {
      if (event.endpoint_hit) {
        acc[event.endpoint_hit] = (acc[event.endpoint_hit] || 0) + 1;
      }
      return acc;
    }, {});

    const topEndpoints = Object.entries(endpointCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const ipCounts = threatEvents.reduce<Record<string, number>>((acc, event) => {
      if (event.ip_address) {
        acc[event.ip_address] = (acc[event.ip_address] || 0) + 1;
      }
      return acc;
    }, {});
    const topIps = Object.entries(ipCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const activeUsers = new Set(
      threatEvents
        .filter((event) => event.created_at && now - new Date(event.created_at).getTime() < 5 * 60 * 1000)
        .map((event) => event.user_id)
        .filter(Boolean)
    );

    return {
      last24h: last24h.length,
      last7d: last7d.length,
      last30d: last30d.length,
      tiers,
      topEndpoints,
      topIps,
      activeUsers: activeUsers.size,
    };
  }, [threatEvents]);

  const mapPoints = useMemo(() => threatEvents.map(toMapPoint), [threatEvents]);

  const handleBanAction = async (action: string, payload: Record<string, unknown>) => {
    const { error } = await supabase.functions.invoke('admin-data-access', {
      body: { action, ...payload },
    });
    if (error) {
      toast.error('Unable to update ban');
    } else {
      toast.success('Ban updated');
      loadData();
    }
  };

  const handleIncidentStatus = async (incidentId: string, status: string) => {
    if (!incidentId) {
      toast.error('Incident not available yet');
      return;
    }
    const { error } = await supabase.functions.invoke('admin-data-access', {
      body: { action: 'kza_update_incident_status', incidentId, status },
    });
    if (error) {
      toast.error('Unable to update incident');
    } else {
      toast.success('Incident updated');
      loadData();
    }
  };

  const pendingCritical = incidents.filter(
    (incident) => incident.status === 'PENDING' && ['RED', 'BLACK'].includes(incident.threat_tier ?? '')
  );

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading KZA telemetry…</div>;
  }

  return (
    <div className="space-y-6">
      {pendingCritical.length > 0 && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="font-semibold">Unacknowledged critical incidents detected</p>
              <p className="text-xs text-red-500/80">
                {pendingCritical.length} RED/BLACK incidents are awaiting action.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Live Incident Feed</CardTitle>
            <CardDescription>Realtime KZA incidents streamed from kza-incidents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {incidents.length === 0 && <p className="text-sm text-muted-foreground">No incidents detected.</p>}
            {incidents.map((incident) => (
              <div key={incident.id ?? incident.threat_event_id} className="rounded-xl border border-border/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <Badge className={tierStyles[incident.threat_tier ?? 'YELLOW']}>
                      {incident.threat_tier ?? 'UNKNOWN'}
                    </Badge>
                    <p className="text-sm font-semibold">{incident.incident_title ?? 'KZA Incident'}</p>
                    <p className="text-xs text-muted-foreground">
                      {incident.network_intel?.ip ?? 'Unknown IP'} • {incident.created_at?.toString() ?? 'Now'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleBanAction('kza_unban', { incident })}>
                      Unban
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleBanAction('kza_extend_ban', { incident })}>
                      Extend Ban
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleBanAction('kza_permanent_ban', { incident })}>
                      Permanent Ban
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleIncidentStatus(incident.id ?? incident.threat_event_id ?? '', 'FALSE_POSITIVE')}>
                      Mark False Positive
                    </Button>
                    <Button size="sm" onClick={() => setSelectedIncident(incident)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Full Report
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Realtime Map</CardTitle>
            <CardDescription>Live request mapping from KZA telemetry.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-border/50 bg-muted/30">
              <svg viewBox="0 0 1000 500" className="absolute inset-0 h-full w-full">
                <rect x="0" y="0" width="1000" height="500" fill="transparent" />
                <rect x="60" y="70" width="200" height="90" rx="16" fill="currentColor" opacity="0.08" />
                <rect x="160" y="200" width="120" height="160" rx="16" fill="currentColor" opacity="0.08" />
                <rect x="420" y="80" width="120" height="70" rx="16" fill="currentColor" opacity="0.08" />
                <rect x="430" y="170" width="150" height="170" rx="16" fill="currentColor" opacity="0.08" />
                <rect x="560" y="70" width="300" height="180" rx="16" fill="currentColor" opacity="0.08" />
                <rect x="760" y="260" width="160" height="90" rx="16" fill="currentColor" opacity="0.08" />
                <rect x="200" y="430" width="600" height="40" rx="16" fill="currentColor" opacity="0.08" />
              </svg>
              {mapPoints.slice(0, 30).map((point) => {
                const x = ((point.lon + 180) / 360) * 100;
                const y = ((90 - point.lat) / 180) * 100;
                return (
                  <div
                    key={point.id}
                    className="absolute h-2.5 w-2.5 rounded-full shadow"
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      background:
                        point.tier === 'BLACK'
                          ? '#111827'
                          : point.tier === 'RED'
                            ? '#ef4444'
                            : point.tier === 'ORANGE'
                              ? '#f97316'
                              : '#facc15',
                    }}
                  />
                );
              })}
              <div className="absolute bottom-3 left-3 rounded-full bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                Active users: {stats.activeUsers}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Threat Statistics</CardTitle>
            <CardDescription>Rolling 24h/7d/30d visibility.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>Threats (24h)</span>
              <Badge variant="outline">{stats.last24h}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Threats (7d)</span>
              <Badge variant="outline">{stats.last7d}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Threats (30d)</span>
              <Badge variant="outline">{stats.last30d}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.tiers).map(([tier, count]) => (
                <Badge key={tier} className={tierStyles[tier] ?? ''}>
                  {tier}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most Attacked Endpoints</CardTitle>
            <CardDescription>Top endpoints and attacker IPs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-medium">Endpoints</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {stats.topEndpoints.map(([endpoint, count]) => (
                  <li key={endpoint} className="flex items-center justify-between">
                    <span className="truncate">{endpoint}</span>
                    <span>{count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">Top IPs</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {stats.topIps.map(([ip, count]) => (
                  <li key={ip} className="flex items-center justify-between">
                    <span>{ip}</span>
                    <span>{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Bans</CardTitle>
            <CardDescription>{bans.length} active bans • {honeypotHits} honeypot hits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {bans.slice(0, 5).map((ban) => (
              <div key={ban.id} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">{ban.ip_address ?? ban.user_id}</p>
                  <p className="text-sm font-medium">{ban.ban_reason ?? 'KZA Ban'}</p>
                </div>
                <Badge className={tierStyles[ban.ban_tier ?? 'RED'] ?? ''}>{ban.ban_tier ?? 'RED'}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Banned Entities Manager</CardTitle>
            <CardDescription>Sort and manage active bans.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bans.map((ban) => (
                  <TableRow key={ban.id}>
                    <TableCell>{ban.user_id ?? ban.ip_address}</TableCell>
                    <TableCell>
                      <Badge className={tierStyles[ban.ban_tier ?? 'RED'] ?? ''}>{ban.ban_tier ?? 'RED'}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ban.attack_summary ?? ban.ban_reason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ban.banned_until ?? 'Permanent'}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => handleBanAction('kza_unban', { banId: ban.id })}>
                        Unban
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Watchlist</CardTitle>
            <CardDescription>Accounts on ORANGE watchlist.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Threat Score</TableHead>
                  <TableHead>Countries</TableHead>
                  <TableHead>Endpoints</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {watchlist.map((profile) => (
                  <TableRow key={profile.user_id}>
                    <TableCell className="font-medium">{profile.user_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{profile.threat_score ?? 0}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(profile.typical_countries ?? []).slice(0, 3).join(', ')}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(profile.typical_endpoints ?? []).slice(0, 2).join(', ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selectedIncident)} onOpenChange={(open) => !open && setSelectedIncident(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Incident Report</DialogTitle>
          </DialogHeader>
          {selectedIncident && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge className={tierStyles[selectedIncident.threat_tier ?? 'YELLOW'] ?? ''}>
                  {selectedIncident.threat_tier}
                </Badge>
                <span className="font-semibold">{selectedIncident.incident_title}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Attacker Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(selectedIncident.attacker_profile, null, 2)}</pre>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Network Intel</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(selectedIncident.network_intel, null, 2)}</pre>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Attack Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  {(selectedIncident.attack_timeline ?? []).map((step, index) => (
                    <div key={`${step.timestamp}-${index}`} className="flex items-start gap-2">
                      <div className="mt-0.5 h-2 w-2 rounded-full bg-primary" />
                      <div>
                        <p className="font-medium text-foreground">{step.action}</p>
                        <p>{step.endpoint} • {step.result}</p>
                        <p>{step.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <div className="grid gap-3 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Targeted</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">{selectedIncident.what_was_targeted}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Potential Harm</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">{selectedIncident.potential_harm}</CardContent>
                </Card>
              </div>
              <div className="flex flex-wrap gap-2">
                {(selectedIncident.techniques_used ?? []).map((technique) => (
                  <Badge key={technique} variant="outline">
                    {technique}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => handleIncidentStatus(selectedIncident.id ?? selectedIncident.threat_event_id ?? '', 'ACKNOWLEDGED')}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Acknowledge
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleIncidentStatus(selectedIncident.id ?? selectedIncident.threat_event_id ?? '', 'RESOLVED')}>
                  <Shield className="mr-2 h-4 w-4" />
                  Resolve
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleIncidentStatus(selectedIncident.id ?? selectedIncident.threat_event_id ?? '', 'FALSE_POSITIVE')}>
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  Mark False Positive
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KZADashboardTab;
