import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Shield, Key, AlertTriangle, Lock } from '@/lib/icon-map'

import { API_URL } from '@/lib/api-url'

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
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <Shield className="mx-auto w-8 h-8 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Admin Access</h1>
          <p className="text-muted-foreground text-sm">
            {isSudo
              ? 'Enter your CBIS key to access the admin panel.'
              : 'Your account does not have admin privileges.'}
          </p>
        </div>

        {isSudo ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/20 bg-card/30 p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">CBIS Private Key</Label>
                <Input
                  type="password"
                  value={cbisKey}
                  onChange={e => setCbisKey(e.target.value)}
                  placeholder="cbis_sec_..."
                  className="font-mono text-xs"
                  onKeyDown={e => e.key === 'Enter' && handleVerify()}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded px-3 py-2">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {error}
                </div>
              )}

              <Button className="w-full gap-2"
                disabled={loading || !cbisKey.trim()}
                onClick={handleVerify}>
                {loading ? 'Verifying...' : 'Unlock Admin Panel'}
                {!loading && <Lock className="w-4 h-4" />}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Generate a CBIS key in Account Settings → Security.
            </p>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Only the first registered user (sudo) can access the admin panel.
            </p>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
