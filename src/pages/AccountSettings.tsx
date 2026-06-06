import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'
import StorageDeviceWizard from '@/components/StorageDeviceWizard'
import {
  ArrowLeft, User, Key, Shield, LogOut, Check, Copy,
  AlertTriangle, X, Server, Database, HardDrive, Folder,
  Power, PowerOff, Settings2, Trash2, ExternalLink, RefreshCw,
} from '@/lib/icon-map'
import { API_URL } from '@/lib/api-url'

export default function AccountSettings() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user, signOut } = useAuth()

  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [isSudo, setIsSudo] = useState(false)
  const [cbisKeys, setCbisKeys] = useState<any[]>([])
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [localDisk, setLocalDisk] = useState<{
    enabled: boolean; path: string; partitionSize: number;
    chunkCount: number; totalBytes: number
  } | null>(null)
  const [providers, setProviders] = useState<any[]>([])
  const [showLocalForm, setShowLocalForm] = useState(false)
  const [localForm, setLocalForm] = useState({ path: './data/chunks', partitionSize: '0' })
  const [localSaving, setLocalSaving] = useState(false)

  const token = () => localStorage.getItem('squidoss_token')
  const h = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) })

  const fetchLocalDiskStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/res54-local/status`, { headers: h() })
      const data = await res.json()
      if (data.success) {
        setLocalDisk({
          enabled: data.enabled,
          path: data.path || './data/chunks',
          partitionSize: data.partitionSize || 0,
          chunkCount: data.chunkCount || 0,
          totalBytes: data.totalBytes || 0,
        })
      }
    } catch {}
  }

  const fetchProviders = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/providers`, { headers: h() })
      const data = await res.json()
      setProviders(data?.providers || [])
    } catch {}
  }

  const toggleLocalDisk = async () => {
    if (!localDisk) return
    const newState = !localDisk.enabled
    try {
      const res = await fetch(`${API_URL}/api/v1/res54-local/${newState ? 'enable' : 'disable'}`, {
        method: 'POST', headers: h(),
      })
      if (res.ok) {
        setLocalDisk(prev => prev ? { ...prev, enabled: newState } : prev)
        toast({ title: newState ? 'Local disk enabled' : 'Local disk disabled' })
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error, variant: 'destructive' })
      }
    } catch {}
  }

  const saveLocalConfig = async () => {
    setLocalSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/providers/local`, {
        method: 'POST', headers: h(),
        body: JSON.stringify({
          path: localForm.path,
          partitionSize: parseInt(localForm.partitionSize) || 0,
        }),
      })
      if (res.ok) {
        toast({ title: 'Local disk configured' })
        setShowLocalForm(false)
        fetchLocalDiskStatus()
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error, variant: 'destructive' })
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
    setLocalSaving(false)
  }

  const wipeLocalChunks = async () => {
    if (!confirm('Delete all local chunks? This cannot be undone.')) return
    try {
      const res = await fetch(`${API_URL}/api/v1/res54-local/chunks`, { method: 'DELETE', headers: h() })
      if (res.ok) {
        const data = await res.json()
        toast({ title: `Deleted ${data.deletedCount} chunks` })
        fetchLocalDiskStatus()
      }
    } catch {}
  }

  const removeProvider = async (id: string) => {
    if (!confirm('Remove this provider?')) return
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/providers/${id}`, { method: 'DELETE', headers: h() })
      if (res.ok) {
        setProviders(prev => prev.filter(p => p.id !== id))
        toast({ title: 'Provider removed' })
      }
    } catch {}
  }

  const setDefaultProvider = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/providers/${id}/default`, { method: 'PATCH', headers: h() })
      if (res.ok) {
        toast({ title: 'Default provider updated' })
        fetchProviders()
      }
    } catch {}
  }

  useEffect(() => {
    fetchCbisStatus()
    fetchCbisKeys()
    fetchLocalDiskStatus()
    fetchProviders()
  }, [])

  const fetchCbisStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cbis/status`, { headers: h() })
      const data = await res.json()
      setIsSudo(data.isSudo)
    } catch {}
  }

  const fetchCbisKeys = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cbis/keys`, { headers: h() })
      const data = await res.json()
      if (data.success) setCbisKeys(data.keys)
    } catch {}
  }

  const handleSaveProfile = async () => {
    if (!fullName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/rpc/update_profile`, {
        method: 'POST', headers: h(),
        body: JSON.stringify({ full_name: fullName.trim() }),
      })
      toast({ title: res.ok ? 'Profile updated' : 'Failed', variant: res.ok ? 'default' : 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
    setSaving(false)
  }

  const handleChangePassword = async () => {
    const current = prompt('Current password:')
    if (!current) return
    const newPass = prompt('New password (min 8 chars):')
    if (!newPass || newPass.length < 8) { toast({ title: 'Password must be 8+', variant: 'destructive' }); return }
    try {
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST', headers: h(),
        body: JSON.stringify({ currentPassword: current, newPassword: newPass }),
      })
      toast({ title: res.ok ? 'Password changed' : 'Failed', variant: res.ok ? 'default' : 'destructive' })
    } catch { toast({ title: 'Error', variant: 'destructive' }) }
  }

  const handleGenerateCbis = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cbis/generate`, { method: 'POST', headers: h(), body: '{}' })
      const data = await res.json()
      if (data.success) {
        setGeneratedKey(data.privateKey)
        fetchCbisKeys()
        toast({ title: 'CBIS key generated' })
      } else { toast({ title: data.error, variant: 'destructive' }) }
    } catch { toast({ title: 'Error', variant: 'destructive' }) }
  }

  const handleRevokeKey = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cbis/keys/${id}`, { method: 'DELETE', headers: h() })
      if (res.ok) { fetchCbisKeys(); toast({ title: 'Key revoked' }) }
    } catch {}
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const copyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/30 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 h-12 px-4 max-w-3xl mx-auto">
          <button onClick={() => navigate(-1)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-semibold">Account Settings</h1>
          {isSudo && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 ml-auto">sudo</span>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 lg:p-6 space-y-4">
        {/* Profile */}
        <Card className="border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border/20 flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Profile</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-accent/20">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-semibold text-primary ring-1 ring-primary/20">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <p className="text-sm font-medium">{user?.email?.split('@')[0]}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Full Name</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)}
                className="h-9 text-sm mt-1.5 rounded-lg" placeholder="Your name" />
            </div>
            <Button size="sm" className="text-xs h-8 rounded-lg" onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </Card>

        {/* Security */}
        <Card className="border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border/20 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Security</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-accent/20">
              <div>
                <p className="text-sm">Password</p>
                <p className="text-xs text-muted-foreground">Change your login password</p>
              </div>
              <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5 rounded-lg" onClick={handleChangePassword}>
                <Key className="w-3 h-3" /> Change
              </Button>
            </div>
          </div>
        </Card>

        {/* CBIS Keys (sudo only) */}
        {isSudo && (
          <Card className="border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border/20 flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold">CBIS Keys</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 ml-auto">sudo</span>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                CBIS keys authenticate admin-level API operations. Max 5 keys per account. Treat private keys like passwords.
              </p>

              {generatedKey && (
                <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <p className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> New Key Generated
                    </p>
                    <button onClick={() => setGeneratedKey(null)}>
                      <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Copy it now. You won't see it again:</p>
                  <div className="relative">
                    <div className="bg-background rounded-lg p-3 pr-10 font-mono text-xs break-all select-all border border-border/40">
                      {generatedKey}
                    </div>
                    <button onClick={copyKey}
                      className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground">
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              <Button size="sm" className="text-xs h-8 rounded-lg gap-1.5"
                onClick={handleGenerateCbis} disabled={cbisKeys.length >= 5}>
                <Key className="w-3 h-3" /> Generate New CBIS Key
              </Button>

              {cbisKeys.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-muted-foreground font-medium">Active keys ({cbisKeys.length}/5)</p>
                  {cbisKeys.map(k => (
                    <div key={k.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/20">
                      <div>
                        <p className="text-xs font-mono">{k.public_key}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(k.created_at).toLocaleDateString()}
                          {k.last_used_at ? ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}` : ' · Never used'}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs h-7 text-red-400 hover:bg-red-500/10" onClick={() => handleRevokeKey(k.id)}>
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Storage */}
        <Card className="border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border/20 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Local Storage</span>
            <span className="text-[9px] text-muted-foreground ml-auto">Auto-detected devices</span>
          </div>
          <div className="p-5">
            <StorageDeviceWizard onConfigured={() => {}} compact />
          </div>
        </Card>

        {/* Sign Out */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5 text-red-400 hover:bg-red-500/10 border-red-500/20 rounded-lg"
            onClick={signOut}>
            <LogOut className="w-3 h-3" /> Sign Out
          </Button>
          {isSudo && (
            <Button variant="ghost" size="sm" className="text-xs h-8 gap-1.5 rounded-lg text-amber-400"
              onClick={() => navigate('/admin/dashboard')}>
              <Shield className="w-3 h-3" /> Admin Panel
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
