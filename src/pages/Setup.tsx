import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft, ArrowRight, Check, Shield, HardDrive,
  Cloud, Globe, Server, UserPlus, Users, Key, Sparkles,
  Eye, Share2, BarChart3, FileText, Wifi,
} from '@/lib/icon-map'

const API_URL = import.meta.env.VITE_SQUIDOSS_API_URL || 'http://localhost:3000'

interface SetupData {
  adminEmail: string
  adminPassword: string
  adminName: string
  additionalUsers: Array<{ email: string; password: string; name: string }>
  storageProvider: 'local' | 's3' | 'r2' | null
  providerConfig: Record<string, string>
  ossName: string
  features: {
    sharing: boolean
    analytics: boolean
    workspaces: boolean
    versionHistory: boolean
    encryption: boolean
  }
}

const STORAGE_PROVIDERS = [
  {
    id: 'local' as const,
    title: 'Local Storage',
    description: 'Store files on local drives or partitions',
    icon: HardDrive,
    fields: [
      { key: 'path', label: 'Storage Path', type: 'text', placeholder: '/mnt/data', hint: 'Mount point or directory for file storage' },
      { key: 'mount', label: 'Mount Device (optional)', type: 'text', placeholder: '/dev/sda1', hint: 'e.g., /dev/sda1, /dev/nvme0n1p1' },
    ],
  },
  {
    id: 's3' as const,
    title: 'AWS S3',
    description: 'Amazon S3 compatible object storage',
    icon: Cloud,
    fields: [
      { key: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...' },
      { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: '...' },
      { key: 'bucket', label: 'Bucket Name', type: 'text', placeholder: 'my-squidoss-storage' },
      { key: 'region', label: 'Region', type: 'text', placeholder: 'us-east-1' },
    ],
  },
  {
    id: 'r2' as const,
    title: 'Cloudflare R2',
    description: 'Cloudflare R2 object storage (free egress)',
    icon: Globe,
    fields: [
      { key: 'accountId', label: 'Account ID', type: 'text', placeholder: '...' },
      { key: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: '...' },
      { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: '...' },
      { key: 'bucket', label: 'Bucket Name', type: 'text', placeholder: 'my-squidoss-storage' },
    ],
  },
]

const FEATURES = [
  { key: 'sharing' as const, label: 'File Sharing', desc: 'Share files via links with passwords & expiry', icon: Share2 },
  { key: 'workspaces' as const, label: 'Workspaces', desc: 'Team collaboration with role-based access', icon: Users },
  { key: 'analytics' as const, label: 'Analytics', desc: 'Usage statistics and file access logs', icon: BarChart3 },
  { key: 'versionHistory' as const, label: 'Version History', desc: 'Track and restore previous file versions', icon: FileText },
  { key: 'encryption' as const, label: 'Client Encryption', desc: 'End-to-end encryption with BYOK', icon: Eye },
]

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i}
          className={`h-2 rounded-full transition-all duration-500 ${
            i === current ? 'w-8 bg-primary' : i < current ? 'w-2 bg-primary/50' : 'w-2 bg-muted'
          }`} />
      ))}
    </div>
  )
}

export default function Setup() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [animate, setAnimate] = useState(false)
  const [drives, setDrives] = useState<{ device: string; mount: string; size: string }[]>([])
  const [data, setData] = useState<SetupData>({
    adminEmail: '',
    adminPassword: '',
    adminName: '',
    additionalUsers: [],
    storageProvider: null,
    providerConfig: {},
    ossName: '',
    features: { sharing: false, analytics: true, workspaces: false, versionHistory: true, encryption: false },
  })

  useEffect(() => {
    fetchDrives()
  }, [])

  async function fetchDrives() {
    try {
      const res = await fetch(`${API_URL}/api/v1/system/drives`)
      if (res.ok) setDrives(await res.json())
    } catch {}
  }

  const steps = [
    { title: 'Welcome to SquidOSS', desc: 'Set up your private cloud storage' },
    { title: 'Create Administrator', desc: 'Set up the admin account' },
    { title: 'Add Users', desc: 'Create additional users (optional)' },
    { title: 'Storage Provider', desc: 'Choose where to store files' },
    { title: 'Provider Setup', desc: 'Configure storage details' },
    { title: 'Features', desc: 'Enable or disable features' },
    { title: 'Name Your Machine', desc: 'Give your server a name' },
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

  function toggleFeature(key: keyof typeof data.features) {
    setData(d => ({ ...d, features: { ...d.features, [key]: !d.features[key] } }))
  }

  const selectedProvider = STORAGE_PROVIDERS.find(p => p.id === data.storageProvider)

  async function handleSetup() {
    setLoading(true)
    setAnimate(true)
    try {
      const regRes = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.adminEmail, password: data.adminPassword, fullName: data.adminName }),
      })
      const regData = await regRes.json()
      if (!regData.token) throw new Error(regData.error || 'Registration failed')
      localStorage.setItem('squidoss_token', regData.token)
      localStorage.setItem('squidoss_name', data.ossName)
      localStorage.setItem('squidoss_features', JSON.stringify(data.features))

      for (const user of data.additionalUsers) {
        if (user.email && user.password) {
          await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: user.password, fullName: user.name }),
          })
        }
      }

      if (data.storageProvider && data.storageProvider !== 'local') {
        await fetch(`${API_URL}/api/v1/storage/providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regData.token}` },
          body: JSON.stringify({ providerType: data.storageProvider, ...data.providerConfig }),
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
        <div className="w-full max-w-lg text-center space-y-8">
          <div className="space-y-4">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">SquidOSS</h1>
            <p className="text-xl text-muted-foreground">Your private cloud. Your rules.</p>
            <p className="text-muted-foreground max-w-md mx-auto">Configure your cloud storage server in just a few minutes.</p>
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
            <p className="text-muted-foreground">Applying your configuration.</p>
            {!loading && <Button onClick={() => navigate('/auth')}>Continue to Login</Button>}
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

        {/* Step 1: Admin */}
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
              <Input id="password" type="password" placeholder="..." value={data.adminPassword} onChange={e => update('adminPassword', e.target.value)} />
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
                  <Input type="password" placeholder="..." value={user.password} onChange={e => updateUser(idx, 'password', e.target.value)} />
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
                <button key={provider.id}
                  onClick={() => update('storageProvider', provider.id)}
                  className={`flex items-center gap-4 p-4 rounded-xl text-left transition-all ${
                    data.storageProvider === provider.id
                      ? 'border-primary border-2 bg-primary/5'
                      : 'border border-border hover:border-primary/50'
                  }`}
                  style={{ background: 'hsl(222 35% 11.5%)' }}>
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
                <div className="text-sm text-muted-foreground">Configure your storage</div>
              </div>
            </div>
            {/* Local storage: show detected drives */}
            {data.storageProvider === 'local' && drives.length > 0 && (
              <div className="space-y-2">
                <Label>Detected Drives</Label>
                <div className="grid gap-2 max-h-48 overflow-y-auto">
                  {drives.map(d => (
                    <button key={d.device}
                      onClick={() => update('providerConfig', { ...data.providerConfig, path: d.mount, mount: d.device })}
                      className={`flex items-center justify-between p-3 rounded-lg text-sm border ${
                        data.providerConfig.mount === d.device ? 'border-primary bg-primary/5' : 'border-border'
                      }`}>
                      <span className="font-mono">{d.device}</span>
                      <span className="text-muted-foreground">{d.size}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selectedProvider.fields.map(field => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <Input type={field.type} placeholder={field.placeholder}
                  value={data.providerConfig[field.key] || ''}
                  onChange={e => update('providerConfig', { ...data.providerConfig, [field.key]: e.target.value })} />
                {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
              </div>
            ))}
          </Card>
        )}

        {/* Step 5: Features */}
        {step === 5 && (
          <Card className="p-6 space-y-4" style={{ background: 'hsl(222 35% 11.5%)', border: '1px solid hsl(220 20% 17%)' }}>
            <p className="text-sm text-muted-foreground mb-2">Enable or disable features for all users. Can be overridden per user later.</p>
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <div key={f.key} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'hsl(220 20% 14%)' }}>
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-primary shrink-0" />
                    <div>
                      <div className="font-medium text-sm">{f.label}</div>
                      <div className="text-xs text-muted-foreground">{f.desc}</div>
                    </div>
                  </div>
                  <Switch checked={data.features[f.key]} onCheckedChange={() => toggleFeature(f.key)} />
                </div>
              )
            })}
          </Card>
        )}

        {/* Step 6: Name */}
        {step === 6 && (
          <Card className="p-6 space-y-4 text-center" style={{ background: 'hsl(222 35% 11.5%)', border: '1px solid hsl(220 20% 17%)' }}>
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Server className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <Label className="text-lg">Name your SquidOSS machine</Label>
              <p className="text-sm text-muted-foreground">This name identifies your server</p>
            </div>
            <Input placeholder="e.g., My Cloud, Home Server, DataBox"
              value={data.ossName} onChange={e => update('ossName', e.target.value)}
              className="text-center text-lg" />
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
