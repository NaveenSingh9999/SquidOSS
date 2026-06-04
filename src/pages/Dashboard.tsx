import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { isFeatureEnabled } from '@/hooks/useFeatureFlags'
import { cn, formatFileSize } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import EnhancedInstantPreviewModal from '@/components/EnhancedInstantPreviewModal'
import {
  Search, Grid3X3, List, Upload, Folder, File, Trash2,
  Home, ChevronRight, ArrowLeft, Download, Share2, LogOut,
  Settings, HardDrive, RefreshCw, Plus, Image, Video, Music,
  FileText, Archive, Lock,
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
  const sharingEnabled = isFeatureEnabled('sharing')

  const [files, setFiles] = useState<FileItem[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [currentFolder, setCurrentFolder] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)

  const token = () => localStorage.getItem('squidoss_token')
  const headers = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) })

  const fetchFiles = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
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
    } catch (e: any) {
      console.error('fetch error', e)
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
    setLoading(false)
  }, [user, currentFolder])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files
    const q = searchQuery.toLowerCase()
    return files.filter(f => f.name.toLowerCase().includes(q))
  }, [files, searchQuery])

  const handleNavigate = (path: string) => {
    setCurrentFolder(path)
    setSearchQuery('')
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

  const previewAdjacents = useMemo(() => {
    if (!previewFile) return { previous: null, next: null }
    const i = filteredFiles.findIndex(f => f.id === previewFile.id)
    return {
      previous: i > 0 ? filteredFiles[i - 1] : null,
      next: i < filteredFiles.length - 1 ? filteredFiles[i + 1] : null,
    }
  }, [previewFile, filteredFiles])

  const breadcrumbs = () => {
    if (!currentFolder) return null
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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center justify-between h-14 px-4 lg:px-6 max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-3">
            <HardDrive className="w-5 h-5 text-primary" />
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9 w-64 text-sm rounded-lg"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="p-2 text-muted-foreground hover:text-foreground" title="Toggle view">
              {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
            </button>
            <Button variant="outline" size="sm" onClick={handleUpload} className="gap-2">
              <Upload className="w-4 h-4" /> Upload
            </Button>
            <button onClick={() => navigate('/settings/account')} className="p-2 text-muted-foreground hover:text-foreground" title="Settings">
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={signOut} className="p-2 text-muted-foreground hover:text-destructive" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-2 border-b border-border/20 max-w-[1400px] mx-auto w-full">
        <div className="flex items-center gap-2">
          {currentFolder && (
            <button onClick={handleGoBack} className="p-1.5 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          {breadcrumbs()}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchFiles} className="p-1.5 text-muted-foreground hover:text-foreground" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          {folders.length + filteredFiles.length > 0 && (
            <span className="text-xs text-muted-foreground">{folders.length} folders / {filteredFiles.length} files</span>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 max-w-[1400px] mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : folders.length === 0 && filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
            <Folder className="w-12 h-12" />
            <p>{searchQuery ? 'No files match your search' : 'No files yet'}</p>
            {!searchQuery && <Button variant="outline" size="sm" onClick={handleUpload} className="gap-2"><Upload className="w-4 h-4" /> Upload your first file</Button>}
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3' : 'space-y-1'}>
            {/* Folder cards */}
            {folders.map(folder => (
              <button key={folder.id}
                onClick={() => handleNavigate(folder.path)}
                className={cn(
                  'group text-left transition-colors hover:bg-accent/50 rounded-xl',
                  viewMode === 'grid' ? 'p-4 border border-border/50 hover:border-border' : 'flex items-center gap-3 px-3 py-2 rounded-lg'
                )}>
                <div className={cn('flex items-center gap-3', viewMode === 'grid' ? 'flex-col text-center' : 'flex-1 min-w-0')}>
                  <div className={cn('rounded-xl bg-primary/10 flex items-center justify-center shrink-0', viewMode === 'grid' ? 'w-12 h-12' : 'w-8 h-8')}>
                    <Folder className={cn('text-primary', viewMode === 'grid' ? 'w-6 h-6' : 'w-4 h-4')} />
                  </div>
                  <div className="min-w-0">
                    <p className={cn('font-medium truncate', viewMode === 'grid' ? 'text-sm' : 'text-[13px]')}>{folder.name}</p>
                  </div>
                </div>
              </button>
            ))}

            {/* File cards */}
            {filteredFiles.map(file => {
              const Icon = getFileIcon(file.type)
              return (
                <button key={file.id}
                  onClick={() => setPreviewFile(file)}
                  className={cn(
                    'group text-left transition-colors hover:bg-accent/50 rounded-xl relative',
                    viewMode === 'grid' ? 'p-4 border border-border/50 hover:border-border' : 'flex items-center gap-3 px-3 py-2 rounded-lg'
                  )}>
                  <div className={cn('flex items-center gap-3', viewMode === 'grid' ? 'flex-col text-center' : 'flex-1 min-w-0')}>
                    <div className={cn('rounded-xl bg-primary/5 flex items-center justify-center shrink-0', viewMode === 'grid' ? 'w-12 h-12' : 'w-8 h-8')}>
                      <Icon className={cn('text-primary/70', viewMode === 'grid' ? 'w-6 h-6' : 'w-4 h-4')} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn('font-medium truncate', viewMode === 'grid' ? 'text-sm' : 'text-[13px]')}>{file.name}</p>
                      {viewMode === 'list' && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatFileSize(file.size || 0)}</span>
                          {file.encrypted && <Lock className="w-3 h-3" />}
                        </div>
                      )}
                    </div>
                    {viewMode === 'grid' && (
                      <p className="text-[11px] text-muted-foreground">{formatFileSize(file.size || 0)}</p>
                    )}
                  </div>
                  {/* Actions (visible on hover) */}
                  {viewMode === 'list' && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <span onClick={e => { e.stopPropagation(); handleDownload(file) }} className="p-1.5 text-muted-foreground hover:text-foreground" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </span>
                      <span onClick={e => { e.stopPropagation(); handleDelete(file) }} className="p-1.5 text-muted-foreground hover:text-destructive" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  )}
                  {viewMode === 'grid' && (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span onClick={e => { e.stopPropagation(); handleDownload(file) }} className="p-1 bg-background/80 rounded text-muted-foreground hover:text-foreground">
                        <Download className="w-3 h-3" />
                      </span>
                      <span onClick={e => { e.stopPropagation(); handleDelete(file) }} className="p-1 bg-background/80 rounded text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Full-screen preview modal */}
      {previewFile && (
        <EnhancedInstantPreviewModal
          file={previewFile}
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={() => handleDownload(previewFile)}
          onNext={() => { if (previewAdjacents.next) setPreviewFile(previewAdjacents.next) }}
          onPrevious={() => { if (previewAdjacents.previous) setPreviewFile(previewAdjacents.previous) }}
          hasNext={!!previewAdjacents.next}
          hasPrevious={!!previewAdjacents.previous}
          currentIndex={filteredFiles.findIndex(f => f.id === previewFile.id)}
          totalFiles={filteredFiles.length}
        />
      )}
    </div>
  )
}
