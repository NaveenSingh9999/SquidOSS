import { FastifyInstance } from 'fastify'
import { requireAuth, getUserId } from '../middleware/auth.js'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sql } from '../db/index.js'
import { AppError } from '../utils/errors.js'

interface StorageDevice {
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

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' }).trim()
  } catch { return '' }
}

function parseSize(s: string): number {
  if (!s) return 0
  const n = parseFloat(s)
  if (s.endsWith('G')) return Math.round(n * 1024 * 1024 * 1024)
  if (s.endsWith('M')) return Math.round(n * 1024 * 1024)
  if (s.endsWith('T')) return Math.round(n * 1024 * 1024 * 1024 * 1024)
  if (s.endsWith('K')) return Math.round(n * 1024)
  return Math.round(n)
}

function detectDevices(): StorageDevice[] {
  const devices: StorageDevice[] = []

  // Try lsblk first (Linux)
  const lsblk = run('lsblk -J -o NAME,TYPE,SIZE,MOUNTPOINT,FSTYPE,MODEL,VENDOR,RO,RM 2>/dev/null')
  if (lsblk) {
    try {
      const parsed = JSON.parse(lsblk)
      const blockdevices = parsed.blockdevices || []
      for (const dev of flattenBlockdevices(blockdevices)) {
        const sizeStr = dev.size || '0'
        devices.push({
          name: dev.name || '',
          type: dev.type || 'disk',
          size: sizeStr,
          mountpoint: dev.mountpoint || null,
          fstype: dev.fstype || null,
          model: dev.model || null,
          vendor: dev.vendor || null,
          isReadonly: dev.ro === '1',
          isRemovable: dev.rm === '1',
          freeBytes: 0,
          totalBytes: parseSize(sizeStr),
        })
      }
    } catch {}
  }

  // Add free space info from df
  const df = run('df -B1 --output=source,size,avail,target,fstype 2>/dev/null')
  if (df) {
    const lines = df.split('\n').slice(1)
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4) continue
      const source = parts[0]
      const total = parseInt(parts[1]) || 0
      const avail = parseInt(parts[2]) || 0
      const target = parts[3]
      const fstype = parts[4] || ''
      // Match by source path (e.g., /dev/sda1)
      const devName = source.replace('/dev/', '')
      const existing = devices.find(d => d.name === devName)
      if (existing) {
        existing.freeBytes = Math.max(existing.freeBytes, avail)
        existing.totalBytes = Math.max(existing.totalBytes, total)
      }
      // Also add as a mount entry if not already listed
      if (!existing && source.startsWith('/dev/')) {
        devices.push({
          name: devName,
          type: 'part',
          size: formatBytes(total),
          mountpoint: target,
          fstype: fstype || null,
          model: null,
          vendor: null,
          isReadonly: false,
          isRemovable: false,
          freeBytes: avail,
          totalBytes: total,
        })
      }
    }
  }

  // Also try /proc/mounts for additional mount points
  if (existsSync('/proc/mounts')) {
    const mounts = run('cat /proc/mounts 2>/dev/null')
    for (const line of mounts.split('\n')) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 2) continue
      const source = parts[0]
      const target = parts[1]
      if (!source.startsWith('/dev/') || target.startsWith('/snap/')) continue
      const devName = source.replace('/dev/', '')
      const existing = devices.find(d => d.name === devName)
      if (!existing) {
        devices.push({
          name: devName,
          type: 'part',
          size: '0',
          mountpoint: target,
          fstype: parts[2] || null,
          model: null,
          vendor: null,
          isReadonly: parts[3]?.includes('ro') || false,
          isRemovable: false,
          freeBytes: 0,
          totalBytes: 0,
        })
      }
    }
  }

  // Filter out loop and ram devices, sort by type then size
  return devices
    .filter(d => d.type !== 'loop' && d.type !== 'rom' && !d.name.startsWith('ram'))
    .sort((a, b) => {
      if (a.type === 'disk' && b.type !== 'disk') return -1
      if (a.type !== 'disk' && b.type === 'disk') return 1
      return b.totalBytes - a.totalBytes
    })
}

function flattenBlockdevices(devices: any[], parent?: string): any[] {
  const result: any[] = []
  for (const dev of devices) {
    const name = parent ? `${parent}/${dev.name}` : dev.name
    const children = dev.children || []
    result.push({ ...dev, name })
    result.push(...flattenBlockdevices(children, name))
  }
  return result
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i]
}

export default async function storageDeviceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth)

  // GET /api/v1/storage/devices - auto-detect storage devices
  app.get('/api/v1/storage/devices', async () => {
    const devices = detectDevices()
    return { success: true, devices, count: devices.length }
  })

  // POST /api/v1/storage/devices/select - select a device for SquidOSS storage
  app.post('/api/v1/storage/devices/select', async (request) => {
    const userId = getUserId(request)
    const { device, path, partitionName } = request.body as {
      device: string
      path: string
      partitionName?: string
    }

    if (!device || !path) {
      throw new AppError(400, 'Device and path required')
    }

    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true })
    }

    // Create a test file to verify writability
    try {
      writeFileSync(resolve(path, '.squidoss-test'), 'test')
    } catch {
      throw new AppError(403, `Cannot write to ${path} — check permissions`)
    }

    const config = {
      enabled: true,
      device,
      path,
      partitionName: partitionName || null,
      selectedAt: new Date().toISOString(),
    }

    // Upsert the provider
    const existing = await sql`
      SELECT id FROM storage_providers
      WHERE user_id = ${userId} AND provider_type = 'local'
      LIMIT 1
    `

    if (existing.length > 0) {
      await sql`
        UPDATE storage_providers
        SET encrypted_credentials = ${JSON.stringify(config)},
            is_default = true,
            updated_at = NOW()
        WHERE id = ${(existing[0] as any).id}
      `
    } else {
      await sql`
        INSERT INTO storage_providers (user_id, provider_type, encrypted_credentials, is_default)
        VALUES (${userId}, 'local', ${JSON.stringify(config)}, true)
      `
    }

    return { success: true, config }
  })
}
