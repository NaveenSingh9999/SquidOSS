import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import {
  ArrowLeft, ArrowRight, Check, Shield, HardDrive,
  Cloud, Globe, Server, UserPlus, Users, Sparkles,
  Eye, Share2, BarChart3, FileText, GitBranch,
  Zap, Star, Folder,
} from '@/lib/icon-map'

const API_URL = import.meta.env.VITE_SQUIDOSS_API_URL || 'http://localhost:3000'

interface DriveInfo {
  device: string
  mount: string
  size: string
  used: string
  available?: string
  usePercent?: string
}

interface SetupData {
  adminEmail: string
  adminPassword: string
  adminName: string
  additionalUsers: Array<{ email: string; password: string; name: string }>
  storageProvider: 'local' | 's3' | 'r2' | 'github' | null
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
    description: 'Store on local drives, partitions, or mounted volumes',
    icon: HardDrive,
    longDesc: 'Direct-attached storage — SSDs, HDDs, NAS mounts, or any local filesystem path.',
  },
  {
    id: 'github' as const,
    title: 'GitHub Repos',
    description: 'Use GitHub repositories as storage backend',
    icon: GitBranch,
    longDesc: 'Store files in private GitHub repos. Great for versioned, distributed storage.',
  },
  {
    id: 's3' as const,
    title: 'AWS S3',
    description: 'Amazon S3 compatible object storage',
    icon: Cloud,
    longDesc: 'Industry-standard object storage. Works with AWS S3, DigitalOcean Spaces, MinIO, etc.',
  },
  {
    id: 'r2' as const,
    title: 'Cloudflare R2',
    description: 'Zero egress-fee object storage',
    icon: Globe,
    longDesc: 'Cloudflare R2 — pay no egress fees. Ideal for globally distributed content.',
  },
]

const FEATURES = [
  { key: 'sharing' as const, label: 'File Sharing', desc: 'Share files via links with passwords & expiry', icon: Share2 },
  { key: 'workspaces' as const, label: 'Workspaces', desc: 'Team collaboration with role-based access', icon: Users },
  { key: 'analytics' as const, label: 'Analytics', desc: 'Usage statistics and file access logs', icon: BarChart3 },
  { key: 'versionHistory' as const, label: 'Version History', desc: 'Track and restore previous file versions', icon: FileText },
  { key: 'encryption' as const, label: 'Client Encryption', desc: 'End-to-end encryption with BYOK', icon: Eye },
]

const PROVIDER_FIELDS: Record<string, Array<{ key: string; label: string; type: string; placeholder: string }>> = {
  s3: [
    { key: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...' },
    { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: 'Enter your secret key' },
    { key: 'bucket', label: 'Bucket Name', type: 'text', placeholder: 'my-squidoss-storage' },
    { key: 'region', label: 'Region', type: 'text', placeholder: 'us-east-1' },
    { key: 'endpoint', label: 'Endpoint (optional)', type: 'text', placeholder: 'https://s3.amazonaws.com' },
  ],
  r2: [
    { key: 'accountId', label: 'Account ID', type: 'text', placeholder: 'Your Cloudflare Account ID' },
    { key: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'R2 Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: 'R2 Secret Access Key' },
    { key: 'bucket', label: 'Bucket Name', type: 'text', placeholder: 'my-squidoss-storage' },
  ],
  github: [
    { key: 'token', label: 'Personal Access Token', type: 'password', placeholder: 'ghp_... or github_pat_...' },
    { key: 'owner', label: 'Repo Owner', type: 'text', placeholder: 'your-username or org-name' },
    { key: 'repo', label: 'Repository Name', type: 'text', placeholder: 'squidoss-storage' },
    { key: 'branch', label: 'Branch', type: 'text', placeholder: 'main' },
  ],
}

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

function formatBytes(raw: string): string {
  const num = parseFloat(raw)
  if (isNaN(num)) return raw
  if (num >= 1024) return `${(num / 1024).toFixed(1)} TB`
  return `${num.toFixed(0)} GB`
}

export default function Setup() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [animate, setAnimate] = useState(false)
  const [drives, setDrives] = useState<DriveInfo[]>([])
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
      if (res.ok) {
        const list: DriveInfo[] = await res.json()
        setDrives(list.filter(d => d.size !== '0' && !d.device.includes('tmpfs') && !d.device.includes('overlay')))
      }
    } catch {}
  }

  const steps = [
    { title: 'Welcome', desc: 'Set up your private cloud storage' },
    { title: 'Administrator', desc: 'Create the admin account' },
    { title: 'Additional Users', desc: 'Invite team members (optional)' },
    { title: 'Storage Provider', desc: 'Choose where your files live' },
    { title: 'Configure Storage', desc: 'Set up your storage backend' },
    { title: 'Features', desc: 'Enable or disable features' },
    { title: 'Name Your Server', desc: 'Give your SquidOSS a name' },
    { title: 'Deploying...', desc: 'Applying your configuration' },
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

  function selectDrive(device: string, mount: string) {
    setData(d => ({ ...d, providerConfig: { ...d.providerConfig, path: mount, device } }))
  }

  const selectedProvider = STORAGE_PROVIDERS.find(p => p.id === data.storageProvider)
  const fields = data.storageProvider ? PROVIDER_FIELDS[data.storageProvider] || [] : []

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

      for (const u of data.additionalUsers) {
        if (u.email && u.password) {
          await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: u.email, password: u.password, fullName: u.name }),
          }).catch(() => {})
        }
      }

      if (data.storageProvider && data.storageProvider !== 'local') {
        await fetch(`${API_URL}/api/v1/storage/providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regData.token}` },
          body: JSON.stringify({ providerType: data.storageProvider, ...data.providerConfig }),
        }).catch(() => {})
      }

      // Store setup completion server-side so it persists across cache clears
      await fetch(`${API_URL}/auth/setup-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regData.token}` },
        body: JSON.stringify({ name: data.ossName }),
      }).catch(() => {})

      localStorage.setItem('squidoss_setup_complete', 'true')
    } catch (e: any) {
      console.error('Setup error:', e)
    }
    setLoading(false)
    setTimeout(() => navigate('/auth'), 1500)
  }

  // ── Welcome ──
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

  // ── Deploying ──
  if (step === totalSteps - 1) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'hsl(222 47% 9.5%)' }}>
        <div className="w-full max-w-lg text-center space-y-8">
          <StepIndicator current={step} total={totalSteps} />
          <div className="space-y-4">
            <div className={`mx-auto w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center ${animate ? 'animate-spin' : ''}`}>
              <Sparkles className="w-12 h-12 text-primary" />
            </div>
            <h2 className="text-3xl font-bold">Deploying {data.ossName || 'SquidOSS'}...</h2>
            <p className="text-muted-foreground">Setting up your storage, accounts, and configuration.</p>
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
              <Input id="password" type="password" placeholder="At least 8 characters" value={data.adminPassword} onChange={e => update('adminPassword', e.target.value)} />
            </div>
          </Card>
        )}

        {/* Step 2: Additional Users */}
        {step === 2 && (
          <Card className="p-6 space-y-4" style={{ background: 'hsl(222 35% 11.5%)', border: '1px solid hsl(220 20% 17%)' }}>
            {data.additionalUsers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No additional users yet. You can always add more later.</p>
            )}
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
                  onClick={() => { update('storageProvider', provider.id); update('providerConfig', {}) }}
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
                    <div className="text-sm text-muted-foreground">{provider.longDesc || provider.description}</div>
                  </div>
                  {data.storageProvider === provider.id && <Check className="w-5 h-5 text-primary shrink-0" />}
                </button>
              )
            })}
          </div>
        )}

        {/* Step 4: Provider Config */}
        {step === 4 && selectedProvider && (
          <div className="space-y-4">
            {/* ── LOCAL STORAGE: visual drive picker ── */}
            {data.storageProvider === 'local' && (
              <>
                <div className="flex items-center gap-2 px-1">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Select a drive or enter a custom path</span>
                </div>

                {/* Detected drives */}
                {drives.length > 0 && (
                  <div className="grid gap-3 max-h-72 overflow-y-auto pr-1">
                    {drives.map(d => {
                      const selected = data.providerConfig.device === d.device
                      const percent = d.usePercent ? parseInt(d.usePercent.replace('%', '')) : 50
                      const color = percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-yellow-500' : 'bg-emerald-500'
                      return (
                        <button key={d.device}
                          onClick={() => selectDrive(d.device, d.mount)}
                          className={`relative p-4 rounded-xl text-left transition-all ${
                            selected
                              ? 'border-2 border-primary bg-primary/5 shadow-lg shadow-primary/10'
                              : 'border border-border hover:border-primary/50 hover:bg-accent/20'
                          }`}
                          style={{ background: selected ? 'hsl(222 35% 12%)' : 'hsl(222 35% 11.5%)' }}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selected ? 'bg-primary/15' : 'bg-muted/50'}`}>
                                <HardDrive className={`w-5 h-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                              </div>
                              <div>
                                <div className="font-semibold text-sm flex items-center gap-2">
                                  <span className="font-mono">{d.device.replace('/dev/', '')}</span>
                                  {selected && <Star className="w-3 h-3 text-primary" />}
                                </div>
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">{d.mount}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold">{d.size}</p>
                              <p className="text-[11px] text-muted-foreground">{d.used ? `${d.used} used` : ''}</p>
                            </div>
                          </div>
                          {/* Storage bar */}
                          <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Custom path input */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/40" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-2 text-xs text-muted-foreground bg-background">or enter a custom path</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input placeholder="/mnt/data"
                      value={data.providerConfig.path || ''}
                      onChange={e => update('providerConfig', { ...data.providerConfig, path: e.target.value })}
                      className="font-mono text-sm" />
                  </div>
                  <Button variant="outline" size="icon" className="shrink-0" title="Detect drives" onClick={fetchDrives}>
                    <Zap className="w-4 h-4" />
                  </Button>
                </div>
                {data.providerConfig.path && (
                  <div className="flex items-center gap-2 px-1 text-xs text-emerald-400">
                    <Check className="w-3 h-3" />
                    <span>Path set to <span className="font-mono">{data.providerConfig.path}</span></span>
                  </div>
                )}
              </>
            )}

            {/* ── GITHUB ── */}
            {data.storageProvider === 'github' && (
              <Card className="p-6 space-y-4" style={{ background: 'hsl(222 35% 11.5%)', border: '1px solid hsl(220 20% 17%)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <GitBranch className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">GitHub Storage</div>
                    <div className="text-xs text-muted-foreground">Store files in GitHub repositories</div>
                  </div>
                </div>
                {PROVIDER_FIELDS.github.map(field => (
                  <div key={field.key} className="space-y-2">
                    <Label>{field.label}</Label>
                    <Input type={field.type} placeholder={field.placeholder}
                      value={data.providerConfig[field.key] || ''}
                      onChange={e => update('providerConfig', { ...data.providerConfig, [field.key]: e.target.value })} />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Requires a <a className="text-primary hover:underline" target="_blank" href="https://github.com/settings/tokens">GitHub Personal Access Token</a> with <code className="font-mono">repo</code> scope.
                </p>
              </Card>
            )}

            {/* ── S3 / R2 ── */}
            {(data.storageProvider === 's3' || data.storageProvider === 'r2') && (
              <Card className="p-6 space-y-4" style={{ background: 'hsl(222 35% 11.5%)', border: '1px solid hsl(220 20% 17%)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <selectedProvider.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">{selectedProvider.title}</div>
                    <div className="text-xs text-muted-foreground">{selectedProvider.longDesc}</div>
                  </div>
                </div>
                {fields.map(field => (
                  <div key={field.key} className="space-y-2">
                    <Label>{field.label}</Label>
                    <Input type={field.type} placeholder={field.placeholder}
                      value={data.providerConfig[field.key] || ''}
                      onChange={e => update('providerConfig', { ...data.providerConfig, [field.key]: e.target.value })} />
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}

        {/* Step 5: Features */}
        {step === 5 && (
          <Card className="p-6 space-y-3" style={{ background: 'hsl(222 35% 11.5%)', border: '1px solid hsl(220 20% 17%)' }}>
            <p className="text-sm text-muted-foreground mb-2">Choose which features to enable. Can be changed later.</p>
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
              {loading ? 'Deploying...' : 'Complete Setup'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
