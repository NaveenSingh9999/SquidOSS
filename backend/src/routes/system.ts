import { FastifyInstance } from 'fastify'
import { execSync } from 'child_process'
import { readdirSync, statSync } from 'fs'

interface DriveInfo {
  device: string
  mount: string
  size: string
  used: string
}

export default async function systemRoutes(app: FastifyInstance) {
  // List available drives/partitions
  app.get('/api/v1/system/drives', async () => {
    try {
      const output = execSync('df -h --output=source,target,size,used,avail,pcent 2>/dev/null || df -h', {
        timeout: 5000,
        encoding: 'utf-8',
      })

      const lines = output.trim().split('\n').slice(1)
      const drives: DriveInfo[] = lines
        .map(line => {
          const parts = line.split(/\s+/)
          if (parts.length < 3) return null
          const device = parts[0]
          if (!device.startsWith('/')) return null
          return {
            device,
            mount: parts[1] || device,
            size: parts[2] || '?',
            used: parts[3] || '?',
          }
        })
        .filter((d): d is DriveInfo => d !== null)

      return drives
    } catch {
      // Fallback: list common mount points
      const dirs = ['/mnt', '/media', '/data']
      const drives: DriveInfo[] = []
      for (const dir of dirs) {
        try {
          const entries = readdirSync(dir)
          for (const entry of entries) {
            const fullPath = `${dir}/${entry}`
            const stat = statSync(fullPath)
            if (stat.isDirectory()) {
              drives.push({
                device: fullPath,
                mount: fullPath,
                size: `${(stat.size / 1024 / 1024 / 1024).toFixed(1)}G available`,
                used: '',
              })
            }
          }
        } catch {}
      }
      return drives
    }
  })
}
