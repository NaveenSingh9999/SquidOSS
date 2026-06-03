import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth, getUserId } from '../middleware/auth.js'
import { AppError } from '../utils/errors.js'
import { randomBytes } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const STORAGE_DIR = resolve(process.cwd(), 'data', 'storage')

export default async function storageRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth)

  app.post('/api/v1/storage/upload', async (request, reply) => {
    const userId = getUserId(request)

    const data = await request.file()
    if (!data) throw new AppError(400, 'No file provided')

    const bucket = (data.fields.bucket as any)?.value || 'files'
    const path = (data.fields.path as any)?.value || `${userId}/${Date.now()}_${randomBytes(4).toString('hex')}`
    const dir = join(STORAGE_DIR, bucket)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const filepath = join(dir, path.replace(/\//g, '_'))
    const ws = createWriteStream(filepath)
    await data.file.pipe(ws)

    return {
      path,
      bucket,
      size: 0,
      success: true,
    }
  })

  app.get('/api/v1/storage/download', async (request, reply) => {
    const bucket = (request.query as any).bucket || 'files'
    const path = (request.query as any).path as string

    if (!path) throw new AppError(400, 'Path required')

    const filepath = join(STORAGE_DIR, bucket, path.replace(/\//g, '_'))
    if (!existsSync(filepath)) throw new AppError(404, 'File not found')

    const data = readFileSync(filepath)
    reply.header('Content-Type', 'application/octet-stream')
    reply.header('Content-Disposition', `attachment; filename="${path.split('/').pop()}"`)
    return data
  })

  app.post('/api/v1/storage/remove', async (request) => {
    const { bucket, paths } = request.body as { bucket: string; paths: string[] }
    if (!paths || paths.length === 0) throw new AppError(400, 'Paths required')

    for (const p of paths) {
      const filepath = join(STORAGE_DIR, bucket || 'files', p.replace(/\//g, '_'))
      try { await import('node:fs').then(fs => fs.unlinkSync(filepath)) } catch {}
    }

    return { success: true }
  })

  app.get('/api/v1/storage/list', async (request) => {
    const bucket = (request.query as any).bucket || 'files'
    const prefix = (request.query as any).prefix || ''
    const dir = join(STORAGE_DIR, bucket)

    if (!existsSync(dir)) return { data: [], error: null }

    const fs = await import('node:fs')
    const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix))
    return {
      data: files.map(f => ({
        name: f,
        id: f,
        updated_at: fs.statSync(join(dir, f)).mtime.toISOString(),
      })),
      error: null,
    }
  })
}
