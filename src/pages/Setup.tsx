import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ArrowRight, Shield, Server, Key, User, Check, HardDrive, Users, SlidersHorizontal } from '@/lib/icon-map'

import { API_URL } from '@/lib/api-url'

type Step = 'welcome' | 'sudo' | 'providers' | 'users' | 'features' | 'naming' | 'deploy'

export default function Setup() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [loading, setLoading] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [serverName, setServerName] = useState('')
  const [storageProvider, setStorageProvider] = useState('local')
  const [allowRegistration, setAllowRegistration] = useState(true)
  const [features, setFeatures] = useState({
    fileSharing: true,
    encryption: true,
    versioning: false,
  })

  const steps: Step[] = ['welcome', 'sudo', 'providers', 'users', 'features', 'naming']
  const stepIndex = steps.indexOf(step)

  const canDeploy = email && password.length >= 8 && serverName

  const handleDeploy = async () => {
    setLoading(true)
    try {
      const regRes = await fetch(`${API_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName: name || 'Admin' }),
      })
      const regData = await regRes.json()
      if (!regData.token) throw new Error(regData.error || 'Registration failed')
      localStorage.setItem('squidoss_token', regData.token)

      await fetch(`${API_URL}/auth/setup-complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regData.token}` },
        body: JSON.stringify({ name: serverName, storageProvider, allowRegistration, features }),
      })
    } catch (e: any) {
      console.error('Setup error:', e)
    }
    setLoading(false)
    setTimeout(() => navigate('/auth'), 1500)
  }

  if (step === 'deploy') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full border-2 border-primary/30 flex items-center justify-center">
            <Check className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <h2 className="text-xl font-medium text-primary/80 animate-pulse">Deploying...</h2>
          <p className="text-muted-foreground text-sm">Setting up database, accounts & encryption</p>
          {!loading && <Button onClick={() => navigate('/auth')}>Continue</Button>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-8">
        {/* Step dots */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIndex ? 'w-8 bg-primary' : i < stepIndex ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-muted'
              }`} />
          ))}
        </div>

        {step === 'welcome' && (
          <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mx-auto w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">SquidOSS</h1>
              <p className="text-muted-foreground">Your private cloud. Your rules.</p>
              <p className="text-muted-foreground/60 text-sm max-w-xs mx-auto">
                Self-hosted storage server. No subscriptions, no data leaks.
              </p>
            </div>
            <Button size="lg" onClick={() => setStep('sudo')} className="gap-2">
              Get Started <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {step === 'sudo' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Key className="w-6 h-6 text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold">Admin Account</h2>
              <p className="text-muted-foreground text-sm">Create the primary admin account.</p>
            </div>

            <Card className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Full Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Admin" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Email</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@squidoss.local" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Password</label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" />
                {password && password.length > 0 && password.length < 8 && (
                  <p className="text-xs text-amber-400">Too short — need 8+ characters</p>
                )}
              </div>
            </Card>

            <Button className="w-full h-10 gap-2"
              disabled={!email || password.length < 8}
              onClick={() => setStep('providers')}>
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {step === 'providers' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <HardDrive className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">Storage Provider</h2>
              <p className="text-muted-foreground text-sm">Choose where files are stored.</p>
            </div>

            <Card className="p-4 space-y-4">
              {['local', 'github', 's3', 'webdav'].map(p => (
                <label key={p} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  storageProvider === p ? 'border-primary/30 bg-primary/5' : 'border-border/20 hover:bg-accent/30'
                }`}>
                  <input type="radio" name="provider" value={p}
                    checked={storageProvider === p} onChange={e => setStorageProvider(e.target.value)}
                    className="accent-primary" />
                  <span className="text-sm capitalize">{p === 's3' ? 'S3 Compatible' : p === 'webdav' ? 'WebDAV' : p === 'github' ? 'GitHub' : 'Local Disk'}</span>
                </label>
              ))}
            </Card>

            <Button className="w-full h-10 gap-2" onClick={() => setStep('users')}>
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {step === 'users' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">User Registration</h2>
              <p className="text-muted-foreground text-sm">Allow others to sign up.</p>
            </div>

            <Card className="p-4 space-y-4">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border/20 cursor-pointer hover:bg-accent/30">
                <input type="checkbox" checked={allowRegistration}
                  onChange={e => setAllowRegistration(e.target.checked)}
                  className="accent-primary" />
                <span className="text-sm">Allow anyone to create an account</span>
              </label>
              <p className="text-xs text-muted-foreground">
                If disabled, only you can add users from the admin panel.
              </p>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep('providers')}>Back</Button>
              <Button className="flex-1 gap-2" onClick={() => setStep('features')}>
                Continue <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 'features' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <SlidersHorizontal className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">Default Features</h2>
              <p className="text-muted-foreground text-sm">Enable default features.</p>
            </div>

            <Card className="p-4 space-y-3">
              {[
                { key: 'fileSharing' as const, label: 'File Sharing', desc: 'Allow users to share files via links' },
                { key: 'encryption' as const, label: 'Encryption', desc: 'Encrypt files at rest' },
                { key: 'versioning' as const, label: 'File Versioning', desc: 'Keep previous versions of files' },
              ].map(f => (
                <label key={f.key} className="flex items-center gap-3 p-3 rounded-lg border border-border/20 cursor-pointer hover:bg-accent/30">
                  <input type="checkbox" checked={features[f.key]}
                    onChange={e => setFeatures({ ...features, [f.key]: e.target.checked })}
                    className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                </label>
              ))}
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep('users')}>Back</Button>
              <Button className="flex-1 gap-2" onClick={() => setStep('naming')}>
                Continue <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 'naming' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Server className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">Name Your Server</h2>
              <p className="text-muted-foreground text-sm">Give your SquidOSS instance a name.</p>
            </div>

            <Card className="p-4">
              <Input value={serverName} onChange={e => setServerName(e.target.value)}
                placeholder="e.g. My Cloud, DataBox, Home Server"
                className="text-center text-lg" />
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep('features')}>Back</Button>
              <Button className="flex-1 gap-2" disabled={!canDeploy || loading}
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
