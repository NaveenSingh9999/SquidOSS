import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Plus, Trash2, Github, HardDrive, Globe, Box,
  Database, Settings2, Server, Check, X, ExternalLink,
} from '@/lib/icon-map'

const API_URL = (() => {
  if (import.meta.env.VITE_SQUIDOSS_API_URL) return import.meta.env.VITE_SQUIDOSS_API_URL
  if (typeof window !== 'undefined' && window.location.hostname.includes('app.github.dev'))
    return window.location.origin.replace(':8080', ':3000').replace(/-8080\./, '-3000.')
  return 'http://localhost:3000'
})().replace(/\/+$/, '')

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

export default function ProviderSettings() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()

  const [providers, setProviders] = useState<Provider[]>([])
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newProviderType, setNewProviderType] = useState('github')
  const [formFields, setFormFields] = useState<Record<string, string>>({})
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

  const fetchGithubRepos = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/query/github_repos?select=*`, { headers: headers() })
      const data = await res.json()
      setGithubRepos(Array.isArray(data) ? data : data?.data || [])
    } catch {}
  }, [])

  useEffect(() => { fetchProviders(); fetchGithubRepos() }, [])

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
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 hover:border-border/60 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium capitalize">{p.provider_type}</p>
                      <p className="text-[10px] text-muted-foreground">Added {new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.provider_type === 'github' && githubRepos.length > 0 && (
                        <Badge variant="secondary" className="text-[9px] h-5">
                          {githubRepos.length} repos
                        </Badge>
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

        {/* GitHub Repos (shown when GitHub provider exists) */}
        {githubRepos.length > 0 && (
          <Card className="border-border/30">
            <CardHeader className="px-4 py-3">
              <div className="flex items-center gap-2">
                <Github className="w-4 h-4" />
                <CardTitle className="text-sm">GitHub Storage Repos</CardTitle>
                <Badge variant="outline" className="text-[9px] h-5 ml-auto">
                  res54 Distributed
                </Badge>
              </div>
              <CardDescription className="text-[10px] mt-1">
                These repos are used for distributed chunk storage by res54. Files are split, encrypted, and distributed across repos for redundancy.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {githubRepos.map(repo => (
                  <a key={repo.id} href={repo.repo_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg border border-border/30 hover:border-border/60 hover:bg-accent/30 transition-colors group">
                    <Github className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-[10px] truncate flex-1">{repo.repo_name}</span>
                    <ExternalLink className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* res54 Info */}
        <Card className="border-border/30">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Server className="w-4 h-4" />
              res54 Distributed Storage
            </CardTitle>
            <CardDescription className="text-[10px] mt-1">
              res54 splits files into encrypted chunks and distributes them across all available storage backends. Enable it per-provider above.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-[11px] text-muted-foreground space-y-1">
            <p>For <strong>GitHub</strong>: chunks are stored across your 10 auto-created repos as separate branches/files.</p>
            <p>For <strong>R2/S3</strong>: chunks are stored in the bucket with deterministic paths.</p>
            <p>Files are reassembled on download using chunk metadata.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function cn(...args: any[]) {
  return args.filter(Boolean).join(' ')
}
