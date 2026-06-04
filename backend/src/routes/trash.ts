import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../utils/errors.js'

export default async function trashRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth)

  // GET /api/v1/trash - list trashed files
  app.get('/api/v1/trash', async (request) => {
    const userId = request.user!.sub as string

    const files = await sql`
      SELECT * FROM files
      WHERE user_id = ${userId} AND is_deleted = true
      ORDER BY deleted_at DESC
    `

    return { files, success: true }
  })

  // POST /api/v1/trash - trash operations
  app.post('/api/v1/trash', async (request, reply) => {
    const userId = request.user!.sub as string
    const { action, fileId } = request.body as {
      action: 'cleanup' | 'restore' | 'permanent_delete'
      fileId?: string
    }

    if (!action) {
      throw new AppError(400, 'Action is required')
    }

    if (action === 'cleanup') {
      await sql`DELETE FROM files WHERE user_id = ${userId} AND is_deleted = true`
      return { success: true, message: 'Trash cleaned up' }
    }

    if (!fileId) {
      throw new AppError(400, 'File ID is required for this action')
    }

    if (action === 'restore') {
      await sql`
        UPDATE files SET is_deleted = false, deleted_at = NULL
        WHERE id = ${fileId} AND user_id = ${userId}
      `
      return { success: true, message: 'File restored' }
    }

    if (action === 'permanent_delete') {
      const file = await sql`
        DELETE FROM files
        WHERE id = ${fileId} AND user_id = ${userId} AND is_deleted = true
        RETURNING id, storage_path
      `
      if (file.length === 0) {
        throw new AppError(404, 'File not found in trash')
      }
      return { success: true, message: 'File permanently deleted' }
    }

    throw new AppError(400, 'Invalid action')
  })
}
