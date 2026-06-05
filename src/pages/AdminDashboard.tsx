import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import {
  Users, HardDrive, Key, Shield, BarChart3,
  ArrowLeft, RefreshCw, X, Check, Server,
  Activity, StopCircle, Plus, Trash2, LogOut,
  Database, AlertTriangle, Terminal, Eye,
  UserCheck, Copy, Download, Search,
} from '@/lib/icon-map'

import { API_URL } from '@/lib/api-url'

type TabId = 'overview' | 'users' | 'database' | 'kza' | 'auth' | 'edge' | 'fls' | 'supervision'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [tab, setTab] = useState<TabId>('overview')
  const [stats, setStats] = useState<any>({})
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cbisKeys, setCbisKeys] = useState<any[]>([])
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)

  const [incidents, setIncidents] = useState<any[]>([])
  const [threats, setThreats] = useState<any[]>([])
  const [bans, setBans] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [channels, setChannels] = useState<any[]>([])
  const [functions, setFunctions] = useState<any[]>([])
  const [dbInstances, setDbInstances] = useState<any[]>([])

  const [hiddenPort, setHiddenPort] = useState<number>(0)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [userRoleInput, setUserRoleInput] = useState('')
  const [sqlQuery, setSqlQuery] = useState('')
  const [sqlResult, setSqlResult] = useState('')
  const [sqlInstanceId, setSqlInstanceId] = useState('')
  const [spawnName, setSpawnName] = useState('')
  const [spawning, setSpawning] = useState(false)
  const [hiddenToken, setHiddenToken] = useState('')

  const token = () => localStorage.getItem('squidoss_token')
  const h = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) })
  const authHeader = () => token() ? { Authorization: `Bearer ${token()}` } : {}

  useEffect(() => {
    const session = localStorage.getItem('admin_session_verified')
    if (!session || Date.now() - parseInt(session) > 3600000) {
      navigate('/admin/auth')
      return
    }
    fetchAll()
    fetchHiddenPort()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([
      fetchStats(), fetchUsers(), fetchKeys(),
      fetchIncidents(), fetchThreats(), fetchBans(),
      fetchSessions(), fetchChannels(), fetchFunctions(),
      fetchDbInstances(),
    ])
    setLoading(false)
  }

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/stats`, { headers: h() })
      const data = await res.json()
      if (data.success) setStats(data.stats)
    } catch {}
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/users`, { headers: h() })
      const data = await res.json()
      if (data.success) setUsers(data.users)
    } catch {}
  }

  const fetchKeys = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cbis/keys`, { headers: h() })
      const data = await res.json()
      if (data.success) setCbisKeys(data.keys)
    } catch {}
  }

  const fetchIncidents = async () => {
    try {
      const r = await fetch(`${API_URL}/api/v1/admin/kza/incidents`, { headers: h() })
      const d = await r.json()
      if (d.success) setIncidents(d.incidents)
    } catch {}
  }

  const fetchThreats = async () => {
    try {
      const r = await fetch(`${API_URL}/api/v1/admin/kza/threats`, { headers: h() })
      const d = await r.json()
      if (d.success) setThreats(d.threats)
    } catch {}
  }

  const fetchBans = async () => {
    try {
      const r = await fetch(`${API_URL}/api/v1/admin/kza/bans`, { headers: h() })
      const d = await r.json()
      if (d.success) setBans(d.bans)
    } catch {}
  }

  const fetchSessions = async () => {
    try {
      const r = await fetch(`${API_URL}/api/v1/admin/sessions`, { headers: h() })
      const d = await r.json()
      if (d.success) setSessions(d.sessions)
    } catch {}
  }

  const fetchChannels = async () => {
    try {
      const r = await fetch(`${API_URL}/api/v1/admin/fls/channels`, { headers: h() })
      const d = await r.json()
      if (d.success) setChannels(d.channels)
    } catch {}
  }

  const fetchFunctions = async () => {
    try {
      const r = await fetch(`${API_URL}/api/v1/admin/edge-functions`, { headers: h() })
      const d = await r.json()
      if (d.success) setFunctions(d.functions)
    } catch {}
  }

  const fetchDbInstances = async () => {
    try {
      const port = await fetchHiddenPort()
      if (!port) return
      const r = await fetch(`http://127.0.0.1:${port}/fstf/ec/${localStorage.getItem('last_cbis_key') || ''}/otdb/api/instances`)
      if (r.ok) { const d = await r.json(); if (d.success) setDbInstances(d.instances) }
    } catch {}
  }

  const fetchHiddenPort = async () => {
    try {
      const r = await fetch(`${API_URL}/api/v1/admin/hidden-port`, { headers: h() })
      const d = await r.json()
      if (d.success) { setHiddenPort(d.port); setHiddenToken(d.token); return d.port }
    } catch {}
    return null
  }

  const generateCbisKey = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cbis/generate`, {
        method: 'POST', headers: h(), body: '{}',
      })
      const d = await r.json()
      if (d.success) {
        toast({ title: `Spawning ${spawnName}...` })
        setSpawnName('')
        setTimeout(fetchDbInstances, 5000)
      } else { toast({ title: d.error || 'Spawn failed', variant: 'destructive' }) }
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }) }
    setSpawning(false)
  }

  const handleExecuteSql = async () => {
    if (!sqlInstanceId || !sqlQuery.trim()) return
    try {
      const cbisKey = localStorage.getItem('last_cbis_key') || ''
      const r = await fetch(`http://127.0.0.1:${hiddenPort}/fstf/ec/${cbisKey}/otdb/api/execute-sql`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: sqlInstanceId, query: sqlQuery }),
      })
      const d = await r.json()
      if (d.success) {
        setSqlResult(JSON.stringify(d.rows || { rowCount: d.rowCount }, null, 2))
      } else { setSqlResult(`Error: ${d.error}`) }
    } catch (e: any) { setSqlResult(`Error: ${e.message}`) }
  }

  const formatBytes = (b: number) => {
    if (b === 0) return '0 B'
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(b) / Math.log(1024))
    return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`
  }

  const TABS: { id: TabId; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'database', label: 'Database', icon: Database },
    { id: 'kza', label: 'KZA Security', icon: Shield },
    { id: 'auth', label: 'Auth', icon: Key },
    { id: 'edge', label: 'Edge Functions', icon: Terminal },
    { id: 'fls', label: 'FLS', icon: Activity },
    { id: 'supervision', label: 'Supervision', icon: Eye },
  ]

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/20 bg-background sticky top-0 z-30">
        <div className="flex items-center justify-between h-12 px-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent/50">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-2">
            {hiddenPort > 0 && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={openHiddenPanel}>
                <Terminal className="w-3 h-3 mr-1" /> FSTF Panel
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => {
              localStorage.removeItem('admin_session_verified')
              navigate('/admin/auth')
            }}>
              <LogOut className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Tab nav */}
        <div className="flex gap-1 p-1 rounded-lg bg-accent/20 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm whitespace-nowrap transition-all ${
                tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* ===== OVERVIEW ===== */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Total Users', value: String(stats.users ?? '—'), icon: Users },
                { label: 'Files Stored', value: String(stats.files ?? '—'), icon: HardDrive },
                { label: 'Storage Used', value: formatBytes(stats.storageBytes ?? 0), icon: Server },
                { label: 'Active Shares', value: String(stats.activeShares ?? '—'), icon: Activity },
                { label: 'Online Now', value: String(stats.activeSessions ?? '—'), icon: UserCheck },
                { label: 'DB SaaS', value: String(stats.dbInstances ?? '—'), icon: Database },
                { label: 'KZA Threats', value: String(threats.length), icon: AlertTriangle },
                { label: 'FLS Channels', value: String(channels.length), icon: Activity },
              ].map(c => (
                <div key={c.label} className="rounded-lg border border-border/20 bg-card/30 p-4 space-y-2">
                  <c.icon className="w-4 h-4 text-muted-foreground" />
                  <p className="text-2xl font-semibold">{c.value}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border/20 bg-card/30 p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-muted-foreground" /> Quick Actions</h3>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setTab('users')}><Users className="w-3.5 h-3.5 mr-1.5" /> Manage Users</Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setTab('database')}><Database className="w-3.5 h-3.5 mr-1.5" /> DB SaaS</Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setTab('kza')}><Shield className="w-3.5 h-3.5 mr-1.5" /> KZA Security</Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setTab('supervision')}><Eye className="w-3.5 h-3.5 mr-1.5" /> Live Supervision</Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={openHiddenPanel}><Terminal className="w-3.5 h-3.5 mr-1.5" /> Hidden Panel</Button>
                <Button variant="outline" size="sm" className="text-xs h-8"
                  onClick={async () => {
                    await fetch(`${API_URL}/api/v1/admin/stop-all`, { method: 'POST', headers: h() })
                    toast({ title: 'All operations stopped' })
                  }}>
                  <StopCircle className="w-3.5 h-3.5 mr-1.5" /> Stop All
                </Button>
              </div>
            </div>

            {hiddenPort > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-xs text-amber-400 flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" />
                  FSTF hidden server active on 127.0.0.1:{hiddenPort} — external nmap invisible
                </p>
              </div>
            )}
          </div>
        )}

        {/* ===== USERS ===== */}
        {tab === 'users' && (
          <div className="rounded-lg border border-border/20 bg-card/30 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /> Users ({users.length})</h3>
              <div className="flex gap-2">
                <Input placeholder="Search..." className="h-8 w-48 text-xs" onChange={e => {
                  const q = e.target.value.toLowerCase()
                  if (!q) { fetchUsers(); return }
                  setUsers(prev => prev.filter((u: any) => u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q)))
                }} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/10 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-medium">Email</th>
                    <th className="text-left px-4 py-2.5 font-medium">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium">Role</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="text-right px-4 py-2.5 font-medium">Storage</th>
                    <th className="text-center px-4 py-2.5 font-medium">Online</th>
                    <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr key={u.id} className="border-b border-border/5 hover:bg-accent/10 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-2.5">{u.full_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          u.role === 'sudo' ? 'bg-accent/30 text-foreground' : 'bg-muted text-muted-foreground'
                        }`}>{u.role}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {u.is_restricted ? <span className="text-xs text-red-400">Restricted</span> : <span className="text-xs text-green-400">Active</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">{formatBytes(u.storage_used || 0)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {u.activeSession ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                            {u.activeSession.current_route?.slice(0, 20) || 'Active'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Offline</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" className="text-xs h-7 px-2"
                            onClick={() => updateUser(u.id, { role: u.role === 'sudo' ? 'user' : 'sudo' })}>
                            Toggle Role
                          </Button>
                          <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-red-400"
                            onClick={() => deleteUser(u.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== DATABASE (DB SaaS) ===== */}
        {tab === 'database' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/20 bg-card/30 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Database className="w-4 h-4 text-muted-foreground" /> DB SaaS Instances</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-xs h-8" onClick={openHiddenPanel}>
                    <Terminal className="w-3.5 h-3.5 mr-1" /> Hidden Panel
                  </Button>
                </div>
              </div>

              {hiddenPort === 0 && (
                <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
                  Hidden server not active. Start the backend with FSTF enabled.
                </div>
              )}

              <div className="flex gap-3">
                <Input placeholder="Instance name" value={spawnName} onChange={e => setSpawnName(e.target.value)}
                  className="h-8 text-xs max-w-xs" />
                <Button size="sm" className="text-xs h-8" onClick={handleSpawn} disabled={spawning || !hiddenPort}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Spawn
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/10 text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                      <th className="text-left px-3 py-2 font-medium">Database</th>
                      <th className="text-right px-3 py-2 font-medium">Port</th>
                      <th className="text-right px-3 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbInstances.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">No instances</td></tr>
                    )}
                    {dbInstances.map((i: any) => (
                      <tr key={i.id} className="border-b border-border/5">
                        <td className="px-3 py-2.5 text-sm">{i.name}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            i.status === 'running' ? 'bg-green-500/10 text-green-400' :
                            i.status === 'booting' ? 'bg-amber-500/10 text-amber-400' :
                            i.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-muted text-muted-foreground'
                          }`}>{i.status}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{i.db_name}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{i.port}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border/20 bg-card/30 p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Terminal className="w-4 h-4 text-muted-foreground" /> SQL Console</h3>
              <div className="flex gap-2">
                <select value={sqlInstanceId} onChange={e => setSqlInstanceId(e.target.value)}
                  className="h-8 text-xs bg-background border border-border/30 rounded px-2 flex-1">
                  <option value="">Select instance...</option>
                  {dbInstances.filter((i: any) => i.status === 'running').map((i: any) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.db_name})</option>
                  ))}
                </select>
                <Button size="sm" className="text-xs h-8" onClick={handleExecuteSql} disabled={!sqlInstanceId || !sqlQuery.trim()}>
                  <Terminal className="w-3.5 h-3.5 mr-1" /> Execute
                </Button>
              </div>
              <textarea value={sqlQuery} onChange={e => setSqlQuery(e.target.value)}
                className="w-full h-24 bg-background border border-border/30 rounded p-2 text-xs font-mono resize-y"
                placeholder="SELECT * FROM pg_tables WHERE schemaname = 'public';" />
              {sqlResult && (
                <pre className="bg-background border border-border/20 rounded p-3 text-xs font-mono overflow-auto max-h-48">{sqlResult}</pre>
              )}
            </div>
          </div>
        )}

        {/* ===== KZA ===== */}
        {tab === 'kza' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/20 bg-card/30 p-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-muted-foreground" /> Incidents ({incidents.length})</h3>
              <div className="space-y-2">
                {incidents.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No incidents</p>}
                {incidents.map((inc: any) => (
                  <div key={inc.id} className="flex items-start justify-between p-3 rounded bg-accent/10">
                    <div className="space-y-1">
                      <p className="text-sm">{inc.incident_title || 'Untitled incident'}</p>
                      <p className="text-xs text-muted-foreground">
                        Tier: {inc.threat_tier || '—'} · Status: {inc.status} · {new Date(inc.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {inc.status !== 'RESOLVED' && (
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => resolveIncident(inc.id)}>
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/20 bg-card/30 p-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-muted-foreground" /> Threat Events ({threats.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/10 text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">User</th>
                      <th className="text-left px-3 py-2 font-medium">Type</th>
                      <th className="text-left px-3 py-2 font-medium">Tier</th>
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-left px-3 py-2 font-medium">Endpoint</th>
                      <th className="text-right px-3 py-2 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {threats.slice(0, 20).map((t: any) => (
                      <tr key={t.id} className="border-b border-border/5">
                        <td className="px-3 py-2 text-xs font-mono">{t.email || t.user_id?.slice(0, 8)}</td>
                        <td className="px-3 py-2 text-xs">{t.threat_type || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            t.threat_tier === 'RED' || t.threat_tier === 'BLACK' ? 'bg-red-500/10 text-red-400' :
                            t.threat_tier === 'ORANGE' ? 'bg-orange-500/10 text-orange-400' :
                            'bg-amber-500/10 text-amber-400'
                          }`}>{t.threat_tier}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{t.description}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t.endpoint_hit || '—'}</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                          {t.created_at ? new Date(t.created_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border/20 bg-card/30 p-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Shield className="w-4 h-4 text-muted-foreground" /> Banned Entities ({bans.length})</h3>
              {bans.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No active bans</p>}
              {bans.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded bg-accent/10 mb-1">
                  <div>
                    <p className="text-xs font-mono">{b.email || b.user_id?.slice(0, 8) || b.ip_address}</p>
                    <p className="text-xs text-muted-foreground">{b.ban_reason || 'No reason'} · {b.ban_type || 'PERMANENT'}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{b.banned_until ? new Date(b.banned_until).toLocaleDateString() : 'Permanent'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== AUTH ===== */}
        {tab === 'auth' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/20 bg-card/30 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Key className="w-4 h-4 text-muted-foreground" /> CBIS Keys</h3>
                <Button size="sm" className="text-xs h-8" onClick={generateCbisKey} disabled={cbisKeys.length >= 5}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Generate Key
                </Button>
              </div>

              {generatedKey && (
                <div className="rounded-lg bg-accent/20 border border-border/20 p-4 mb-4 space-y-2">
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> New CBIS Key — save this now
                  </p>
                  <div className="bg-background/50 rounded p-3 font-mono text-xs break-all select-all">
                    {generatedKey}
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(generatedKey); toast({ title: 'Copied!' }) }}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setGeneratedKey(null)}>Dismiss</Button>
                </div>
              )}

              {cbisKeys.length === 0 && !generatedKey && (
                <p className="text-xs text-muted-foreground text-center py-4">No CBIS keys yet.</p>
              )}

              <div className="space-y-2">
                {cbisKeys.map((k: any) => (
                  <div key={k.id} className="flex items-center justify-between p-3 rounded bg-accent/10">
                    <div>
                      <p className="text-xs font-mono">{k.public_key}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Created {new Date(k.created_at).toLocaleDateString()}
                        {k.last_used_at ? ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}` : ' · Never used'}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground hover:text-foreground" onClick={() => revokeKey(k.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/20 bg-card/30 p-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-muted-foreground" /> OAuth / Auth Providers</h3>
              <p className="text-xs text-muted-foreground">OAuth provider management coming in next release.</p>
            </div>
          </div>
        )}

        {/* ===== EDGE FUNCTIONS ===== */}
        {tab === 'edge' && (
          <div className="rounded-lg border border-border/20 bg-card/30 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Terminal className="w-4 h-4 text-muted-foreground" /> Edge Functions ({functions.length})</h3>
              <Button variant="outline" size="sm" className="text-xs h-8"
                onClick={async () => {
                  const r = await fetch(`${API_URL}/api/v1/admin/edge-functions/sync`, { method: 'POST', headers: h() })
                  const d = await r.json()
                  toast({ title: d.message || 'Synced' })
                }}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Sync
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/10 text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Runtime</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-right px-3 py-2 font-medium">Version</th>
                  <th className="text-right px-3 py-2 font-medium">Timeout</th>
                  <th className="text-right px-3 py-2 font-medium">Memory</th>
                </tr>
              </thead>
              <tbody>
                {functions.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No edge functions deployed. Use the CLI to deploy functions.
                  </td></tr>
                )}
                {functions.map((fn: any) => (
                  <tr key={fn.id} className="border-b border-border/5">
                    <td className="px-3 py-2 font-mono text-xs">{fn.name}</td>
                    <td className="px-3 py-2 text-xs">{fn.runtime}</td>
                    <td className="px-3 py-2"><span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">{fn.status}</span></td>
                    <td className="px-3 py-2 text-right text-xs">{fn.version}</td>
                    <td className="px-3 py-2 text-right text-xs">{fn.timeout_seconds || '—'}s</td>
                    <td className="px-3 py-2 text-right text-xs">{fn.memory_mb || '—'}MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ===== FLS ===== */}
        {tab === 'fls' && (
          <div className="rounded-lg border border-border/20 bg-card/30 p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-muted-foreground" /> FLS Channels ({channels.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/10 text-xs text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">Channel</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-right px-3 py-2 font-medium">Events</th>
                    <th className="text-right px-3 py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">No FLS channels</td></tr>
                  )}
                  {channels.map((ch: any) => (
                    <tr key={ch.id} className="border-b border-border/5">
                      <td className="px-3 py-2 font-mono text-xs">{ch.name}</td>
                      <td className="px-3 py-2"><span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">{ch.status}</span></td>
                      <td className="px-3 py-2 text-right text-xs">{ch.event_count || 0}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{new Date(ch.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== SUPERVISION ===== */}
        {tab === 'supervision' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/20 bg-card/30 p-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Eye className="w-4 h-4 text-muted-foreground" /> Live User Supervision</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Showing users active in the last 30 minutes. KZA monitors all sessions for anomalies.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/10 text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">User</th>
                      <th className="text-left px-3 py-2 font-medium">Role</th>
                      <th className="text-left px-3 py-2 font-medium">Current Route</th>
                      <th className="text-left px-3 py-2 font-medium">IP</th>
                      <th className="text-left px-3 py-2 font-medium">Device</th>
                      <th className="text-right px-3 py-2 font-medium">Last Active</th>
                      <th className="text-center px-3 py-2 font-medium">KZA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">No active sessions</td></tr>
                    )}
                    {sessions.map((s: any) => (
                      <tr key={s.id} className="border-b border-border/5">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                            <span className="text-xs font-mono">{s.email || s.user_id?.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${s.role === 'sudo' ? 'bg-accent/30' : 'bg-muted'}`}>{s.role}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[150px]">{s.current_route || '—'}</td>
                        <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{s.ip_address || '—'}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[150px]">{s.user_agent?.slice(0, 40) || '—'}</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                          {s.last_active_at ? new Date(s.last_active_at).toLocaleTimeString() : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Shield className="w-3.5 h-3.5 text-green-400 inline" title="Under KZA watch" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border/20 bg-card/30 p-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><UserCheck className="w-4 h-4 text-muted-foreground" /> User Presence Map</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {users.filter((u: any) => u.activeSession).slice(0, 8).map((u: any) => (
                  <div key={u.id} className="p-3 rounded bg-accent/10 border border-border/10">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                      <span className="text-xs font-medium">{u.email}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {u.activeSession?.current_route || 'Unknown'} · {u.activeSession?.ip_address || '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      KZA: <Shield className="w-2.5 h-2.5 inline text-green-400" /> Watching
                    </p>
                  </div>
                ))}
                {users.filter((u: any) => u.activeSession).length === 0 && (
                  <p className="col-span-4 text-center text-xs text-muted-foreground py-4">No users currently online</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
