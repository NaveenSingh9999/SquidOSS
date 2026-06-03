import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const API_URL = import.meta.env.VITE_SQUIDOSS_API_URL || 'http://localhost:3000'

export default function Index() {
  const { user, loading } = useAuth()
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await fetch(`${API_URL}/health`)
        const data = await res.json()
        setSetupComplete(data.database === 'connected')
      } catch {
        setSetupComplete(false)
      }
    }
    checkSetup()
  }, [])

  if (loading || setupComplete === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(222 47% 9.5%)' }}>
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Check local storage flag for setup completion
  const hasLocalSetup = localStorage.getItem('squidoss_setup_complete')

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  if (!hasLocalSetup) {
    // Check if any users exist (first boot detection)
    const hasUsers = setupComplete
    if (!hasUsers) {
      return <Navigate to="/setup" replace />
    }
  }

  return <Navigate to="/auth" replace />
}
