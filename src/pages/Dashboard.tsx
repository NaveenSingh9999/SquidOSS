import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search, Upload, Folder, File, Trash2, Home, ChevronRight,
  Download, Settings, RefreshCw, LogOut, PanelLeft, PanelLeftClose,
  Image, Video, Music, FileText, Archive, Shield,
} from '@/lib/icon-map'

const API_URL = (() => {
  if (import.meta.env.VITE_SQUIDOSS_API_URL) return import.meta.env.VITE_SQUIDOSS_API_URL
  if (typeof window !== 'undefined' && window.location.hostname.includes('app.github.dev'))
    return window.location.origin.replace(':8080', ':3000').replace(/-8080\./, '-3000.')
  return 'http://localhost:3000'
})().replace(/\/+$/, '')

interface FileItem {
  id: string; name: string; type?: string; size?: number; created_at: string
  encrypted?: boolean; storage_path?: string; user_id?: string
  is_deleted?: boolean; parent_folder?: string | null
}

interface FolderItem {
  id: string; name: string; path: string; created_at: string
  parent_folder?: string | null
}

const FILE_ICONS: Record<string, any> = {
  image: Image, video: Video, audio: Music,
  pdf: FileText, zip: Archive, tar: Archive, rar: Archive,
  '7z': Archive, gzip: Archive, text: FileText, json: FileText,
}

function getIcon(type?: string) {
  if (!type) return File
  for (const [k, v] of Object.entries(FILE_ICONS)) {
    if (type.includes(k)) return v
  }
  return File
}

function fmtBytes(b?: number) {
  if (!b) return ''
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(1024))
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user, signOut } = useAuth()

  const [files, setFiles] = useState<FileItem[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [currentFolder, setCurrentFolder] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [activeTab, setActiveTab] = useState<'files' | 'trash'>('files')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [trashedFiles, setTrashedFiles] = useState<FileItem[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [isSudo, setIsSudo] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)

  const token = () => localStorage.getItem('squidoss_token')
  const h = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) })

  useEffect(() => {
    fetch(`${API_URL}/api/v1/cbis/status`, { headers: h() })
      .then(r => r.json()).then(d => setIsSudo(d.isSudo)).catch(() => {})
  }, [])

  const fetchFiles = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      if (activeTab === 'trash') {
        const r = await fetch(`${API_URL}/api/v1/trash`, { headers: h() })
        const d = await r.json()
        setTrashedFiles(d?.files || [])
      } else {
        const fRes = await fetch(`${API_URL}/api/v1/query/files?select=*&filter=is_deleted.false${currentFolder ? `,eq.parent_folder.${currentFolder}` : ',is.parent_folder.null'}&order=created_at.desc.nullslast`, { headers: h() })
        const fData = await fRes.json()
        setFiles(Array.isArray(fData) ? fData : fData?.data || [])

        const folRes = await fetch(`${API_URL}/api/v1/query/folders?select=*&order=name.asc.nullslast`, { headers: h() })
        const folData = await folRes.json()
        const all: FolderItem[] = Array.isArray(folData) ? folData : folData?.data || []
        setFolders(all.filter(f => {
          if (!currentFolder) return !f.parent_folder || f.parent_folder === ''
          return f.parent_folder === currentFolder
        }))
      }
    } catch {}
    setLoading(false)
  }, [user, currentFolder, activeTab])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  const filtered = useMemo(() => {
    if (activeTab === 'trash') return trashedFiles
    if (!searchQuery) return files
    const q = searchQuery.toLowerCase()
    return files.filter(f => f.name.toLowerCase().includes(q))
  }, [files, trashedFiles, searchQuery, activeTab])

  const goTo = (path: string) => { setCurrentFolder(path); setSearchQuery('') }

  const handleUpload = () => uploadRef.current?.click()

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    for (const f of selected) {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('parent_folder', currentFolder)
      try {
        const r = await fetch(`${API_URL}/files/upload`, {
          method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd,
        })
        if (r.ok) { toast({ title: f.name }); fetchFiles() }
      } catch {}
    }
    if (uploadRef.current) uploadRef.current.value = ''
  }

  const handleDelete = async (file: FileItem) => {
    if (!confirm(`Move "${file.name}" to trash?`)) return
    const r = await fetch(`${API_URL}/api/v1/rpc/move_to_trash_secure`, {
      method: 'POST', headers: h(), body: JSON.stringify({ file_uuid: file.id }),
    })
    if (r.ok) { setFiles(p => p.filter(f => f.id !== file.id)); toast({ title: 'Moved to trash' }) }
    else { const e = await r.json(); toast({ title: 'Error', description: e.error, variant: 'destructive' }) }
  }

  const handleRestore = async (file: FileItem) => {
    const r = await fetch(`${API_URL}/api/v1/trash`, {
      method: 'POST', headers: h(), body: JSON.stringify({ action: 'restore', fileId: file.id }),
    })
    if (r.ok) { setTrashedFiles(p => p.filter(f => f.id !== file.id)); toast({ title: 'Restored' }) }
  }

  const handlePermanentDelete = async (file: FileItem) => {
    if (!confirm(`Permanently delete "${file.name}"?`)) return
    const r = await fetch(`${API_URL}/api/v1/trash`, {
      method: 'POST', headers: h(), body: JSON.stringify({ action: 'permanent_delete', fileId: file.id }),
    })
    if (r.ok) { setTrashedFiles(p => p.filter(f => f.id !== file.id)); toast({ title: 'Deleted' }) }
  }

  const handleDownload = async (file: FileItem) => {
    try {
      const r = await fetch(`${API_URL}/files/${file.id}/download`, { headers: h() })
      if (!r.ok) throw new Error()
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = file.name; a.click()
      URL.revokeObjectURL(url)
    } catch { toast({ title: 'Download failed', variant: 'destructive' }) }
  }

  const Breadcrumbs = () => {
    if (!currentFolder) return null
    const parts = currentFolder.split('/').filter(Boolean)
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <button onClick={() => goTo('')} className="hover:text-foreground"><Home className="w-3 h-3" /></button>
        {parts.map((p, i) => {
          const path = parts.slice(0, i + 1).join('/')
          return (
            <React.Fragment key={path}>
              <ChevronRight className="w-2.5 h-2.5" />
              <button onClick={() => i < parts.length - 1 && goTo(path)}
                className={i === parts.length - 1 ? 'text-foreground font-medium cursor-default' : 'hover:text-foreground'}>
                {p}
              </button>
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  const FileCard = ({ file, inTrash }: { file: FileItem; inTrash?: boolean }) => {
    const Icon = getIcon(file.type)
    const isImage = file.type?.startsWith('image/')
    return (
      <div className="group relative rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm hover:bg-card/80 hover:border-primary/20 transition-all overflow-hidden">
        {isImage && file.storage_path ? (
          <div className="h-32 bg-muted/30 overflow-hidden">
            <img src={`${API_URL}/files/${file.id}/download`} alt={file.name}
              className="w-full h-full object-cover" loading="lazy"
              onError={e => { (e.target as HTMLElement).style.display = 'none' }} />
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center bg-gradient-to-b from-accent/10 to-accent/5">
            <Icon className="w-12 h-12 text-muted-foreground/40" />
          </div>
        )}
        <div className="p-3 space-y-1">
          <p className="text-sm truncate font-medium" title={file.name}>{file.name}</p>
          <p className="text-[10px] text-muted-foreground">{fmtBytes(file.size)}</p>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2 gap-1">
          {inTrash ? (
            <>
              <button onClick={() => handleRestore(file)} className="p-1.5 rounded-md bg-background/80 hover:bg-background text-xs">Restore</button>
              <button onClick={() => handlePermanentDelete(file)} className="p-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-xs text-red-400">Delete</button>
            </>
          ) : (
            <>
              <button onClick={() => handleDownload(file)} className="p-1.5 rounded-md bg-background/80 hover:bg-background"><Download className="w-3.5 h-3.5" /></button>
              <button onClick={() => handleDelete(file)} className="p-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </>
          )}
        </div>
      </div>
    )
  }

  const sidebarW = sidebarCollapsed ? 'w-14' : 'w-48'

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarW} border-r border-border/20 bg-card/30 backdrop-blur-xl flex flex-col transition-all duration-200 shrink-0`}>
        <div className="flex items-center h-12 px-3 border-b border-border/10">
          <div className={`flex items-center gap-2 ${sidebarCollapsed && 'justify-center w-full'}`}>
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">S</span>
            </div>
            {!sidebarCollapsed && <span className="text-sm font-semibold">SquidOSS</span>}
          </div>
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className={`p-1 text-muted-foreground hover:text-foreground ${sidebarCollapsed ? 'ml-0' : 'ml-auto'}`}>
            {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          <button onClick={() => { setActiveTab('files'); setCurrentFolder('') }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
              activeTab === 'files' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            } ${sidebarCollapsed && 'justify-center px-0'}`}>
            <Home className="w-4 h-4 shrink-0" /> {!sidebarCollapsed && 'Files'}
          </button>
          <button onClick={() => setActiveTab('trash')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
              activeTab === 'trash' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            } ${sidebarCollapsed && 'justify-center px-0'}`}>
            <Trash2 className="w-4 h-4 shrink-0" /> {!sidebarCollapsed && 'Trash'}
          </button>
        </nav>

        <div className="p-2 border-t border-border/10 space-y-1">
          {isSudo && (
            <button onClick={() => navigate('/admin/dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-amber-400 hover:bg-amber-500/10 transition-all ${sidebarCollapsed && 'justify-center px-0'}`}>
              <Shield className="w-4 h-4 shrink-0" /> {!sidebarCollapsed && 'Admin'}
            </button>
          )}
          <button onClick={() => navigate('/settings/account')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all ${sidebarCollapsed && 'justify-center px-0'}`}>
            <Settings className="w-4 h-4 shrink-0" /> {!sidebarCollapsed && 'Settings'}
          </button>
          <button onClick={signOut}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-all ${sidebarCollapsed && 'justify-center px-0'}`}>
            <LogOut className="w-4 h-4 shrink-0" /> {!sidebarCollapsed && 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 h-12 px-4 border-b border-border/20 bg-background/80 backdrop-blur-xl shrink-0">
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 h-8 w-48 rounded-lg bg-accent/20 border border-border/20 text-xs focus:outline-none focus:border-primary/30"
              />
            </div>
            <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50">
              {viewMode === 'grid' ? '☰' : '⊞'}
            </button>
            <Button size="sm" className="text-xs h-8 gap-1.5 rounded-lg" onClick={handleUpload}>
              <Upload className="w-3.5 h-3.5" /> Upload
            </Button>
            <input ref={uploadRef} type="file" multiple className="hidden" onChange={onFileSelect} />
            <button onClick={fetchFiles} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : activeTab === 'files' && filtered.length === 0 && folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                <Upload className="w-10 h-10 text-primary/40" />
              </div>
              <div>
                <p className="text-lg font-medium">No files yet</p>
                <p className="text-sm text-muted-foreground">Upload your first file to get started</p>
              </div>
              <Button onClick={handleUpload} className="gap-2 rounded-xl">
                <Upload className="w-4 h-4" /> Upload Files
              </Button>
            </div>
          ) : activeTab === 'trash' && trashedFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
              <Trash2 className="w-12 h-12 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">Trash is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Folders */}
              {activeTab === 'files' && folders.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Folders</p>
                  <div className={viewMode === 'grid'
                    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'
                    : 'space-y-1'}>
                    {folders.map(f => (
                      <button key={f.id} onClick={() => goTo(f.path)}
                        className={`flex items-center gap-3 rounded-xl border border-border/20 bg-card/30 hover:bg-card/60 hover:border-primary/20 transition-all ${
                          viewMode === 'grid' ? 'p-4 flex-col text-center' : 'p-3 text-left'
                        }`}>
                        <Folder className={`${viewMode === 'grid' ? 'w-10 h-10' : 'w-5 h-5'} text-primary/60`} />
                        <p className="text-sm truncate font-medium">{f.name}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Files */}
              {filtered.length > 0 && (
                <div>
                  {activeTab === 'files' && folders.length > 0 && (
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 mt-6">Files</p>
                  )}
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {filtered.map(f => (
                        <FileCard key={f.id} file={f} inTrash={activeTab === 'trash'} />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filtered.map(f => {
                        const Icon = getIcon(f.type)
                        return (
                          <div key={f.id}
                            className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border/10 bg-card/20 hover:bg-card/40 transition-all group">
                            <Icon className="w-5 h-5 text-muted-foreground/50 shrink-0" />
                            <p className="flex-1 text-sm truncate">{f.name}</p>
                            <p className="text-xs text-muted-foreground">{fmtBytes(f.size)}</p>
                            {activeTab === 'trash' ? (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleRestore(f)} className="p-1 rounded hover:bg-accent/50 text-xs">Restore</button>
                                <button onClick={() => handlePermanentDelete(f)} className="p-1 rounded hover:bg-red-500/10 text-xs text-red-400">Delete</button>
                              </div>
                            ) : (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleDownload(f)} className="p-1 rounded hover:bg-accent/50"><Download className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDelete(f)} className="p-1 rounded hover:bg-red-500/10 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
