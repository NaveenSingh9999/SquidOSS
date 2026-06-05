import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
  Users, HardDrive, Key, Shield, BarChart3,
  ArrowLeft, RefreshCw, X, Check, Server,
  Activity, StopCircle, Plus, Trash2, LogOut,
} from '@/lib/icon-map'

const API_URL = (() => {
  if (import.meta.env.VITE_SQUIDOSS_API_URL) return import.meta.env.VITE_SQUIDOSS_API_URL
  if (typeof window !== 'undefined' && window.location.hostname.includes('app.github.dev'))
    return window.location.origin.replace(':8080', ':3000').replace(/-8080\./, '-3000.')
  return 'http://localhost:3000'
})().replace(/\/+$/, '')

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [tab, setTab] = useState<'overview' | 'users' | 'keys'>('overview')
  const [stats, setStats] = useState<any>({})
  const [users, setUsers] = useState<any[]>([])
  const [cbisKeys, setCbisKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)

  const token = () => localStorage.getItem('squidoss_token')
  const h = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) })

  useEffect(() => {
    const session = localStorage.getItem('admin_session_verified')
    if (!session || Date.now() - parseInt(session) > 3600000) {
      navigate('/admin/auth')
      return
    }
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchStats(), fetchUsers(), fetchKeys()])
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

  const generateCbisKey = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cbis/generate`, {
        method: 'POST', headers: h(),
      })
      const data = await res.json()
      if (data.success) {
        setGeneratedKey(data.privateKey)
        fetchKeys()
        toast({ title: 'CBIS key generated' })
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch { toast({ title: 'Error', variant: 'destructive' }) }
  }

  const revokeKey = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cbis/keys/${id}`, { method: 'DELETE', headers: h() })
      const data = await res.json()
      if (data.success) { fetchKeys(); toast({ title: 'Key revoked' }) }
    } catch {}
  }

  const formatBytes = (b: number) => {
    if (b === 0) return '0 B'
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(b) / Math.log(1024))
    return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/20 bg-background sticky top-0 z-30">
        <div className="flex items-center justify-between h-12 px-4 max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent/50">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-2">
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

      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Nav tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-accent/20 w-fit">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'keys', label: 'CBIS Keys', icon: Key },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id as any)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all ${
                tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Total Users', value: String(stats.users ?? '—'), icon: Users },
                { label: 'Files Stored', value: String(stats.files ?? '—'), icon: HardDrive },
                { label: 'Storage Used', value: formatBytes(stats.storageBytes ?? 0), icon: Server },
                { label: 'Active Shares', value: String(stats.activeShares ?? '—'), icon: Activity },
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
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setTab('users')}>
                  <Users className="w-3.5 h-3.5 mr-1.5" /> Manage Users
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setTab('keys')}>
                  <Key className="w-3.5 h-3.5 mr-1.5" /> CBIS Keys
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8"
                  onClick={async () => {
                    await fetch(`${API_URL}/api/v1/admin/stop-all`, { method: 'POST', headers: h() })
                    toast({ title: 'All operations stopped' })
                  }}>
                  <StopCircle className="w-3.5 h-3.5 mr-1.5" /> Stop All
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={fetchAll}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Users */}
        {tab === 'users' && (
          <div className="rounded-lg border border-border/20 bg-card/30 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /> Users ({users.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/10 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-medium">Email</th>
                    <th className="text-left px-4 py-2.5 font-medium">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium">Role</th>
                    <th className="text-right px-4 py-2.5 font-medium">Storage</th>
                    <th className="text-right px-4 py-2.5 font-medium">Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-border/5 hover:bg-accent/10 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-2.5">{u.full_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          u.role === 'sudo' ? 'bg-accent/30 text-foreground' : 'bg-muted text-muted-foreground'
                        }`}>{u.role}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">{formatBytes(u.storage_used || 0)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {u.is_premium ? <Check className="w-3.5 h-3.5 text-muted-foreground inline" /> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CBIS Keys */}
        {tab === 'keys' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/20 bg-card/30 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Key className="w-4 h-4 text-muted-foreground" /> CBIS Keys</h3>
                <Button size="sm" className="text-xs h-8" onClick={generateCbisKey}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Generate Key
                </Button>
              </div>

              {generatedKey && (
                <div className="rounded-lg bg-accent/20 border border-border/20 p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> New CBIS Key
                    </p>
                    <button onClick={() => setGeneratedKey(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Save this private key — it will never be shown again:</p>
                  <div className="bg-background/50 rounded p-3 font-mono text-xs break-all select-all">
                    {generatedKey}
                  </div>
                </div>
              )}

              {cbisKeys.length === 0 && !generatedKey && (
                <p className="text-xs text-muted-foreground text-center py-6">No CBIS keys yet.</p>
              )}

              {cbisKeys.length > 0 && (
                <div className="space-y-2">
                  {cbisKeys.map(k => (
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
