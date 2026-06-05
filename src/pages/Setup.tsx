import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { ArrowRight, Shield, Server, Key, User, Check, Sparkles } from '@/lib/icon-map'

const API_URL = (() => {
  if (import.meta.env.VITE_SQUIDOSS_API_URL) return import.meta.env.VITE_SQUIDOSS_API_URL
  if (typeof window !== 'undefined' && window.location.hostname.includes('app.github.dev'))
    return window.location.origin.replace(':8080', ':3000').replace(/-8080\./, '-3000.')
  return 'http://localhost:3000'
})().replace(/\/+$/, '')

type Step = 'welcome' | 'sudo' | 'naming' | 'deploy'

export default function Setup() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [loading, setLoading] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [serverName, setServerName] = useState('')

  const steps = ['welcome', 'sudo', 'naming']
  const stepIndex = steps.indexOf(step)

  const canDeploy = email && password.length >= 8 && serverName

  const handleDeploy = async () => {
    setLoading(true)
    try {
      const regRes = await fetch(`${API_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName: name || 'Sudo' }),
      })
      const regData = await regRes.json()
      if (!regData.token) throw new Error(regData.error || 'Registration failed')
      localStorage.setItem('squidoss_token', regData.token)
      localStorage.setItem('squidoss_is_sudo', 'true')

      await fetch(`${API_URL}/auth/setup-complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regData.token}` },
        body: JSON.stringify({ name: serverName }),
      })
    } catch (e: any) {
      console.error('Setup error:', e)
    }
    setLoading(false)
    setTimeout(() => navigate('/auth'), 1500)
  }

  if (step === 'deploy') {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
        style={{ background: 'hsl(222 47% 9.5%)' }}>
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, hsl(180 100% 50%) 0%, transparent 50%)' }} />
        <div className="relative text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full border-2 border-primary/30 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-primary animate-pulse" />
          </div>
          <h2 className="text-2xl font-light tracking-wider text-primary/80 animate-pulse">Deploying your cloud...</h2>
          <p className="text-muted-foreground text-sm">Setting up database, accounts & encryption</p>
          {!loading && <Button onClick={() => navigate('/auth')}>Continue</Button>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-4"
      style={{ background: 'hsl(222 47% 9.5%)' }}>
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: 'radial-gradient(circle at 75% 25%, hsl(180 100% 50%) 0%, transparent 60%), radial-gradient(circle at 25% 80%, hsl(220 100% 60%) 0%, transparent 50%)' }} />

      <div className="relative w-full max-w-md space-y-8">
        {/* Step dots */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === stepIndex ? 'w-8 bg-primary' : i < stepIndex ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-muted'
              }`} />
          ))}
        </div>

        {step === 'welcome' && (
          <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                SquidOSS
              </h1>
              <p className="text-muted-foreground text-lg">Your private cloud. Your rules.</p>
              <p className="text-muted-foreground/60 text-sm max-w-xs mx-auto">
                Deploy your own storage server in under a minute. No subscriptions, no data leaks.
              </p>
            </div>
            <Button size="lg" onClick={() => setStep('sudo')} className="gap-2 rounded-xl px-8">
              Deploy Now <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {step === 'sudo' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center ring-1 ring-amber-500/20">
                <Key className="w-6 h-6 text-amber-400" />
              </div>
              <h2 className="text-xl font-semibold">Create Sudo Account</h2>
              <p className="text-muted-foreground text-sm">
                This will be the super-admin account. You'll use it to manage users, set limits, and generate CBIS keys.
              </p>
            </div>

            <Card className="p-5 space-y-4 border-border/40 bg-card/50 backdrop-blur-sm">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Full Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Sudo Admin" className="h-10 rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@squidoss.local" className="h-10 rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters" className="h-10 rounded-lg" />
                {password && password.length > 0 && password.length < 8 && (
                  <p className="text-xs text-amber-400">Too short — need 8+ characters</p>
                )}
              </div>
            </Card>

            <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-4 space-y-2">
              <p className="text-xs font-medium text-amber-400/80 flex items-center gap-2">
                <Shield className="w-3 h-3" /> This account gets sudo role
              </p>
              <p className="text-xs text-muted-foreground/60">
                First user is automatically the super-admin. You can generate CBIS keys later for API-level admin access.
              </p>
            </div>

            <Button className="w-full rounded-xl h-11 gap-2"
              disabled={!email || password.length < 8}
              onClick={() => setStep('naming')}>
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {step === 'naming' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20">
                <Server className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Name Your Server</h2>
              <p className="text-muted-foreground text-sm">Give your SquidOSS instance a recognizable name.</p>
            </div>

            <Card className="p-5 space-y-4 border-border/40 bg-card/50 backdrop-blur-sm">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Server Name</Label>
                <Input value={serverName} onChange={e => setServerName(e.target.value)}
                  placeholder="e.g. My Cloud, DataBox, Home Server"
                  className="h-10 rounded-lg text-center text-lg" />
              </div>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setStep('sudo')}>
                Back
              </Button>
              <Button className="flex-1 rounded-xl h-11 gap-2"
                disabled={!canDeploy || loading}
                onClick={() => { setStep('deploy'); handleDeploy() }}>
                {loading ? 'Deploying...' : 'Deploy'}
                {!loading && <Check className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
