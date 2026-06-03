import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../utils/errors.js'

export default async function shareRoutes(app: FastifyInstance) {
  // POST /api/v1/shares/validate - validate a share link
  app.post('/api/v1/shares/validate', async (request) => {
    const { shareId, password } = request.body as {
      shareId: string
      password?: string
    }

    if (!shareId) {
      throw new AppError(400, 'Share ID is required')
    }

    const share = await sql`
      SELECT * FROM get_shared_file_info(${shareId})
    `

    if (share.length === 0) {
      throw new AppError(404, 'Share not found')
    }

    const shareInfo = share[0] as any

    if (shareInfo.share_expires_at && new Date(shareInfo.share_expires_at) < new Date()) {
      throw new AppError(410, 'Share link has expired')
    }

    if (shareInfo.access_code && shareInfo.access_code !== password) {
      throw new AppError(403, 'Invalid password')
    }

    return {
      success: true,
      id: shareInfo.id,
      name: shareInfo.name,
      type: shareInfo.type,
      size: shareInfo.size,
      created_at: shareInfo.created_at,
      updated_at: shareInfo.updated_at,
      encrypted: shareInfo.encrypted,
      storage_path: shareInfo.storage_path,
    }
  })

  // GET /api/v1/shares/:shareId - validate share by ID
  app.get('/api/v1/shares/:shareId', async (request) => {
    const { shareId } = request.params as { shareId: string }

    const share = await sql`
      SELECT * FROM get_shared_file_info(${shareId})
    `

    if (share.length === 0) {
      throw new AppError(404, 'Share not found')
    }

    const shareInfo = share[0] as any

    if (shareInfo.share_expires_at && new Date(shareInfo.share_expires_at) < new Date()) {
      throw new AppError(410, 'Share link has expired')
    }

    return {
      success: true,
      id: shareInfo.id,
      name: shareInfo.name,
      type: shareInfo.type,
      size: shareInfo.size,
      created_at: shareInfo.created_at,
      updated_at: shareInfo.updated_at,
      encrypted: shareInfo.encrypted,
      storage_path: shareInfo.storage_path,
      has_password: !!shareInfo.access_code,
    }
  })

  // Authenticated share management routes
  app.register(async (authedApp) => {
    authedApp.addHook('onRequest', requireAuth)

    // POST /api/v1/shares - create a share
    authedApp.post('/api/v1/shares', async (request) => {
      const userId = request.user!.sub as string
      const { fileId, expiresInDays, accessCode } = request.body as {
        fileId: string
        expiresInDays?: number
        accessCode?: string
      }

      if (!fileId) {
        throw new AppError(400, 'File ID is required')
      }

      const [share] = await sql`
        SELECT * FROM create_file_share(${fileId}, ${userId}, ${expiresInDays || null}, ${accessCode || null})
      `

      return { success: true, share }
    })

    // DELETE /api/v1/shares/:shareId - revoke a share
    authedApp.delete('/api/v1/shares/:shareId', async (request) => {
      const { shareId } = request.params as { shareId: string }

      await sql`
        SELECT revoke_file_share(${shareId})
      `

      return { success: true, message: 'Share revoked' }
    })
  })
}
