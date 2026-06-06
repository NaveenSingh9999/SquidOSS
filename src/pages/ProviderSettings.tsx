import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import StorageDeviceWizard from '@/components/StorageDeviceWizard'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Plus, Trash2, Github, HardDrive, Globe, Box,
  Database, Settings2, Server, Check, X, ExternalLink, Folder,
  Power, PowerOff, Sliders, RefreshCw,
} from '@/lib/icon-map'

import { API_URL } from '@/lib/api-url'

interface Provider {
  id: string
  provider_type: string
  is_default: boolean
  created_at: string
}

interface GithubRepo {
  id: number
  repo_name: string
  repo_full_name: string
  repo_url: string
  clone_url: string
}

const PROVIDER_CONFIG: Record<string, { icon: any; label: string; fields: { key: string; label: string; type: string }[] }> = {
  local: { icon: HardDrive, label: 'Local Disk', fields: [
    { key: 'path', label: 'Storage Path', type: 'text' },
    { key: 'partitionSize', label: 'Max Partition (GB, 0 = unlimited)', type: 'number' },
  ]},
  github: { icon: Github, label: 'GitHub', fields: [
    { key: 'token', label: 'Personal Access Token', type: 'password' },
    { key: 'owner', label: 'Owner (user or org)', type: 'text' },
  ]},
  r2: { icon: Globe, label: 'Cloudflare R2', fields: [
    { key: 'accountId', label: 'Account ID', type: 'text' },
    { key: 'accessKeyId', label: 'Access Key ID', type: 'text' },
    { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password' },
  ]},
  s3: { icon: Box, label: 'Amazon S3', fields: [
    { key: 'accessKeyId', label: 'Access Key ID', type: 'text' },
    { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password' },
    { key: 'region', label: 'Region (e.g. us-east-1)', type: 'text' },
    { key: 'bucket', label: 'Bucket Name', type: 'text' },
  ]},
}

const LOCAL_PROVIDER_TYPES = ['local']
const REMOTE_PROVIDER_TYPES = ['github', 'r2', 's3']

export default function ProviderSettings() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()

  const [providers, setProviders] = useState<Provider[]>([])
  const [localDisk, setLocalDisk] = useState<{ enabled: boolean; path: string; partitionSize: number; chunkCount: number; totalBytes: number } | null>(null)
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [showLocalConfig, setShowLocalConfig] = useState(false)
  const [newProviderType, setNewProviderType] = useState('github')
  const [formFields, setFormFields] = useState<Record<string, string>>({})
  const [localForm, setLocalForm] = useState({ path: './data/chunks', partitionSize: '0' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [res54Config, setRes54Config] = useState<Record<string, { enabled: boolean; chunkSize: number }>>({})

  const token = () => localStorage.getItem('squidoss_token')
  const headers = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) })

  const fetchProviders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/providers`, { headers: headers() })
      const data = await res.json()
      setProviders(data?.providers || [])
    } catch {}
    setLoading(false)
  }, [])

  const fetchLocalStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/res54-local/status`, { headers: headers() })
      const data = await res.json()
      if (data.success) {
        setLocalDisk(prev => ({
          enabled: prev?.enabled ?? true,
          path: data.storagePath || './data/chunks',
          partitionSize: 0,
          chunkCount: data.chunkCount || 0,
          totalBytes: data.totalBytes || 0,
        }))
      }
    } catch {}
  }, [])

  const fetchGithubRepos = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/query/github_repos?select=*`, { headers: headers() })
      const data = await res.json()
      setGithubRepos(Array.isArray(data) ? data : data?.data || [])
    } catch {}
  }, [])

  useEffect(() => { fetchProviders(); fetchGithubRepos(); fetchLocalStatus() }, [])

  const toggleLocalDisk = async () => {
    if (!localDisk) return
    const newState = !localDisk.enabled
    try {
      const res = await fetch(`${API_URL}/api/v1/res54-local/${newState ? 'enable' : 'disable'}`, {
        method: 'POST', headers: headers(),
      })
      if (res.ok) {
        setLocalDisk(prev => prev ? { ...prev, enabled: newState } : prev)
        toast({ title: newState ? 'Local disk storage enabled' : 'Local disk storage disabled' })
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error, variant: 'destructive' })
      }
    } catch {}
  }

  const wipeLocalChunks = async () => {
    if (!confirm('Delete all local chunks? This cannot be undone.')) return
    try {
      const res = await fetch(`${API_URL}/api/v1/res54-local/chunks`, {
        method: 'DELETE', headers: headers(),
      })
      if (res.ok) {
        const data = await res.json()
        toast({ title: `Deleted ${data.deletedCount} chunks` })
        fetchLocalStatus()
      }
    } catch {}
  }

  const saveLocalConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/providers/local`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          path: localForm.path,
          partitionSize: parseInt(localForm.partitionSize) || 0,
        }),
      })
      if (res.ok) {
        toast({ title: 'Local disk configured' })
        setShowLocalConfig(false)
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error, variant: 'destructive' })
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
    setSaving(false)
  }

  const handleAddProvider = async () => {
    setSaving(true)
    try {
      const config = PROVIDER_CONFIG[newProviderType]
      if (!config) return

      if (newProviderType === 'github') {
        // Use github-init endpoint to create repos
        const res = await fetch(`${API_URL}/api/v1/storage/providers/github-init`, {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ token: formFields.token, owner: formFields.owner }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'GitHub init failed')
        }
        toast({ title: '10 repos created on GitHub!' })
        await fetchGithubRepos()
      } else {
        const res = await fetch(`${API_URL}/api/v1/storage/providers`, {
          method: 'POST', headers: headers(),
          body: JSON.stringify({
            providerType: newProviderType,
            accessKeyId: formFields.accessKeyId || '',
            secretAccessKey: formFields.secretAccessKey || '',
            accountId: formFields.accountId || null,
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to add provider')
        }
        toast({ title: 'Provider added!' })
      }

      setShowAddForm(false)
      setFormFields({})
      await fetchProviders()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
    setSaving(false)
  }

  const handleRemoveProvider = async (id: string) => {
    if (!confirm('Remove this provider?')) return
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/providers/${id}`, {
        method: 'DELETE', headers: headers(),
      })
      if (res.ok) {
        setProviders(prev => prev.filter(p => p.id !== id))
        toast({ title: 'Provider removed' })
      }
    } catch {}
  }

  const setDefaultProvider = async (providerId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/providers/${providerId}/default`, {
        method: 'PATCH', headers: headers(),
      })
      if (res.ok) {
        toast({ title: 'Default provider updated' })
        await fetchProviders()
      }
    } catch {}
  }

  const toggleRes54 = async (providerId: string, enabled: boolean) => {
    setRes54Config(prev => ({ ...prev, [providerId]: { enabled, chunkSize: prev[providerId]?.chunkSize || 5 } }))
    toast({ title: enabled ? 'res54 enabled' : 'res54 disabled', description: `Provider ${providerId.slice(0, 8)}...` })
  }

  const providerIcon = (type: string, className = 'w-4 h-4') => {
    const Icon = PROVIDER_CONFIG[type]?.icon || Database
    return <Icon className={className} />
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/30 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 h-12 px-4 lg:px-6 max-w-5xl mx-auto">
          <button onClick={() => navigate(-1)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-semibold">Storage Providers</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-4">
        {/* Local Storage — device detection */}
        <Card className="border-border/30">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">Local Storage</CardTitle>
              <span className="text-[9px] text-muted-foreground ml-auto">Auto-detects disks & partitions</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <StorageDeviceWizard onConfigured={() => {}} compact />
          </CardContent>
        </Card>

        {/* Active Providers */}
        <Card className="border-border/30">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Active Providers</CardTitle>
              <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7" onClick={() => { setShowAddForm(true); setFormFields({}) }}>
                <Plus className="w-3 h-3" /> Add Provider
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : providers.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                <Database className="w-8 h-8" />
                <p className="text-xs">No storage providers configured</p>
                <p className="text-[10px]">Add GitHub, R2, or S3 to store your files</p>
              </div>
            ) : (
              providers.map(p => {
                const Icon = PROVIDER_CONFIG[p.provider_type]?.icon || Database
                return (
                  <div key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    p.is_default ? 'border-primary/30 bg-primary/5' : 'border-border/30 hover:border-border/60'
                  }`}>
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium capitalize">{p.provider_type}</p>
                        {p.is_default && (
                          <Badge variant="default" className="text-[8px] h-4 px-1.5 bg-primary/20 text-primary border-0">
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">Added {new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.provider_type === 'github' && githubRepos.length > 0 && (
                        <Badge variant="secondary" className="text-[9px] h-5">
                          {githubRepos.length} repos
                        </Badge>
                      )}

                      {/* Set as default */}
                      {!p.is_default && (
                        <button onClick={() => setDefaultProvider(p.id)}
                          className="px-2 py-1 text-[9px] rounded border border-border/40 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                          Make Default
                        </button>
                      )}

                      {/* res54 toggle */}
                      <button
                        onClick={() => toggleRes54(p.id, !res54Config[p.id]?.enabled)}
                        className={cn(
                          'px-2 py-1 text-[9px] rounded border transition-colors',
                          res54Config[p.id]?.enabled
                            ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10'
                            : 'border-border/40 text-muted-foreground hover:border-border',
                        )}
                      >
                        {res54Config[p.id]?.enabled ? 'res54 ON' : 'res54'}
                      </button>

                      <button onClick={() => handleRemoveProvider(p.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Add Provider Form */}
        {showAddForm && (
          <Card className="border-border/30">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm">New Provider</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex gap-2">
                {Object.entries(PROVIDER_CONFIG).map(([key, cfg]) => {
                  const Icon = cfg.icon
                  return (
                    <button key={key} onClick={() => setNewProviderType(key)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all',
                        newProviderType === key
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/30 text-muted-foreground hover:border-border',
                      )}>
                      <Icon className="w-4 h-4" />
                      {cfg.label}
                    </button>
                  )
                })}
              </div>

              {PROVIDER_CONFIG[newProviderType]?.fields.map(field => (
                <div key={field.key}>
                  <label className="text-[10px] font-medium text-muted-foreground mb-1 block">{field.label}</label>
                  <Input
                    type={field.type}
                    value={formFields[field.key] || ''}
                    onChange={e => setFormFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="h-8 text-xs rounded-lg"
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                  />
                </div>
              ))}

              <div className="flex gap-2 pt-1">
                <Button size="sm" className="text-xs h-7 gap-1.5" onClick={handleAddProvider} disabled={saving}>
                  {saving ? 'Connecting...' : <><Plus className="w-3 h-3" /> Connect</>}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}


      </div>
    </div>
  )
}

function cn(...args: any[]) {
  return args.filter(Boolean).join(' ')
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
