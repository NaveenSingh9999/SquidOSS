import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { createHash, randomBytes } from 'node:crypto'
import { AppError } from '../utils/errors.js'

const STREAM_SIGNING_SECRET = process.env.STREAM_SIGNING_SECRET || 'dev-stream-secret'

function hmacHex(key: string, message: string): string {
  return createHash('sha256').update(key + message).digest('hex')
}

export default async function videoRoutes(app: FastifyInstance) {
  // POST /api/v1/video/stream-url - generate signed stream URL
  app.post('/api/v1/video/stream-url', async (request) => {
    const { fileId, quality, userId, sessionId } = request.body as {
      fileId: string
      quality?: string
      userId?: string
      sessionId?: string
    }

    if (!fileId || !userId) {
      throw new AppError(400, 'File ID and user ID are required')
    }

    const expiry = Math.floor(Date.now() / 1000) + 3600
    const signature = hmacHex(
      STREAM_SIGNING_SECRET,
      `${fileId}:${userId}:${sessionId || ''}:${expiry}`,
    )

    return {
      success: true,
      url: `/api/v1/video/stream`,
      token: {
        fileId,
        quality: quality || 'auto',
        userId,
        sessionId: sessionId || randomBytes(8).toString('hex'),
        expiry,
        signature,
      },
    }
  })

  // POST /api/v1/video/stream - stream video
  app.post('/api/v1/video/stream', async (request, reply) => {
    const { fileId, quality, userId, sessionId, expiry, signature } =
      request.body as {
        fileId: string
        quality: string
        userId: string
        sessionId: string
        expiry: number
        signature: string
      }

    if (!fileId || !userId || !signature || !expiry) {
      throw new AppError(400, 'Missing required stream parameters')
    }

    if (Math.floor(Date.now() / 1000) > expiry) {
      throw new AppError(410, 'Stream URL has expired')
    }

    const expectedSig = hmacHex(
      STREAM_SIGNING_SECRET,
      `${fileId}:${userId}:${sessionId || ''}:${expiry}`,
    )

    if (signature !== expectedSig) {
      throw new AppError(401, 'Invalid stream signature')
    }

    const [file] = await sql`
      SELECT * FROM files WHERE id = ${fileId}
    `

    if (!file) {
      throw new AppError(404, 'File not found')
    }

    const [mediaMeta] = await sql`
      SELECT * FROM media_metadata WHERE file_id = ${fileId}
    `

    return {
      success: true,
      file,
      media: mediaMeta || null,
      urls: mediaMeta
        ? {
            master: `/api/v1/video/manifest/${fileId}/master.m3u8`,
            manifest: `/api/v1/video/manifest/${fileId}/manifest.m3u8`,
          }
        : null,
    }
  })

  // GET /api/v1/video/manifest/:fileId/:type - serve HLS manifests
  app.get('/api/v1/video/manifest/:fileId/:type', async (request, reply) => {
    const { fileId, type } = request.params as { fileId: string; type: string }

    const [media] = await sql`
      SELECT * FROM media_metadata WHERE file_id = ${fileId}
    `

    if (!media) {
      throw new AppError(404, 'Media not found')
    }

    const manifest = type === 'master.m3u8'
      ? (media as any).master_manifest
      : (media as any).media_manifest

    if (!manifest) {
      throw new AppError(404, 'Manifest not found')
    }

    reply.header('Content-Type', 'application/vnd.apple.mpegurl')
    reply.header('Access-Control-Allow-Origin', '*')
    return manifest
  })
}
