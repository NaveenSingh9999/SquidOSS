import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search, Upload, Folder, File, Trash2, Home, ChevronRight,
  Download, Settings, RefreshCw, LogOut, PanelLeft, PanelLeftClose,
  Image, Video, Music, FileText, Archive, Shield, Plus, X,
  Loader2, CheckCircle, XCircle, Clock, ArrowLeft,
  LayoutGrid, LayoutList, Lock, Share2, MoreVertical,
} from '@/lib/icon-map'
import FileCard from '@/components/FileCard'
import { EnterpriseFolderCard } from '@/components/ui/EnterpriseFolderCard'
import { API_URL } from '@/lib/api-url'

const token = () => localStorage.getItem('squidoss_token')
const h = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) })

interface FileItem {
  id: string; name: string; type?: string; size?: number; created_at: string
  encrypted?: boolean; storage_path?: string; user_id?: string
  is_deleted?: boolean; parent_folder?: string | null
}

interface FolderItem {
  id: string; name: string; path: string; created_at: string
  parent_folder?: string | null
}

  interface ProgressTask {
    id: string; name: string; progress: number; status: 'uploading' | 'downloading' | 'complete' | 'error'
    size?: number; error?: string; speed?: number; eta?: number; startTime?: number
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

function getIconColor(type?: string): string {
  if (!type) return 'text-muted-foreground'
  if (type.startsWith('image/')) return 'text-rose-500'
  if (type.startsWith('video/')) return 'text-violet-500'
  if (type.startsWith('audio/')) return 'text-emerald-500'
  if (type.includes('pdf')) return 'text-red-500'
  if (type.includes('zip') || type.includes('tar') || type.includes('rar')) return 'text-amber-500'
  if (type.startsWith('text/') || type.includes('json')) return 'text-sky-500'
  return 'text-muted-foreground'
}

function fmtBytes(b?: number) {
  if (!b) return ''
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(1024))
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(date).toLocaleDateString()
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
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [fullSearch, setFullSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [isSudo, setIsSudo] = useState(false)
  const [progressTasks, setProgressTasks] = useState<ProgressTask[]>([])
  const [showProgress, setShowProgress] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const uploadMenuRef = useRef<HTMLDivElement>(null)
  const progressIdCounter = useRef(0)

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

  const addProgress = (name: string, status: ProgressTask['status'] = 'uploading', size?: number) => {
    const id = `task_${++progressIdCounter.current}`
    setProgressTasks(prev => [...prev, { id, name, progress: 0, status, size }])
    setShowProgress(true)
    return id
  }

  const updateProgress = (id: string, progress: number, status?: ProgressTask['status']) => {
    setProgressTasks(prev => prev.map(t => t.id === id ? { ...t, progress, ...(status ? { status } : {}) } : t))
  }

  const removeProgress = (id: string) => {
    setProgressTasks(prev => prev.filter(t => t.id !== id))
  }

  const formatSpeed = (bytesPerSec: number): string => {
    if (!bytesPerSec) return ''
    const u = ['B/s', 'KB/s', 'MB/s', 'GB/s']
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(1024))
    return `${(bytesPerSec / Math.pow(1024, i)).toFixed(1)} ${u[i]}`
  }

  const formatEta = (seconds: number): string => {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return ''
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  const uploadWithProgress = async (file: File, parentFolder: string) => {
    const taskId = addProgress(file.name, 'uploading', file.size)
    const startTime = Date.now()
    return new Promise<void>((resolve, reject) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('parent_folder', parentFolder)

      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          const elapsed = (Date.now() - startTime) / 1000
          const speed = elapsed > 0 ? e.loaded / elapsed : 0
          const remaining = e.total - e.loaded
          const eta = speed > 0 ? remaining / speed : 0
          updateProgress(taskId, pct, 'uploading')
          setProgressTasks(prev => prev.map(t => t.id === taskId ? { ...t, speed, eta } : t))
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          updateProgress(taskId, 100, 'complete')
          toast({ title: file.name })
          setTimeout(() => removeProgress(taskId), 3000)
          resolve()
        } else {
          updateProgress(taskId, 0, 'error')
          reject(new Error(`Upload failed: ${xhr.status}`))
        }
      }
      xhr.onerror = () => {
        updateProgress(taskId, 0, 'error')
        reject(new Error('Network error'))
      }
      xhr.open('POST', `${API_URL}/files/upload`)
      xhr.setRequestHeader('Authorization', `Bearer ${token()}`)
      xhr.send(fd)
    })
  }

  const downloadWithProgress = async (file: FileItem) => {
    const taskId = addProgress(file.name, 'downloading', file.size)
    const startTime = Date.now()
    try {
      const xhr = new XMLHttpRequest()
      xhr.responseType = 'blob'
      xhr.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          const elapsed = (Date.now() - startTime) / 1000
          const speed = elapsed > 0 ? e.loaded / elapsed : 0
          const remaining = e.total - e.loaded
          const eta = speed > 0 ? remaining / speed : 0
          updateProgress(taskId, pct, 'downloading')
          setProgressTasks(prev => prev.map(t => t.id === taskId ? { ...t, speed, eta } : t))
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          updateProgress(taskId, 100, 'complete')
          const blob = xhr.response
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = file.name; a.click()
          URL.revokeObjectURL(url)
          setTimeout(() => removeProgress(taskId), 3000)
        } else {
          updateProgress(taskId, 0, 'error')
        }
      }
      xhr.onerror = () => {
        updateProgress(taskId, 0, 'error')
        toast({ title: 'Download failed', variant: 'destructive' })
      }
      xhr.open('GET', `${API_URL}/files/${file.id}/download`)
      xhr.setRequestHeader('Authorization', `Bearer ${token()}`)
      xhr.send()
    } catch {
      updateProgress(taskId, 0, 'error')
      toast({ title: 'Download failed', variant: 'destructive' })
    }
  }

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    setUploadMenuOpen(false)
    for (const f of selected) {
      try {
        await uploadWithProgress(f, currentFolder)
        fetchFiles()
      } catch (e: any) {
        toast({ title: 'Upload failed', description: e.message, variant: 'destructive' })
      }
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

  const handleCreateFolder = async () => {
    const name = prompt('Folder name:')
    if (!name?.trim()) return
    try {
      const r = await fetch(`${API_URL}/api/v1/folders`, {
        method: 'POST', headers: h(),
        body: JSON.stringify({ name: name.trim(), parent_folder: currentFolder || null }),
      })
      if (r.ok) { toast({ title: 'Folder created' }); fetchFiles() }
      else { const e = await r.json(); toast({ title: 'Error', description: e.error, variant: 'destructive' }) }
    } catch { toast({ title: 'Error', variant: 'destructive' }) }
    setUploadMenuOpen(false)
  }

  const handleCreateFile = async () => {
    const name = prompt('File name:')
    if (!name?.trim()) return
    try {
      const blob = new Blob([''], { type: 'text/plain' })
      const fd = new FormData()
      fd.append('file', blob, name.trim())
      fd.append('parent_folder', currentFolder)
      const r = await fetch(`${API_URL}/files/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd,
      })
      if (r.ok) { toast({ title: 'File created' }); fetchFiles() }
      else { const e = await r.json(); toast({ title: 'Error', description: e.error, variant: 'destructive' }) }
    } catch { toast({ title: 'Error', variant: 'destructive' }) }
    setUploadMenuOpen(false)
  }

  const runFullSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/query/files?select=*&filter=is_deleted.false,like.name.${encodeURIComponent(`%${q}%`)}&limit=20`, { headers: h() })
      const data = await res.json()
      setSearchResults(Array.isArray(data) ? data : data?.data || [])
    } catch {}
    setSearching(false)
  }, [])

  const debounceRef = useRef<any>(null)
  const onFullSearchChange = (q: string) => {
    setFullSearch(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runFullSearch(q), 300)
  }

  const openFullSearch = () => {
    setSearchOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 100)
  }

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target as Node)) {
        setUploadMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const Breadcrumbs = () => {
    if (!currentFolder) return null
    const parts = currentFolder.split('/').filter(Boolean)
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <button onClick={() => goTo('')} className="hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent/50 transition-all">
          <Home className="w-3.5 h-3.5" />
        </button>
        {parts.map((p, i) => {
          const path = parts.slice(0, i + 1).join('/')
          const isLast = i === parts.length - 1
          return (
            <React.Fragment key={path}>
              <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              <button onClick={() => !isLast && goTo(path)}
                className={`px-2 py-1 rounded-lg transition-all text-sm ${
                  isLast ? 'text-foreground font-medium cursor-default bg-primary/10' : 'hover:text-foreground hover:bg-accent/50'
                }`}>
                {p}
              </button>
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  const sidebarW = sidebarCollapsed ? 'w-14' : 'w-48'
  const activeTasks = progressTasks.filter(t => t.status === 'uploading' || t.status === 'downloading')
  const hasActiveTasks = activeTasks.length > 0

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarW} border-r border-border/20 bg-card/30 flex flex-col transition-all duration-200 shrink-0`}>
        <div className="flex items-center h-12 px-3 border-b border-border/10">
          {sidebarCollapsed ? (
            <button onClick={() => setSidebarCollapsed(false)} className="mx-auto p-1 text-muted-foreground hover:text-foreground">
              <PanelLeft className="w-4 h-4" />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">S</span>
                </div>
                <span className="text-sm font-semibold truncate">SquidOSS</span>
              </div>
              <button onClick={() => setSidebarCollapsed(true)} className="ml-auto p-1 text-muted-foreground hover:text-foreground shrink-0">
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </>
          )}
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
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all ${sidebarCollapsed && 'justify-center px-0'}`}>
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
        <header className="flex items-center gap-3 h-12 px-4 border-b border-border/20 bg-background shrink-0">
          <Breadcrumbs />

          {searchOpen && (
            <div className="fixed inset-0 z-50 bg-background/80" onClick={() => setSearchOpen(false)}>
              <div className="max-w-xl mx-auto mt-24 p-4" onClick={e => e.stopPropagation()}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input ref={searchInputRef} type="text" placeholder="Search files and folders..."
                    value={fullSearch} onChange={e => onFullSearchChange(e.target.value)}
                    className="w-full pl-10 pr-10 h-12 rounded-xl border border-border/30 bg-background text-sm focus:outline-none focus:border-primary/30 shadow-lg" autoFocus />
                  <button onClick={() => setSearchOpen(false)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {searching && <div className="mt-2 text-xs text-muted-foreground text-center">Searching...</div>}
                {!searching && searchResults.length > 0 && (
                  <div className="mt-2 rounded-xl border border-border/20 bg-background shadow-lg overflow-hidden max-h-80 overflow-y-auto">
                    <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/10">Files</div>
                    {searchResults.map(f => {
                      const Icon = getIcon(f.type)
                      return (
                        <button key={f.id} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/20 text-left transition-colors"
                          onClick={() => { setSearchOpen(false); setCurrentFolder(f.parent_folder || '') }}>
                          <Icon className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                          <span className="text-sm truncate">{f.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {!searching && fullSearch && searchResults.length === 0 && <div className="mt-2 text-xs text-muted-foreground text-center">No results</div>}
                {!fullSearch && (
                  <div className="mt-4 text-xs text-muted-foreground text-center space-y-1">
                    <p>Search across files and folders</p>
                    <p className="text-[10px] text-muted-foreground/60">Press Esc to close</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button onClick={openFullSearch}
              className="flex items-center gap-2 px-3 h-8 rounded-lg bg-accent/10 border border-border/20 text-xs text-muted-foreground hover:text-foreground hover:border-border/40 transition-all">
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search...</span>
              <kbd className="hidden sm:inline text-[10px] text-muted-foreground/40 border border-border/20 rounded px-1">⌘K</kbd>
            </button>
            <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
              title={viewMode === 'grid' ? 'List view' : 'Grid view'}>
              {viewMode === 'grid' ? <LayoutList className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
            </button>
            <div className="relative" ref={uploadMenuRef}>
              <Button size="sm" className="text-xs h-8 gap-1.5 rounded-lg" onClick={() => setUploadMenuOpen(!uploadMenuOpen)}>
                <Plus className="w-3.5 h-3.5" /> New
              </Button>
              {uploadMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border/20 bg-background shadow-lg z-40 overflow-hidden">
                  <button onClick={() => uploadRef.current?.click()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent/20 transition-colors text-left">
                    <Upload className="w-4 h-4 text-muted-foreground" /> Upload Files
                  </button>
                  <button onClick={handleCreateFolder}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent/20 transition-colors text-left">
                    <Folder className="w-4 h-4 text-muted-foreground" /> Create Folder
                  </button>
                  <button onClick={handleCreateFile}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent/20 transition-colors text-left">
                    <File className="w-4 h-4 text-muted-foreground" /> Create File
                  </button>
                </div>
              )}
            </div>
            <input ref={uploadRef} type="file" multiple className="hidden" onChange={onFileSelect} />
            <button onClick={fetchFiles} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 relative">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : activeTab === 'files' && filtered.length === 0 && folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="w-16 h-16 rounded-xl bg-accent/10 flex items-center justify-center">
                <Upload className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-lg font-medium">No files yet</p>
                <p className="text-sm text-muted-foreground">Upload your first file to get started</p>
              </div>
              <Button onClick={() => uploadRef.current?.click()} className="gap-2 rounded-xl">
                <Upload className="w-4 h-4" /> Upload Files
              </Button>
            </div>
          ) : activeTab === 'trash' && trashedFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
              <Trash2 className="w-12 h-12 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">Trash is empty</p>
            </div>
          ) : (
            <div className="space-y-6">
              {activeTab === 'files' && folders.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Folders</p>
                  <div className={viewMode === 'grid'
                    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'
                    : 'space-y-1'}>
                    {folders.map(f => (
                      <EnterpriseFolderCard
                        key={f.id}
                        folder={f}
                        viewMode={viewMode}
                        onOpen={() => goTo(f.path)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {filtered.length > 0 && (
                <div>
                  {activeTab === 'files' && folders.length > 0 && (
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 mt-2">Files</p>
                  )}
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {filtered.map(f => (
                        <FileCard
                          key={f.id}
                          file={f}
                          viewMode={viewMode}
                          onDownload={() => downloadWithProgress(f)}
                          onDelete={() => activeTab === 'trash' ? handlePermanentDelete(f) : handleDelete(f)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filtered.map(f => (
                        <FileCard
                          key={f.id}
                          file={f}
                          viewMode={viewMode}
                          onDownload={() => downloadWithProgress(f)}
                          onDelete={() => activeTab === 'trash' ? handlePermanentDelete(f) : handleDelete(f)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress Panel */}
      {progressTasks.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] bg-background/95 backdrop-blur-xl border rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button onClick={() => setShowProgress(!showProgress)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-b border-border/10 hover:bg-accent/20 transition-colors">
            <div className="flex items-center gap-2">
              <div className={`p-1 rounded-lg ${hasActiveTasks ? 'bg-primary/10 text-primary' : 'bg-emerald-500/10 text-emerald-500'}`}>
                {hasActiveTasks ? (
                  <Upload className="w-3.5 h-3.5 animate-pulse" weight="light" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5" weight="light" />
                )}
              </div>
              <div className="text-left">
                <span className="text-sm font-medium">
                  {hasActiveTasks ? `${activeTasks.length} Active Transfer${activeTasks.length > 1 ? 's' : ''}` : 'Transfers Complete'}
                </span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground transition-transform duration-200" style={{ transform: showProgress ? 'rotate(180deg)' : 'none' }}>▼</span>
          </button>
          {showProgress && (
            <div className="max-h-72 overflow-y-auto p-2 space-y-1.5 animate-in fade-in duration-200">
              {progressTasks.map(task => {
                const isActive = task.status === 'uploading' || task.status === 'downloading'
                const isError = task.status === 'error'
                const isComplete = task.status === 'complete'
                return (
                  <div key={task.id} className={`p-2.5 rounded-lg border transition-all duration-200 ${
                    isError ? 'bg-destructive/5 border-destructive/30' :
                    isComplete ? 'bg-emerald-500/5 border-emerald-500/30' :
                    'bg-card/50 border-border/20 hover:bg-card/80'
                  }`}>
                    <div className="flex items-start gap-2.5">
                      <div className={`p-1.5 rounded-lg shrink-0 ${
                        isComplete ? 'bg-emerald-500/10 text-emerald-500' :
                        isError ? 'bg-destructive/10 text-destructive' :
                        task.status === 'uploading' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-purple-500/10 text-purple-500'
                      }`}>
                        {isComplete ? <CheckCircle className="w-3.5 h-3.5" weight="light" /> :
                         isError ? <XCircle className="w-3.5 h-3.5" weight="light" /> :
                         task.status === 'uploading' ? <Upload className="w-3.5 h-3.5" weight="light" /> :
                         <Download className="w-3.5 h-3.5" weight="light" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate" title={task.name}>{task.name}</span>
                          <span className={`text-[10px] font-medium shrink-0 ${
                            isComplete ? 'text-emerald-500' :
                            isError ? 'text-destructive' :
                            isActive ? 'text-primary' : 'text-muted-foreground'
                          }`}>
                            {isComplete ? 'Complete' : isError ? 'Failed' : `${task.progress}%`}
                          </span>
                        </div>
                        {isActive && (
                          <>
                            <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-300 ${
                                task.status === 'uploading' ? 'bg-blue-500' : 'bg-purple-500'
                              }`} style={{ width: `${task.progress}%` }} />
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>{fmtBytes(task.size || 0)}</span>
                              {task.speed && task.speed > 0 && (
                                <>
                                  <span>·</span>
                                  <span>{formatSpeed(task.speed)}</span>
                                </>
                              )}
                              {task.eta && task.eta > 0 && (
                                <>
                                  <span>·</span>
                                  <span>ETA: {formatEta(task.eta)}</span>
                                </>
                              )}
                            </div>
                          </>
                        )}
                        {isError && task.error && (
                          <p className="text-[10px] text-destructive mt-0.5 truncate">{task.error}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {!hasActiveTasks && (
                <button onClick={() => setProgressTasks([])}
                  className="w-full text-[10px] text-muted-foreground hover:text-foreground text-center py-2 transition-colors border-t border-border/10 mt-1">
                  Clear completed
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
