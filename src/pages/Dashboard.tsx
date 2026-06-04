import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { cn, formatFileSize } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import EnhancedInstantPreviewModal from '@/components/EnhancedInstantPreviewModal'
import {
  Search, Grid3X3, List, Upload, Folder, File, Trash2,
  Home, ChevronRight, ArrowLeft, Download, LogOut,
  Settings, HardDrive, RefreshCw, Plus, Image, Video, Music,
  FileText, Archive, Lock, PanelLeft, PanelLeftClose, Github,
  Database, Globe, Box, User, ChevronsUpDown, Server, X,
} from '@/lib/icon-map'
const API_URL = (() => {
  if (import.meta.env.VITE_SQUIDOSS_API_URL) return import.meta.env.VITE_SQUIDOSS_API_URL
  if (typeof window !== 'undefined' && window.location.hostname.includes('app.github.dev')) {
    return window.location.origin.replace(':8080', ':3000').replace(/-8080\./, '-3000.')
  }
  return 'http://localhost:3000'
})().replace(/\/+$/, '')

interface FileItem {
  id: string; name: string; type?: string; size?: number; created_at: string
  encrypted?: boolean; storage_path?: string; user_id?: string
  is_deleted?: boolean; parent_folder?: string | null; shared?: boolean
}

interface FolderItem {
  id: string; name: string; path: string; created_at: string
  parent_folder?: string | null; user_id?: string
}

interface StorageProvider {
  id: string; provider_type: string; is_default: boolean; created_at: string
}

interface ProviderContextValue {
  activeProvider: StorageProvider | null
  providers: StorageProvider[]
  setActiveProvider: (p: StorageProvider) => void
  refreshProviders: () => void
}

const ProviderCtx = createContext<ProviderContextValue>({
  activeProvider: null, providers: [],
  setActiveProvider: () => {}, refreshProviders: () => {},
})
export const useProvider = () => useContext(ProviderCtx)

const PROVIDER_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  github: Github, local: HardDrive, r2: Globe, s3: Box,
}

function getFileIcon(type?: string) {
  if (!type) return FileText
  if (type.startsWith('image/')) return Image
  if (type.startsWith('video/')) return Video
  if (type.startsWith('audio/')) return Music
  if (type.includes('zip') || type.includes('tar') || type.includes('rar') || type.includes('gzip') || type.includes('7z')) return Archive
  if (type.includes('pdf') || type.startsWith('text/') || type.includes('json') || type.includes('javascript')) return FileText
  return File
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
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [activeTab, setActiveTab] = useState<'files' | 'trash'>('files')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [trashedFiles, setTrashedFiles] = useState<FileItem[]>([])

  const [providers, setProviders] = useState<StorageProvider[]>([])
  const [activeProvider, setActiveProvider] = useState<StorageProvider | null>(null)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFileName, setNewFileName] = useState('')
  const [newFileContent, setNewFileContent] = useState('')
  const [dialogMode, setDialogMode] = useState<'picker' | 'folder' | 'file'>('picker')

  const token = () => localStorage.getItem('squidoss_token')
  const headers = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) })

  const refreshProviders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/providers`, { headers: headers() })
      const data = await res.json()
      const list: StorageProvider[] = data?.providers || []
      setProviders(list)
      if (!activeProvider && list.length > 0) {
        setActiveProvider(list[0])
      }
    } catch {}
  }, [activeProvider])

  useEffect(() => { refreshProviders() }, [])

  const fetchFiles = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      if (activeTab === 'trash') {
        const tRes = await fetch(`${API_URL}/api/v1/trash`, { headers: headers() })
        const tData = await tRes.json()
        setTrashedFiles(tData?.files || [])
      } else {
        const fRes = await fetch(`${API_URL}/api/v1/query/files?select=*&filter=is_deleted.false${currentFolder ? `,eq.parent_folder.${currentFolder}` : ',is.parent_folder.null'}&order=created_at.desc.nullslast`, { headers: headers() })
        const fData = await fRes.json()
        setFiles(Array.isArray(fData) ? fData : fData?.data || [])

        const folRes = await fetch(`${API_URL}/api/v1/query/folders?select=*&order=created_at.desc.nullslast`, { headers: headers() })
        const folData = await folRes.json()
        const allFolders: FolderItem[] = Array.isArray(folData) ? folData : folData?.data || []
        const filtered = allFolders.filter(f => {
          if (!currentFolder) return !f.parent_folder || f.parent_folder === ''
          return f.parent_folder === currentFolder
        })
        setFolders(filtered)
      }
    } catch (e: any) {
      console.error('fetch error', e)
    }
    setLoading(false)
  }, [user, currentFolder, activeTab])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  const filteredFiles = useMemo(() => {
    if (activeTab === 'trash') return trashedFiles
    if (!searchQuery) return files
    const q = searchQuery.toLowerCase()
    return files.filter(f => f.name.toLowerCase().includes(q))
  }, [files, trashedFiles, searchQuery, activeTab])

  const handleNavigate = (path: string) => {
    setCurrentFolder(path)
    setSearchQuery('')
    setActiveTab('files')
  }

  const handleGoBack = () => {
    if (!currentFolder) return
    const parts = currentFolder.split('/').filter(Boolean)
    parts.pop()
    handleNavigate(parts.join('/'))
  }

  const handleDelete = async (file: FileItem) => {
    if (!confirm(`Move "${file.name}" to trash?`)) return
    const res = await fetch(`${API_URL}/api/v1/rpc/move_to_trash_secure`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ file_uuid: file.id }),
    })
    if (res.ok) {
      setFiles(prev => prev.filter(f => f.id !== file.id))
      toast({ title: 'Moved to trash' })
    } else {
      const err = await res.json()
      toast({ title: 'Error', description: err.error || 'Delete failed', variant: 'destructive' })
    }
  }

  const handlePermanentDelete = async (file: FileItem) => {
    if (!confirm(`Permanently delete "${file.name}"? This cannot be undone.`)) return
    const res = await fetch(`${API_URL}/api/v1/trash`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ action: 'permanent_delete', fileId: file.id }),
    })
    if (res.ok) {
      setTrashedFiles(prev => prev.filter(f => f.id !== file.id))
      toast({ title: 'Permanently deleted' })
    } else {
      const err = await res.json()
      toast({ title: 'Error', description: err.error || 'Delete failed', variant: 'destructive' })
    }
  }

  const handleRestore = async (file: FileItem) => {
    const res = await fetch(`${API_URL}/api/v1/trash`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ action: 'restore', fileId: file.id }),
    })
    if (res.ok) {
      setTrashedFiles(prev => prev.filter(f => f.id !== file.id))
      toast({ title: 'Restored' })
    } else {
      const err = await res.json()
      toast({ title: 'Error', description: err.error || 'Restore failed', variant: 'destructive' })
    }
  }

  const handleDownload = async (file: FileItem) => {
    try {
      const res = await fetch(`${API_URL}/files/${file.id}/download`, { headers: headers() })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = file.name; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast({ title: 'Download failed', description: e.message, variant: 'destructive' })
    }
  }

  const handleUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = async () => {
      const selectedFiles = Array.from(input.files || [])
      for (const f of selectedFiles) {
        const formData = new FormData()
        formData.append('file', f)
        formData.append('parent_folder', currentFolder || '')
        try {
          const res = await fetch(`${API_URL}/files/upload`, {
            method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: formData,
          })
          if (res.ok) {
            toast({ title: 'Uploaded', description: f.name })
            fetchFiles()
          }
        } catch {}
      }
    }
    input.click()
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      const res = await fetch(`${API_URL}/api/v1/folders`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ name: newFolderName.trim(), parent_folder: currentFolder || null }),
      })
      if (res.ok) {
        toast({ title: 'Folder created', description: newFolderName.trim() })
        setNewFolderName('')
        fetchFiles()
      } else {
        const err = await res.json()
        toast({ title: 'Error', description: err.error || 'Failed to create folder', variant: 'destructive' })
      }
    } catch {}
  }

  const previewAdjacents = useMemo(() => {
    const list = activeTab === 'trash' ? trashedFiles : filteredFiles
    if (!previewFile) return { previous: null, next: null }
    const i = list.findIndex(f => f.id === previewFile.id)
    return {
      previous: i > 0 ? list[i - 1] : null,
      next: i < list.length - 1 ? list[i + 1] : null,
    }
  }, [previewFile, filteredFiles, trashedFiles, activeTab])

  const breadcrumbs = () => {
    if (activeTab === 'trash' || !currentFolder) return null
    const parts = currentFolder.split('/').filter(Boolean)
    return (
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <button onClick={() => handleNavigate('')} className="hover:text-foreground"><Home className="w-3.5 h-3.5" /></button>
        {parts.map((part, i) => {
          const path = parts.slice(0, i + 1).join('/')
          const isLast = i === parts.length - 1
          return (
            <React.Fragment key={path}>
              <ChevronRight className="w-3 h-3" />
              <button onClick={() => !isLast && handleNavigate(path)}
                className={isLast ? 'text-foreground font-medium cursor-default' : 'hover:text-foreground'}>
                {part}
              </button>
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  const providerIcon = (type: string) => {
    const Icon = PROVIDER_ICONS[type] || Database
    return <Icon className="w-4 h-4" />
  }

  const NavItem = ({ id, label, icon: Icon, badge }: { id: string; label: string; icon: any; badge?: number }) => (
    <button onClick={() => { setActiveTab(id as any); setCurrentFolder('') }}
      className={cn(
        'group relative flex w-full items-center gap-2.5 px-2 h-9 rounded-lg text-sm transition-all',
        activeTab === id
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
        sidebarCollapsed && 'justify-center px-0 h-10 w-10 mx-auto',
      )} title={sidebarCollapsed ? label : undefined}>
      <icon className="w-4 h-4 flex-shrink-0" weight={activeTab === id ? 'fill' : 'regular'} />
      {!sidebarCollapsed && <span className="flex-1 text-left text-[13px]">{label}</span>}
      {!sidebarCollapsed && badge !== undefined && badge > 0 && (
        <Badge variant="secondary" className="h-5 min-w-[20px] px-1 text-[10px]">{badge}</Badge>
      )}
    </button>
  )

  const previewList = activeTab === 'trash' ? trashedFiles : filteredFiles

  return (
    <ProviderCtx.Provider value={{ activeProvider, providers, setActiveProvider, refreshProviders }}>
      <div className="h-screen flex bg-background">
        {/* Sidebar */}
        <aside className={cn(
          'flex-shrink-0 h-full border-r border-border/30 bg-card flex flex-col transition-all duration-200 z-30',
          sidebarCollapsed ? 'w-[56px]' : 'w-[200px]',
        )}>
          {/* Logo + collapse */}
          <div className={cn('flex items-center h-12 border-b border-border/30 flex-shrink-0', sidebarCollapsed ? 'justify-center' : 'justify-between px-3')}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                  <Server className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <span className="text-sm font-semibold">SquidOSS</span>
              </div>
            )}
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50 transition-colors"
              title={sidebarCollapsed ? 'Expand' : 'Collapse'}>
              {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
            <NavItem id="files" label="Files" icon={Folder} />
            <NavItem id="trash" label="Trash" icon={Trash2} badge={trashedFiles.length} />

            {!sidebarCollapsed && <div className="h-2" />}

            {/* Storage Providers section */}
            {!sidebarCollapsed && (
              <div className="px-2 pt-3 pb-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">Storage</p>
              </div>
            )}
            {providers.length === 0 ? (
              <button onClick={() => navigate('/settings/providers')}
                className={cn(
                  'flex items-center gap-2.5 px-2 h-8 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 w-full transition-all',
                  sidebarCollapsed && 'justify-center px-0 h-9 w-9 mx-auto',
                )} title="Add provider">
                <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                {!sidebarCollapsed && <span>Add Provider</span>}
              </button>
            ) : (
              providers.map(p => (
                <button key={p.id} onClick={() => setActiveProvider(p)}
                  className={cn(
                    'flex items-center gap-2.5 px-2 h-8 rounded-lg text-xs w-full transition-all',
                    activeProvider?.id === p.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    sidebarCollapsed && 'justify-center px-0 h-9 w-9 mx-auto',
                  )} title={sidebarCollapsed ? p.provider_type : undefined}>
                  {providerIcon(p.provider_type)}
                  {!sidebarCollapsed && (
                    <span className="truncate flex-1 text-left capitalize">{p.provider_type}</span>
                  )}
                </button>
              ))
            )}
          </nav>

          {/* Bottom area */}
          <div className="border-t border-border/30 p-2 space-y-1">
            <button onClick={() => navigate('/settings/account')}
              className={cn(
                'flex items-center gap-2.5 px-2 h-8 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 w-full transition-all',
                sidebarCollapsed && 'justify-center px-0 h-9 w-9 mx-auto',
              )} title="Settings">
              <Settings className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span>Settings</span>}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn(
                  'flex items-center gap-2.5 w-full rounded-lg transition-all hover:bg-accent/50',
                  sidebarCollapsed ? 'justify-center h-9 w-9 mx-auto' : 'px-2 h-10',
                )}>
                  <div className="w-7 h-7 rounded-md bg-accent border border-border/40 flex items-center justify-center text-[10px] font-semibold text-foreground flex-shrink-0">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  {!sidebarCollapsed && (
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[11px] font-medium truncate">{user?.email?.split('@')[0]}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{user?.email}</p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={sidebarCollapsed ? 'center' : 'end'} side="top" sideOffset={8} className="w-52 border border-border/40 bg-card/95 p-1.5">
                <div className="px-2 py-1.5 border-b border-border/30 mb-1">
                  <p className="text-[13px] font-medium truncate">{user?.email?.split('@')[0]}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuItem className="gap-2 py-1.5 text-xs cursor-pointer" onClick={() => navigate('/settings/account')}>
                  <User className="w-4 h-4" /> Account
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 py-1.5 text-xs cursor-pointer" onClick={() => navigate('/settings/providers')}>
                  <Database className="w-4 h-4" /> Providers
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/30 my-1" />
                <DropdownMenuItem className="gap-2 py-1.5 text-xs text-destructive cursor-pointer" onClick={signOut}>
                  <LogOut className="w-4 h-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="sticky top-0 z-20 border-b border-border/30 bg-background/80 backdrop-blur-xl">
            <div className="flex items-center justify-between h-12 px-4 lg:px-6">
              <div className="flex items-center gap-3 flex-1">
                {currentFolder && activeTab === 'files' ? (
                  <button onClick={handleGoBack} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                ) : null}
                <div className="relative max-w-xs w-full">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={activeTab === 'trash' ? 'Search trash...' : 'Search files...'}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 h-8 text-xs rounded-lg"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {activeProvider && (
                  <Badge variant="outline" className="gap-1.5 text-[10px] h-6 px-2 capitalize border-border/50">
                    {providerIcon(activeProvider.provider_type)}
                    {activeProvider.provider_type}
                  </Badge>
                )}
                <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50" title="Toggle view">
                  {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
                </button>
                <button onClick={fetchFiles} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50" title="Refresh">
                  <RefreshCw className="w-4 h-4" />
                </button>

                {/* Upload button → floating dialog */}
                {activeTab === 'files' && (
                  <Button variant="default" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => { setDialogMode('picker'); setShowUploadDialog(true) }}>
                    <Upload className="w-3.5 h-3.5" /> Upload
                  </Button>
                )}
              </div>
            </div>
          </header>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 px-4 lg:px-6 py-1.5 border-b border-border/20">
            {breadcrumbs()}
            <div className="flex-1" />
            {activeTab === 'files' && folders.length + filteredFiles.length > 0 && (
              <span className="text-[10px] text-muted-foreground">{folders.length} folders / {filteredFiles.length} files</span>
            )}
          </div>

          {/* Content */}
          <main className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : activeTab === 'trash' ? (
              trashedFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
                  <Trash2 className="w-10 h-10" />
                  <p className="text-sm">Trash is empty</p>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto space-y-1">
                  {trashedFiles.map(file => (
                    <div key={file.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/30 transition-colors group">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 text-sm truncate min-w-0">{file.name}</span>
                      <span className="text-[10px] text-muted-foreground">{formatFileSize(file.size || 0)}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleRestore(file)} className="px-2 py-1 text-[10px] text-emerald-400 hover:bg-emerald-400/10 rounded">Restore</button>
                        <button onClick={() => handlePermanentDelete(file)} className="px-2 py-1 text-[10px] text-destructive hover:bg-destructive/10 rounded">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : folders.length === 0 && filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
                <Folder className="w-10 h-10" />
                <p className="text-sm">{searchQuery ? 'No files match your search' : 'No files yet'}</p>
                {!searchQuery && (
                  <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => { setDialogMode('picker'); setShowUploadDialog(true) }}>
                    <Upload className="w-3.5 h-3.5" /> Upload
                  </Button>
                )}
              </div>
            ) : (
              <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3' : 'space-y-1 max-w-4xl mx-auto'}>
                {folders.map(folder => (
                  <button key={folder.id}
                    onClick={() => handleNavigate(folder.path)}
                    className={cn(
                      'group text-left transition-colors hover:bg-accent/40 rounded-xl',
                      viewMode === 'grid' ? 'p-4 border border-border/40 hover:border-border' : 'flex items-center gap-3 px-3 py-2 rounded-lg'
                    )}>
                    <div className={cn('flex items-center gap-3', viewMode === 'grid' ? 'flex-col text-center' : 'flex-1 min-w-0')}>
                      <div className={cn('rounded-lg bg-primary/10 flex items-center justify-center shrink-0', viewMode === 'grid' ? 'w-10 h-10' : 'w-7 h-7')}>
                        <Folder className={cn('text-primary', viewMode === 'grid' ? 'w-5 h-5' : 'w-3.5 h-3.5')} />
                      </div>
                      <div className="min-w-0">
                        <p className={cn('font-medium truncate', viewMode === 'grid' ? 'text-xs' : 'text-[12px]')}>{folder.name}</p>
                      </div>
                    </div>
                  </button>
                ))}
                {filteredFiles.map(file => {
                  const Icon = getFileIcon(file.type)
                  return (
                    <button key={file.id}
                      onClick={() => setPreviewFile(file)}
                      className={cn(
                        'group text-left transition-colors hover:bg-accent/40 rounded-xl relative',
                        viewMode === 'grid' ? 'p-4 border border-border/40 hover:border-border' : 'flex items-center gap-3 px-3 py-2 rounded-lg'
                      )}>
                      <div className={cn('flex items-center gap-3', viewMode === 'grid' ? 'flex-col text-center' : 'flex-1 min-w-0')}>
                        <div className={cn('rounded-lg bg-primary/5 flex items-center justify-center shrink-0', viewMode === 'grid' ? 'w-10 h-10' : 'w-7 h-7')}>
                          <Icon className={cn('text-primary/60', viewMode === 'grid' ? 'w-5 h-5' : 'w-3.5 h-3.5')} />
                        </div>
                        <div className="min-w-0">
                          <p className={cn('font-medium truncate', viewMode === 'grid' ? 'text-xs' : 'text-[12px]')}>{file.name}</p>
                          {viewMode === 'list' && (
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>{formatFileSize(file.size || 0)}</span>
                              {file.encrypted && <Lock className="w-2.5 h-2.5" />}
                            </div>
                          )}
                        </div>
                        {viewMode === 'grid' && <p className="text-[10px] text-muted-foreground">{formatFileSize(file.size || 0)}</p>}
                      </div>
                      {viewMode === 'list' && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <span onClick={e => { e.stopPropagation(); handleDownload(file) }} className="p-1 text-muted-foreground hover:text-foreground rounded" title="Download"><Download className="w-3 h-3" /></span>
                          <span onClick={e => { e.stopPropagation(); handleDelete(file) }} className="p-1 text-muted-foreground hover:text-destructive rounded" title="Delete"><Trash2 className="w-3 h-3" /></span>
                        </div>
                      )}
                      {viewMode === 'grid' && (
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span onClick={e => { e.stopPropagation(); handleDownload(file) }} className="p-1 bg-background/80 rounded text-muted-foreground hover:text-foreground"><Download className="w-3 h-3" /></span>
                          <span onClick={e => { e.stopPropagation(); handleDelete(file) }} className="p-1 bg-background/80 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </main>
        </div>

        {previewFile && (
          <EnhancedInstantPreviewModal
            file={previewFile}
            isOpen={!!previewFile}
            onClose={() => setPreviewFile(null)}
            onDownload={() => handleDownload(previewFile)}
            onNext={() => { if (previewAdjacents.next) setPreviewFile(previewAdjacents.next as FileItem) }}
            onPrevious={() => { if (previewAdjacents.previous) setPreviewFile(previewAdjacents.previous as FileItem) }}
            hasNext={!!previewAdjacents.next}
            hasPrevious={!!previewAdjacents.previous}
            currentIndex={previewList.findIndex(f => f.id === previewFile.id)}
            totalFiles={previewList.length}
          />
        )}

        {/* Floating upload dialog */}
        {showUploadDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowUploadDialog(false)}>
            <div className="bg-card border border-border/40 rounded-xl shadow-2xl w-[360px] max-w-[90vw] overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
                <h3 className="text-sm font-semibold">
                  {dialogMode === 'picker' ? 'Create New' : dialogMode === 'folder' ? 'New Folder' : 'New File'}
                </h3>
                <button onClick={() => { setShowUploadDialog(false); setNewFolderName(''); setNewFileName(''); setNewFileContent('') }}
                  className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Picker mode: 3 options */}
              {dialogMode === 'picker' && (
                <div className="p-4 space-y-2">
                  <button onClick={() => { handleUpload(); setShowUploadDialog(false) }}
                    className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-accent/40 border border-border/30 hover:border-border/60 transition-all text-left">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><Upload className="w-4 h-4 text-primary" /></div>
                    <div><p className="text-sm font-medium">Upload Files</p><p className="text-[10px] text-muted-foreground">From your device</p></div>
                  </button>
                  <button onClick={() => setDialogMode('folder')}
                    className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-accent/40 border border-border/30 hover:border-border/60 transition-all text-left">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center"><Folder className="w-4 h-4 text-emerald-400" /></div>
                    <div><p className="text-sm font-medium">New Folder</p><p className="text-[10px] text-muted-foreground">Organize your files</p></div>
                  </button>
                  <button onClick={() => setDialogMode('file')}
                    className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-accent/40 border border-border/30 hover:border-border/60 transition-all text-left">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center"><FileText className="w-4 h-4 text-amber-400" /></div>
                    <div><p className="text-sm font-medium">New File</p><p className="text-[10px] text-muted-foreground">Create a text file</p></div>
                  </button>
                </div>
              )}

              {/* Folder mode */}
              {dialogMode === 'folder' && (
                <div className="p-4 space-y-3">
                  <Input placeholder="Folder name..." value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder().then(() => setShowUploadDialog(false)) }}
                    className="h-9 text-sm rounded-lg" autoFocus />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setDialogMode('picker'); setNewFolderName('') }}>Back</Button>
                    <Button size="sm" className="text-xs" onClick={async () => { await handleCreateFolder(); setShowUploadDialog(false) }}>Create</Button>
                  </div>
                </div>
              )}

              {/* File mode */}
              {dialogMode === 'file' && (
                <div className="p-4 space-y-3">
                  <Input placeholder="File name (e.g. notes.txt)" value={newFileName} onChange={e => setNewFileName(e.target.value)} className="h-9 text-sm rounded-lg" autoFocus />
                  <textarea placeholder="File content..." value={newFileContent} onChange={e => setNewFileContent(e.target.value)}
                    className="w-full h-24 px-3 py-2 text-xs rounded-lg bg-background border border-border/40 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none" />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setDialogMode('picker'); setNewFileName(''); setNewFileContent('') }}>Back</Button>
                    <Button size="sm" className="text-xs" onClick={async () => {
                      if (!newFileName.trim()) return
                      const blob = new Blob([newFileContent || ''], { type: 'text/plain' })
                      const file = new File([blob], newFileName.trim(), { type: 'text/plain' })
                      const formData = new FormData()
                      formData.append('file', file)
                      formData.append('parent_folder', currentFolder || '')
                      try {
                        const res = await fetch(`${API_URL}/files/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: formData })
                        if (res.ok) { toast({ title: 'Created', description: newFileName.trim() }); fetchFiles(); setShowUploadDialog(false); setNewFileName(''); setNewFileContent('') }
                        else { const err = await res.json(); toast({ title: 'Error', description: err.error || 'Failed', variant: 'destructive' }) }
                      } catch {}
                    }}>Create</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ProviderCtx.Provider>
  )
}
