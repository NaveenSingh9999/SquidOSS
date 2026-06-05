import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { API_URL } from '@/lib/api-url'

export default function Index() {
  const { user, loading } = useAuth()
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [dbOnline, setDbOnline] = useState(false)

  useEffect(() => {
    async function check() {
      try {
        const token = localStorage.getItem('squidoss_token')
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        const [healthRes, statusRes] = await Promise.all([
          fetch(`${API_URL}/health`, { headers }),
          fetch(`${API_URL}/auth/setup-status`, {
            headers,
            mode: 'cors',
            credentials: 'include',
          }).catch(() => new Response(JSON.stringify({ setupComplete: false }))),
        ])
        const health = await healthRes.json().catch(() => ({ database: 'disconnected' }))
        const status = await statusRes.json().catch(() => ({ setupComplete: false }))
        setDbOnline(health.database === 'connected')
        setSetupComplete(status.setupComplete || !!localStorage.getItem('squidoss_setup_complete'))
      } catch {
        setDbOnline(false)
        setSetupComplete(!!localStorage.getItem('squidoss_setup_complete'))
      }
    }
    check()
  }, [])

  if (loading || setupComplete === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(222 47% 9.5%)' }}>
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  if (!setupComplete) {
    if (!dbOnline) {
      return <Navigate to="/setup" replace />
    }
  }

  return <Navigate to="/auth" replace />
}
