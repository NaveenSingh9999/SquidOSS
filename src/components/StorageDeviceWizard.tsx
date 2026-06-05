import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { API_URL } from '@/lib/api-url'
import { useToast } from '@/hooks/use-toast'
import { HardDrive, Folder, Database, Check, RefreshCw, Disc, Monitor, Cpu, Settings2 } from '@/lib/icon-map'

interface Device {
  name: string
  type: 'disk' | 'part' | 'crypt' | 'rom' | 'loop'
  size: string
  mountpoint: string | null
  fstype: string | null
  model: string | null
  vendor: string | null
  isReadonly: boolean
  isRemovable: boolean
  freeBytes: number
  totalBytes: number
}

interface Props {
  onConfigured?: () => void
  compact?: boolean
}

export default function StorageDeviceWizard({ onConfigured, compact }: Props) {
  const { toast } = useToast()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [customPath, setCustomPath] = useState('./data/squidoss')
  const [partitionSize, setPartitionSize] = useState('0')
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'detect' | 'select' | 'confirm'>('detect')

  const token = () => localStorage.getItem('squidoss_token')
  const headers = () => ({ 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) })

  const detect = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/devices`, { headers: headers() })
      const data = await res.json()
      if (data.success) {
        setDevices(data.devices || [])
        setStep(data.devices.length > 0 ? 'select' : 'detect')
      }
    } catch (e: any) {
      toast({ title: 'Detection failed', description: e.message, variant: 'destructive' })
    }
    setLoading(false)
  }

  useEffect(() => { detect() }, [])

  const selectedDevice = devices.find(d => d.name === selected)

  const handleSelect = async () => {
    if (!selected && !customPath) {
      toast({ title: 'Select a device or enter a path', variant: 'destructive' })
      return
    }
    setSaving(true)
    setStep('confirm')
    try {
      const res = await fetch(`${API_URL}/api/v1/storage/devices/select`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          device: selected || 'custom',
          path: selectedDevice?.mountpoint || customPath,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'Storage configured', description: `Using ${selected || customPath}` })
        onConfigured?.()
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to configure', variant: 'destructive' })
        setStep('select')
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
      setStep('select')
    }
    setSaving(false)
  }

  const deviceIcon = (type: string) => {
    if (type === 'disk') return <Disc className="w-4 h-4" />
    if (type === 'part') return <Folder className="w-4 h-4" />
    return <HardDrive className="w-4 h-4" />
  }

  const typeLabel = (type: string) => {
    if (type === 'disk') return 'Disk'
    if (type === 'part') return 'Partition'
    return type
  }

  const formatBytes = (b: number) => {
    if (!b) return '?'
    const k = 1024
    const s = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(b) / Math.log(k))
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + s[i]
  }

  return (
    <div className="space-y-3">
      {/* Detection status */}
      {step === 'detect' && loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Scanning storage devices...
        </div>
      )}

      {!loading && devices.length === 0 && (
        <div className="text-center py-4 text-muted-foreground">
          <HardDrive className="w-8 h-8 mx-auto mb-2" />
          <p className="text-xs">No storage devices detected</p>
          <p className="text-[10px]">Enter a path manually or check permissions</p>
          <Button variant="outline" size="sm" className="text-xs h-7 mt-2 gap-1" onClick={detect}>
            <RefreshCw className="w-3 h-3" /> Rescan
          </Button>
        </div>
      )}

      {/* Device list */}
      {step === 'select' && devices.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <Disc className="w-3 h-3" /> Detected Devices
            <button onClick={detect} className="ml-auto hover:text-foreground">
              <RefreshCw className="w-3 h-3" />
            </button>
          </p>
          {devices.map(dev => {
            const isUsed = !!dev.mountpoint && dev.freeBytes > 0
            return (
              <button key={dev.name} onClick={() => setSelected(dev.name)}
                className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                  selected === dev.name
                    ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border/30 hover:border-border/60 hover:bg-accent/20'
                }`}>
                <div className="w-8 h-8 rounded-lg bg-accent/30 flex items-center justify-center flex-shrink-0">
                  {deviceIcon(dev.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">{dev.name}</span>
                    <Badge variant="outline" className="text-[8px] h-3.5 px-1">{typeLabel(dev.type)}</Badge>
                    {dev.isRemovable && <Badge variant="secondary" className="text-[8px] h-3.5 px-1">Removable</Badge>}
                    {isUsed && <Badge className="text-[8px] h-3.5 px-1 bg-emerald-500/10 text-emerald-400 border-0">In Use</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                    <span>{dev.size}</span>
                    {dev.model && <span>· {dev.model}</span>}
                    {dev.fstype && <span>· {dev.fstype}</span>}
                    {dev.mountpoint && <span>· {dev.mountpoint}</span>}
                  </div>
                  {isUsed && (
                    <div className="mt-1 text-[9px] text-muted-foreground">
                      {formatBytes(dev.freeBytes)} free of {formatBytes(dev.totalBytes)}
                    </div>
                  )}
                </div>
                {selected === dev.name && (
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Selected device / custom path config */}
      {step === 'select' && (
        <div className="p-3 rounded-lg bg-accent/20 border border-border/30 space-y-2.5">
          <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
            <Settings2 className="w-3 h-3" /> Configuration
          </p>

          {!selected && (
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Custom Storage Path</label>
              <Input type="text" value={customPath}
                onChange={e => setCustomPath(e.target.value)}
                className="h-8 text-xs rounded-lg" placeholder="./data/squidoss" />
            </div>
          )}

          {selectedDevice && (
            <div className="text-xs space-y-1">
              <p className="text-muted-foreground">
                Selected: <span className="text-foreground font-medium">{selectedDevice.name}</span>
                {selectedDevice.mountpoint && <span className="ml-1 text-muted-foreground">({selectedDevice.mountpoint})</span>}
              </p>
              {selectedDevice.freeBytes > 0 && (
                <p className="text-muted-foreground">
                  Available: <span className="text-foreground">{formatBytes(selectedDevice.freeBytes)}</span>
                </p>
              )}
            </div>
          )}

          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Max Storage (GB, 0 = unlimited)</label>
            <Input type="number" value={partitionSize}
              onChange={e => setPartitionSize(e.target.value)}
              className="h-8 text-xs rounded-lg" placeholder="0" min="0" />
          </div>

          <Button size="sm" className="text-xs h-7 gap-1 w-full" onClick={handleSelect} disabled={saving}>
            {saving ? 'Configuring...' : <><Check className="w-3 h-3" /> Use This Device</>}
          </Button>
        </div>
      )}

      {step === 'confirm' && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 py-2">
          <Check className="w-4 h-4" />
          Storage configured on {selected || customPath}
        </div>
      )}
    </div>
  )
}
