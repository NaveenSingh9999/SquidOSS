import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Shield, Mail, Lock, KeyRound, Loader2 } from '@/lib/icon-map'
import { useAuth } from '@/contexts/AuthContext'
import { usePasskey } from '@/hooks/usePasskey'
import { useToast } from '@/hooks/use-toast'

export default function Auth() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const { register, authenticate, loading: passkeyLoading } = usePasskey()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [regName, setRegName] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err: any) {
      toast({ title: 'Login failed', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  async function handlePasskeyLogin() {
    if (!email) { toast({ title: 'Email required', description: 'Enter your email first', variant: 'destructive' }); return }
    const result = await authenticate(email)
    if (result) {
      localStorage.setItem('squidoss_token', result.token)
      navigate('/dashboard')
    }
  }

  async function handlePasskeyRegister() {
    const ok = await register(email)
    if (ok) toast({ title: 'Passkey registered', description: 'You can now sign in with your passkey' })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'hsl(222 47% 9.5%)' }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">SquidOSS</h1>
          <p className="text-sm text-muted-foreground">Sign in to your private cloud</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>

          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Sign In
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" style={{ borderColor: 'hsl(220 20% 17%)' }} />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="px-2 text-muted-foreground" style={{ background: 'hsl(222 47% 9.5%)' }}>or</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handlePasskeyLogin}
          disabled={passkeyLoading || !email}
        >
          {passkeyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          Sign in with Passkey
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          First time?{' '}
          <Link to="/setup" className="text-primary hover:underline">
            Set up SquidOSS
          </Link>
        </div>
      </div>
    </div>
  )
}
