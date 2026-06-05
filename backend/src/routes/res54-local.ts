import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth, getUserId } from '../middleware/auth.js'
import { AppError } from '../utils/errors.js'
import { writeChunk, readChunk, deleteChunk, chunkExists, listChunks, chunkStat, generateChunkId } from '../native/local-storage.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCAL_CONFIG_DIR = resolve(process.cwd(), 'data', 'config')

function getLocalConfigPath(userId: string): string {
  return resolve(LOCAL_CONFIG_DIR, `local-disk-${userId}.json`)
}

function loadLocalConfig(userId: string): { enabled: boolean; path: string; partitionSize: number } {
  const configPath = getLocalConfigPath(userId)
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {}
  }
  return { enabled: true, path: './data/chunks', partitionSize: 0 }
}

function saveLocalConfig(userId: string, config: { enabled: boolean; path: string; partitionSize: number }): void {
  const cfgPath = getLocalConfigPath(userId)
  if (!existsSync(LOCAL_CONFIG_DIR)) mkdirSync(LOCAL_CONFIG_DIR, { recursive: true })
  writeFileSync(cfgPath, JSON.stringify(config, null, 2))
}

export default async function res54LocalRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth)

  // GET /api/v1/res54-local/status - local disk storage status
  app.get('/api/v1/res54-local/status', async (request) => {
    const userId = getUserId(request)
    const config = loadLocalConfig(userId)
    const chunks = listChunks(userId)
    const totalSize = chunks.reduce((sum, id) => {
      const st = chunkStat(userId, id)
      return sum + (st?.size || 0)
    }, 0)

    return {
      success: true,
      enabled: config.enabled,
      path: config.path,
      partitionSize: config.partitionSize,
      chunkCount: chunks.length,
      totalBytes: totalSize,
      storagePath: config.path,
    }
  })

  // POST /api/v1/res54-local/enable - enable local disk storage
  app.post('/api/v1/res54-local/enable', async (request) => {
    const userId = getUserId(request)
    const config = loadLocalConfig(userId)
    config.enabled = true
    saveLocalConfig(userId, config)
    return { success: true, enabled: true }
  })

  // POST /api/v1/res54-local/disable - disable local disk storage
  app.post('/api/v1/res54-local/disable', async (request) => {
    const userId = getUserId(request)
    const config = loadLocalConfig(userId)
    config.enabled = false
    saveLocalConfig(userId, config)
    return { success: true, enabled: false }
  })

  // POST /api/v1/storage/providers/local - configure local disk provider
  app.post('/api/v1/storage/providers/local', async (request) => {
    const userId = getUserId(request)
    const { path: storagePath, partitionSize } = request.body as {
      path: string
      partitionSize: number
    }

    const resolvedPath = storagePath || './data/chunks'
    if (!existsSync(resolvedPath)) {
      mkdirSync(resolvedPath, { recursive: true })
    }

    // Upsert local storage provider
    const existing = await sql`
      SELECT id FROM storage_providers
      WHERE user_id = ${userId} AND provider_type = 'local'
      LIMIT 1
    `

    if (existing.length > 0) {
      await sql`
        UPDATE storage_providers
        SET encrypted_credentials = ${JSON.stringify({ path: resolvedPath, partitionSize })}
        WHERE id = ${(existing[0] as any).id}
      `
    } else {
      await sql`
        INSERT INTO storage_providers (user_id, provider_type, encrypted_credentials, is_default)
        VALUES (${userId}, 'local', ${JSON.stringify({ path: resolvedPath, partitionSize })}, false)
      `
    }

    // Also store in local config
    saveLocalConfig(userId, { enabled: true, path: resolvedPath, partitionSize })

    return { success: true, path: resolvedPath, partitionSize }
  })

  // GET /api/v1/res54-local/config - get local disk config
  app.get('/api/v1/res54-local/config', async (request) => {
    const userId = getUserId(request)
    const config = loadLocalConfig(userId)
    return { success: true, ...config }
  })

  // POST /api/v1/res54-local/store-chunk - store a chunk on local disk
  app.post('/api/v1/res54-local/store-chunk', async (request) => {
    const userId = getUserId(request)
    const config = loadLocalConfig(userId)
    if (!config.enabled) {
      throw new AppError(403, 'Local disk storage is disabled')
    }

    const { content, chunkId: providedId } = request.body as {
      content: string
      chunkId?: string
    }

    if (!content) {
      throw new AppError(400, 'Missing required field: content (base64)')
    }

    const buffer = Buffer.from(content, 'base64')
    const chunkId = providedId || generateChunkId()
    writeChunk(userId, chunkId, buffer)

    return { success: true, chunkId, bytesWritten: buffer.length }
  })

  // GET /api/v1/res54-local/get-chunk - retrieve a chunk from local disk
  app.get('/api/v1/res54-local/get-chunk', async (request) => {
    const userId = getUserId(request)
    const config = loadLocalConfig(userId)
    if (!config.enabled) {
      throw new AppError(403, 'Local disk storage is disabled')
    }

    const query = request.query as { chunkId: string }

    if (!query.chunkId) {
      throw new AppError(400, 'Missing required query param: chunkId')
    }

    const buffer = readChunk(userId, query.chunkId)
    if (!buffer) {
      throw new AppError(404, 'Chunk not found')
    }

    return { success: true, content: buffer.toString('base64'), byteLength: buffer.length }
  })

  // DELETE /api/v1/res54-local/delete-chunk - delete a chunk from local disk
  app.delete('/api/v1/res54-local/delete-chunk', async (request) => {
    const userId = getUserId(request)
    const { chunkId } = request.body as { chunkId: string }

    if (!chunkId) {
      throw new AppError(400, 'Missing required field: chunkId')
    }

    const deleted = deleteChunk(userId, chunkId)
    if (!deleted) {
      throw new AppError(404, 'Chunk not found')
    }

    return { success: true }
  })

  // POST /api/v1/res54-local/check-chunk - check if chunk exists
  app.post('/api/v1/res54-local/check-chunk', async (request) => {
    const userId = getUserId(request)
    const { chunkId } = request.body as { chunkId: string }

    if (!chunkId) {
      throw new AppError(400, 'Missing required field: chunkId')
    }

    const exists = chunkExists(userId, chunkId)
    const stat = exists ? chunkStat(userId, chunkId) : null

    return { success: true, exists, ...(stat ? { size: stat.size, mtime: stat.mtime } : {}) }
  })

  // GET /api/v1/res54-local/chunks - list all chunks for user
  app.get('/api/v1/res54-local/chunks', async (request) => {
    const userId = getUserId(request)
    const chunks = listChunks(userId)

    const chunkDetails = chunks.map(id => {
      const st = chunkStat(userId, id)
      return { chunkId: id, ...(st ? { size: st.size, mtime: st.mtime } : {}) }
    })

    return { success: true, chunks: chunkDetails, count: chunkDetails.length }
  })

  // DELETE /api/v1/res54-local/chunks - wipe all chunks for a user
  app.delete('/api/v1/res54-local/chunks', async (request) => {
    const userId = getUserId(request)
    const chunks = listChunks(userId)
    let deleted = 0

    for (const id of chunks) {
      if (deleteChunk(userId, id)) deleted++
    }

    return { success: true, deletedCount: deleted }
  })
}
