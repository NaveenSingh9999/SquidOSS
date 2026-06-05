import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Shield, Key, AlertTriangle, Lock, CheckCircle } from '@/lib/icon-map'

const API_URL = (() => {
  if (import.meta.env.VITE_SQUIDOSS_API_URL) return import.meta.env.VITE_SQUIDOSS_API_URL
  if (typeof window !== 'undefined' && window.location.hostname.includes('app.github.dev'))
    return window.location.origin.replace(':8080', ':3000').replace(/-8080\./, '-3000.')
  return 'http://localhost:3000'
})().replace(/\/+$/, '')

export default function AdminAuth() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [cbisKey, setCbisKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSudo, setIsSudo] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/auth'); return }
    checkSudoStatus()
  }, [user])

  const checkSudoStatus = async () => {
    try {
      const token = localStorage.getItem('squidoss_token')
      const res = await fetch(`${API_URL}/api/v1/cbis/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setIsSudo(data.isSudo)
    } catch {}
  }

  // If already logged in as sudo with verified session, go straight to admin dash
  const adminSession = localStorage.getItem('admin_session_verified')
  if (adminSession && isSudo) {
    const elapsed = Date.now() - parseInt(adminSession)
    if (elapsed < 3600000) {
      navigate('/admin/dashboard')
    }
  }

  const handleVerify = async () => {
    if (!cbisKey.trim()) { setError('Enter your CBIS private key'); return }
    setLoading(true)
    setError('')

    try {
      const token = localStorage.getItem('squidoss_token')
      const res = await fetch(`${API_URL}/api/v1/cbis/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cbisKey: cbisKey.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Verification failed')
      localStorage.setItem('admin_session_verified', Date.now().toString())
      navigate('/admin/dashboard')
    } catch (e: any) {
      setError(e.message || 'Invalid CBIS key')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-4"
      style={{ background: 'hsl(222 47% 9.5%)' }}>
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, hsl(0 100% 50%) 0%, transparent 50%)' }} />

      <div className="relative w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-red-500/10 flex items-center justify-center ring-1 ring-amber-500/20">
            <Shield className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold">Admin Access</h1>
          <p className="text-muted-foreground text-sm">
            {isSudo
              ? 'Authenticate with your CBIS key to access the admin panel.'
              : 'Your account does not have sudo privileges.'}
          </p>
        </div>

        {isSudo ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-card/50 backdrop-blur-sm border border-border/40 p-5 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-3 h-3" /> CBIS Private Key
                </Label>
                <Input
                  type="password"
                  value={cbisKey}
                  onChange={e => setCbisKey(e.target.value)}
                  placeholder="cbis_sec_..."
                  className="h-10 rounded-lg font-mono text-xs"
                  onKeyDown={e => e.key === 'Enter' && handleVerify()}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {error}
                </div>
              )}

              <Button className="w-full rounded-xl h-10 gap-2"
                disabled={loading || !cbisKey.trim()}
                onClick={handleVerify}>
                {loading ? 'Verifying...' : 'Unlock Admin Panel'}
                {!loading && <Lock className="w-4 h-4" />}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground/60 text-center">
              Generate a CBIS key in Account Settings → Security.
            </p>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-4">
              <p className="text-sm text-amber-400/80">Only sudo accounts can access the admin panel.</p>
              <p className="text-xs text-muted-foreground/60 mt-2">
                The first account registered during setup is automatically the sudo user.
              </p>
            </div>
            <Button variant="outline" className="rounded-xl" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
