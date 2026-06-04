import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, Download, X, FileText, Image, Video, Music, Archive, AlertCircle } from '@/lib/icon-map'
import { formatFileSize } from '@/lib/utils'
import { downloadFileWithRes54 } from '@/lib/res54'
import { useToast } from '@/hooks/use-toast'

interface FileItem {
  id: string
  name: string
  type?: string
  size?: number
  storage_path?: string
  encrypted?: boolean
}

interface EnhancedInstantPreviewModalProps {
  file: FileItem
  isOpen: boolean
  onClose: () => void
  onDownload: () => void
  onShare?: () => void
  onNext?: () => void
  onPrevious?: () => void
  hasNext?: boolean
  hasPrevious?: boolean
  currentIndex?: number
  totalFiles?: number
  siblingFiles?: Array<{ id: string; name: string; type?: string; size?: number }>
  onNavigateToFile?: (file: { id: string; name: string }) => void
}

const VIEWER_MAP: Record<string, string> = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/jpg': 'image', 'image/gif': 'image',
  'image/webp': 'image', 'image/svg+xml': 'image', 'image/bmp': 'image',
  'video/mp4': 'video', 'video/webm': 'video', 'video/ogg': 'video', 'video/quicktime': 'video',
  'audio/mpeg': 'audio', 'audio/ogg': 'audio', 'audio/wav': 'audio', 'audio/webm': 'audio',
  'application/pdf': 'pdf', 'text/plain': 'text', 'text/html': 'text', 'text/css': 'text',
  'application/json': 'text', 'text/javascript': 'text', 'text/typescript': 'text',
  'application/zip': 'archive', 'application/x-tar': 'archive', 'application/gzip': 'archive',
  'application/x-rar-compressed': 'archive', 'application/x-7z-compressed': 'archive',
}

function getViewerType(mime: string): string {
  return VIEWER_MAP[mime] || (mime?.startsWith('text/') ? 'text' : 'unknown')
}

function getFileIcon(type: string) {
  if (!type) return FileText
  if (type.startsWith('image/')) return Image
  if (type.startsWith('video/')) return Video
  if (type.startsWith('audio/')) return Music
  if (type.includes('zip') || type.includes('tar') || type.includes('rar') || type.includes('gzip') || type.includes('7z')) return Archive
  return FileText
}

export default function EnhancedInstantPreviewModal({
  file, isOpen, onClose, onDownload, onNext, onPrevious,
  hasNext, hasPrevious, currentIndex, totalFiles,
}: EnhancedInstantPreviewModalProps) {
  const { toast } = useToast()
  const [loaded, setLoaded] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const viewerRef = useRef<HTMLDivElement>(null)

  const viewerType = getViewerType(file.type || '')
  const FileIcon = getFileIcon(file.type || '')

  useEffect(() => {
    setLoaded(false)
    setContent(null)
    setObjectUrl(null)
    setLoadError(false)
  }, [file.id])

  useEffect(() => {
    if (!isOpen || !file) return
    const loadFile = async () => {
      try {
        setLoaded(false)
        setLoadError(false)
        let url: string | undefined
        if (file.encrypted && file.storage_path === 'res54_distributed') {
          const blob = await downloadFileWithRes54(file.id, () => {}, { reason: 'preview', fileName: file.name })
          url = URL.createObjectURL(blob)
          setObjectUrl(url)
        } else {
          const token = localStorage.getItem('squidoss_token')
          const API_URL = (import.meta.env.VITE_SQUIDOSS_API_URL || 'http://localhost:3000').replace(/\/+$/, '')
          const res = await fetch(`${API_URL}/files/${file.id}/download`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          if (res.ok) {
            if (viewerType === 'text') {
              setContent(await res.text())
            } else {
              const blob = await res.blob()
              url = URL.createObjectURL(blob)
              setObjectUrl(url)
            }
          } else {
            setLoadError(true)
          }
        }
      } catch {
        setLoadError(true)
      }
      setLoaded(true)
    }
    loadFile()
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file.id, isOpen, viewerType])

  const handleDownload = useCallback(() => {
    onDownload()
  }, [onDownload])

  if (!isOpen) return null

  const renderContent = () => {
    if (!loaded) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )
    }

    if (loadError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
          <AlertCircle className="w-12 h-12" />
          <p>Failed to load preview</p>
          <Button variant="outline" onClick={handleDownload}>Download instead</Button>
        </div>
      )
    }

    switch (viewerType) {
      case 'image':
        return objectUrl ? (
          <img src={objectUrl} alt={file.name} className="max-h-full max-w-full object-contain" />
        ) : null
      case 'video':
        return objectUrl ? (
          <video src={objectUrl} controls className="max-h-full max-w-full rounded-lg" autoPlay />
        ) : null
      case 'audio':
        return objectUrl ? (
          <div className="flex flex-col items-center gap-4 p-8">
            <Music className="w-16 h-16 text-primary" />
            <p className="text-lg font-medium">{file.name}</p>
            <audio src={objectUrl} controls className="w-full max-w-md" autoPlay />
          </div>
        ) : null
      case 'text':
        return (
          <pre className="w-full h-full overflow-auto p-6 text-sm font-mono whitespace-pre-wrap break-all bg-black/20">
            {content || <span className="text-muted-foreground">Empty file</span>}
          </pre>
        )
      case 'pdf':
        return objectUrl ? (
          <iframe src={objectUrl} className="w-full h-full rounded-lg" title={file.name} />
        ) : null
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <FileIcon className="w-16 h-16" />
            <p className="text-lg">{file.name}</p>
            <p className="text-sm">{formatFileSize(file.size || 0)}</p>
            <Button variant="outline" onClick={handleDownload} className="gap-2">
              <Download className="w-4 h-4" /> Download
            </Button>
          </div>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" style={{ background: 'hsl(222 47% 5%)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            {totalFiles && currentIndex !== undefined && (
              <p className="text-xs text-muted-foreground">{currentIndex + 1} / {totalFiles}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasPrevious && onPrevious && (
            <button onClick={onPrevious} className="text-muted-foreground hover:text-foreground p-1" title="Previous">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          {hasNext && onNext && (
            <button onClick={onNext} className="text-muted-foreground hover:text-foreground p-1" title="Next">
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
          <button onClick={handleDownload} className="text-muted-foreground hover:text-foreground p-1" title="Download">
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div ref={viewerRef} className="flex-1 flex items-center justify-center overflow-hidden p-4">
        {renderContent()}
      </div>
    </div>
  )
}
