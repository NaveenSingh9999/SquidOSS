import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Key, Shield, LogOut, Check, Copy,
  AlertTriangle, X, Server, Database,
} from '@/lib/icon-map'

const API_URL = (() => {
  if (import.meta.env.VITE_SQUIDOSS_API_URL) return import.meta.env.VITE_SQUIDOSS_API_URL
  if (typeof window !== 'undefined' && window.location.hostname.includes('app.github.dev'))
    return window.location.origin.replace(':8080', ':3000').replace(/-8080\./, '-3000.')
  return 'http://localhost:3000'
})().replace(/\/+$/, '')

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

  const token = () => localStorage.getItem('squidoss_token')
  const h = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) })

  useEffect(() => {
    fetchCbisStatus()
    fetchCbisKeys()
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
      const res = await fetch(`${API_URL}/api/v1/cbis/generate`, { method: 'POST', headers: h() })
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

        {/* Storage link */}
        <Card className="border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border/20 flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Storage</span>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Storage Providers</p>
                <p className="text-xs text-muted-foreground">GitHub, R2, S3 backends</p>
              </div>
              <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5 rounded-lg" onClick={() => navigate('/settings/providers')}>
                <Server className="w-3 h-3" /> Manage
              </Button>
            </div>
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
