import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import {
  ArrowLeft, ArrowRight, Check, Shield, HardDrive, Github,
  Cloud, Globe, Server, UserPlus, Users, Key, Sparkles,
} from '@/lib/icon-map'

const API_URL = import.meta.env.VITE_SQUIDOSS_API_URL || 'http://localhost:3000'

interface SetupData {
  adminEmail: string
  adminPassword: string
  adminName: string
  additionalUsers: Array<{ email: string; password: string; name: string }>
  storageProvider: 'github' | 'local' | 's3' | 'r2' | null
  providerConfig: Record<string, string>
  ossName: string
}

const STORAGE_PROVIDERS = [
  {
    id: 'github' as const,
    title: 'GitHub',
    description: 'Use GitHub repositories as storage backend',
    icon: Github,
    fields: [
      { key: 'token', label: 'GitHub Personal Access Token', type: 'password', placeholder: 'ghp_...', hint: 'Create a token with repo, workflow, and packages scopes' },
      { key: 'username', label: 'GitHub Username', type: 'text', placeholder: 'your-username' },
    ],
  },
  {
    id: 'local' as const,
    title: 'Local Storage',
    description: 'Store files on this device',
    icon: HardDrive,
    fields: [
      { key: 'path', label: 'Storage Path', type: 'text', placeholder: '/data/storage', hint: 'Absolute path to store files' },
    ],
  },
  {
    id: 's3' as const,
    title: 'AWS S3',
    description: 'Amazon Web Services S3 compatible storage',
    icon: Cloud,
    fields: [
      { key: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...' },
      { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: '••••••••' },
      { key: 'bucket', label: 'Bucket Name', type: 'text', placeholder: 'my-squidoss-storage' },
      { key: 'region', label: 'Region', type: 'text', placeholder: 'us-east-1' },
    ],
  },
  {
    id: 'r2' as const,
    title: 'Cloudflare R2',
    description: 'Cloudflare R2 object storage',
    icon: Globe,
    fields: [
      { key: 'accountId', label: 'Account ID', type: 'text', placeholder: '...' },
      { key: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: '...' },
      { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: '••••••••' },
      { key: 'bucket', label: 'Bucket Name', type: 'text', placeholder: 'my-squidoss-storage' },
    ],
  },
]

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-500 ${
            i === current ? 'w-8 bg-primary' : i < current ? 'w-2 bg-primary/50' : 'w-2 bg-muted'
          }`}
        />
      ))}
    </div>
  )
}

export default function Setup() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [animate, setAnimate] = useState(false)
  const [data, setData] = useState<SetupData>({
    adminEmail: '',
    adminPassword: '',
    adminName: '',
    additionalUsers: [],
    storageProvider: null,
    providerConfig: {},
    ossName: '',
  })

  const steps = [
    // Step 0: Welcome
    { title: 'Welcome to SquidOSS', desc: 'Let\'s set up your private cloud storage' },
    // Step 1: Admin account
    { title: 'Create Administrator', desc: 'Set up the admin account' },
    // Step 2: Additional users
    { title: 'Add Users', desc: 'Create additional user accounts (optional)' },
    // Step 3: Choose storage provider
    { title: 'Storage Provider', desc: 'Select where to store your files' },
    // Step 4: Provider config
    { title: 'Provider Setup', desc: 'Configure your storage provider' },
    // Step 5: Name your SquidOSS
    { title: 'Name Your Machine', desc: 'Give your SquidOSS a unique name' },
    // Step 6: Setup animation
    { title: 'Setting Up...', desc: 'Applying configuration' },
  ]

  const totalSteps = steps.length

  function update(field: string, value: any) {
    setData(d => ({ ...d, [field]: value }))
  }

  function addUser() {
    setData(d => ({ ...d, additionalUsers: [...d.additionalUsers, { email: '', password: '', name: '' }] }))
  }

  function updateUser(idx: number, field: string, value: string) {
    setData(d => {
      const users = [...d.additionalUsers]
      users[idx] = { ...users[idx], [field]: value }
      return { ...d, additionalUsers: users }
    })
  }

  function removeUser(idx: number) {
    setData(d => ({ ...d, additionalUsers: d.additionalUsers.filter((_, i) => i !== idx) }))
  }

  const selectedProvider = STORAGE_PROVIDERS.find(p => p.id === data.storageProvider)

  async function handleSetup() {
    setLoading(true)
    setAnimate(true)

    try {
      // Register admin
      const regRes = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.adminEmail,
          password: data.adminPassword,
          fullName: data.adminName,
        }),
      })
      const regData = await regRes.json()
      if (!regData.token) throw new Error(regData.error || 'Registration failed')

      // Store config
      localStorage.setItem('squidoss_token', regData.token)

      // Store oss name
      localStorage.setItem('squidoss_name', data.ossName)

      // Create additional users
      for (const user of data.additionalUsers) {
        if (user.email && user.password) {
          await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: user.password, fullName: user.name }),
          })
        }
      }

      // Configure storage provider
      if (data.storageProvider && data.storageProvider !== 'local') {
        await fetch(`${API_URL}/api/v1/storage/providers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${regData.token}`,
          },
          body: JSON.stringify({
            providerType: data.storageProvider,
            ...data.providerConfig,
          }),
        })
      }

      localStorage.setItem('squidoss_setup_complete', 'true')
    } catch (e: any) {
      console.error('Setup error:', e)
    }

    setLoading(false)
    setTimeout(() => navigate('/auth'), 1500)
  }

  if (step === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'hsl(222 47% 9.5%)' }}>
        <div className="w-full max-w-lg text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="space-y-4">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">SquidOSS</h1>
            <p className="text-xl text-muted-foreground">Your private cloud. Your rules.</p>
            <p className="text-muted-foreground max-w-md mx-auto">
              This wizard will guide you through setting up your personal cloud storage server in just a few minutes.
            </p>
          </div>
          <Button size="lg" onClick={() => setStep(1)} className="gap-2">
            Get Started <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    )
  }

  if (step === totalSteps - 1) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'hsl(222 47% 9.5%)' }}>
        <div className="w-full max-w-lg text-center space-y-8">
          <StepIndicator current={step} total={totalSteps} />
          <div className="space-y-4">
            <div className={`mx-auto w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center ${animate ? 'animate-spin' : ''}`}>
              <Sparkles className="w-12 h-12 text-primary" />
            </div>
            <h2 className="text-3xl font-bold">Setting up {data.ossName || 'SquidOSS'}...</h2>
            <p className="text-muted-foreground">Configuring your storage, accounts, and security.</p>
            <div className="flex justify-center gap-2">
              {['Accounts', 'Storage', 'Security', 'Keys'].map((s, i) => (
                <div key={s} className={`px-3 py-1.5 rounded-full text-sm border transition-all duration-500 delay-${i * 200} ${
                  animate ? 'border-primary/50 text-primary bg-primary/5' : 'border-border text-muted-foreground'
                }`}>
                  {s}
                </div>
              ))}
            </div>
            {!loading && (
              <Button onClick={() => navigate('/auth')} className="mt-4">
                Continue to Login
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'hsl(222 47% 9.5%)' }}>
      <div className="w-full max-w-lg space-y-6">
        <StepIndicator current={step} total={totalSteps} />

        <div className="text-center space-y-2 mb-6">
          <h2 className="text-2xl font-bold">{steps[step].title}</h2>
          <p className="text-muted-foreground">{steps[step].desc}</p>
        </div>

        {/* Step 1: Admin Account */}
        {step === 1 && (
          <Card className="p-6 space-y-4" style={{ background: 'hsl(222 35% 11.5%)', border: '1px solid hsl(220 20% 17%)' }}>
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" placeholder="Admin" value={data.adminName} onChange={e => update('adminName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="admin@squidoss.local" value={data.adminEmail} onChange={e => update('adminEmail', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={data.adminPassword} onChange={e => update('adminPassword', e.target.value)} />
            </div>
          </Card>
        )}

        {/* Step 2: Additional Users */}
        {step === 2 && (
          <Card className="p-6 space-y-4" style={{ background: 'hsl(222 35% 11.5%)', border: '1px solid hsl(220 20% 17%)' }}>
            {data.additionalUsers.map((user, idx) => (
              <div key={idx} className="space-y-3 p-4 rounded-lg relative" style={{ background: 'hsl(220 20% 14%)' }}>
                <button className="absolute top-2 right-2 text-muted-foreground hover:text-destructive" onClick={() => removeUser(idx)}>✕</button>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input placeholder="User name" value={user.name} onChange={e => updateUser(idx, 'name', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="user@example.com" value={user.email} onChange={e => updateUser(idx, 'email', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" placeholder="••••••••" value={user.password} onChange={e => updateUser(idx, 'password', e.target.value)} />
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={addUser} className="w-full gap-2">
              <UserPlus className="w-4 h-4" /> Add User
            </Button>
          </Card>
        )}

        {/* Step 3: Storage Provider */}
        {step === 3 && (
          <div className="grid gap-3">
            {STORAGE_PROVIDERS.map(provider => {
              const Icon = provider.icon
              return (
                <button
                  key={provider.id}
                  onClick={() => update('storageProvider', provider.id)}
                  className={`flex items-center gap-4 p-4 rounded-xl text-left transition-all ${
                    data.storageProvider === provider.id
                      ? 'border-primary border-2 bg-primary/5'
                      : 'border border-border hover:border-primary/50'
                  }`}
                  style={{ background: data.storageProvider === provider.id ? 'hsl(222 35% 11.5%)' : 'hsl(222 35% 11.5%)' }}
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{provider.title}</div>
                    <div className="text-sm text-muted-foreground">{provider.description}</div>
                  </div>
                  {data.storageProvider === provider.id && <Check className="w-5 h-5 text-primary shrink-0" />}
                </button>
              )
            })}
          </div>
        )}

        {/* Step 4: Provider Config */}
        {step === 4 && selectedProvider && (
          <Card className="p-6 space-y-4" style={{ background: 'hsl(222 35% 11.5%)', border: '1px solid hsl(220 20% 17%)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <selectedProvider.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold">{selectedProvider.title}</div>
                <div className="text-sm text-muted-foreground">Configure your storage provider</div>
              </div>
            </div>
            {selectedProvider.fields.map(field => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <Input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={data.providerConfig[field.key] || ''}
                  onChange={e => update('providerConfig', { ...data.providerConfig, [field.key]: e.target.value })}
                />
                {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
              </div>
            ))}
          </Card>
        )}

        {/* Step 5: Name */}
        {step === 5 && (
          <Card className="p-6 space-y-4 text-center" style={{ background: 'hsl(222 35% 11.5%)', border: '1px solid hsl(220 20% 17%)' }}>
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Server className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <Label className="text-lg">Name your SquidOSS machine</Label>
              <p className="text-sm text-muted-foreground">This name will identify your server</p>
            </div>
            <Input
              placeholder="e.g., My Cloud, Home Server, DataBox"
              value={data.ossName}
              onChange={e => update('ossName', e.target.value)}
              className="text-center text-lg"
            />
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <Button variant="ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          {step < totalSteps - 2 ? (
            <Button onClick={() => setStep(s => s + 1)} className="gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          ) : step === totalSteps - 2 ? (
            <Button onClick={handleSetup} disabled={loading || !data.adminEmail || !data.adminPassword || !data.ossName}>
              {loading ? 'Setting up...' : 'Complete Setup'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
