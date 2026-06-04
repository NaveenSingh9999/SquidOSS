import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const API_URL = import.meta.env.VITE_SQUIDOSS_API_URL || 'http://localhost:3000'

export default function Index() {
  const { user, loading } = useAuth()
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [dbOnline, setDbOnline] = useState(false)

  useEffect(() => {
    async function check() {
      try {
        const [healthRes, statusRes] = await Promise.all([
          fetch(`${API_URL}/health`),
          fetch(`${API_URL}/auth/setup-status`).catch(() => ({ json: () => ({ setupComplete: false }) })),
        ])
        const health = await healthRes.json()
        const status = await statusRes.json()
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
