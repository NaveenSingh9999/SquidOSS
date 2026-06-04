import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Mail, Key, Shield, LogOut, Database, Server } from '@/lib/icon-map'

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

  const token = () => localStorage.getItem('squidoss_token')
  const headers = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) })

  const handleSaveProfile = async () => {
    if (!fullName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/rpc/update_profile`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ full_name: fullName.trim() }),
      })
      if (res.ok) toast({ title: 'Profile updated' })
      else { const err = await res.json(); toast({ title: 'Error', description: err.error || 'Failed', variant: 'destructive' }) }
    } catch { toast({ title: 'Error', description: 'Network error', variant: 'destructive' }) }
    setSaving(false)
  }

  const handleChangePassword = async () => {
    const current = prompt('Current password:')
    if (!current) return
    const newPass = prompt('New password (min 8 chars):')
    if (!newPass || newPass.length < 8) { toast({ title: 'Password must be 8+ characters', variant: 'destructive' }); return }
    try {
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ currentPassword: current, newPassword: newPass }),
      })
      if (res.ok) toast({ title: 'Password changed' })
      else { const err = await res.json(); toast({ title: 'Error', description: err.error || 'Failed', variant: 'destructive' }) }
    } catch { toast({ title: 'Error', variant: 'destructive' }) }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/30 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 h-12 px-4 lg:px-6 max-w-3xl mx-auto">
          <button onClick={() => navigate(-1)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-semibold">Account Settings</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 lg:p-6 space-y-4">
        {/* Profile */}
        <Card className="border-border/30">
          <CardHeader className="px-4 py-3 border-b border-border/20">
            <CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4" /> Profile</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4 space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/20">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <p className="text-sm font-medium">{user?.email?.split('@')[0]}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Mail className="w-3 h-3" /> {user?.email}</p>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Full Name</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} className="h-8 text-sm mt-1 rounded-lg" placeholder="Your name" />
            </div>
            <Button size="sm" className="text-xs h-7" onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="border-border/30">
          <CardHeader className="px-4 py-3 border-b border-border/20">
            <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> Security</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <div><p className="text-sm">Password</p><p className="text-xs text-muted-foreground">Change your login password</p></div>
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1.5" onClick={handleChangePassword}>
                <Key className="w-3 h-3" /> Change
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Storage Providers */}
        <Card className="border-border/30">
          <CardHeader className="px-4 py-3 border-b border-border/20">
            <CardTitle className="text-sm flex items-center gap-2"><Database className="w-4 h-4" /> Storage</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm">Providers</p><p className="text-xs text-muted-foreground">Manage GitHub, R2, S3 backends</p></div>
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1.5" onClick={() => navigate('/settings/providers')}>
                <Server className="w-3 h-3" /> Manage
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sign Out */}
        <div className="pt-2">
          <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8 text-destructive hover:bg-destructive/10 border-destructive/30" onClick={signOut}>
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </Button>
        </div>
      </div>
    </div>
  )
}


