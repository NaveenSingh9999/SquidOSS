import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../utils/errors.js'

export default async function storageProviderRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth)

  // POST /api/v1/storage/providers - add external storage provider
  app.post('/api/v1/storage/providers', async (request) => {
    const userId = request.user!.sub as string
    const { providerType, accountId, accessKeyId, secretAccessKey } =
      request.body as {
        providerType: string
        accountId?: string
        accessKeyId: string
        secretAccessKey: string
      }

    if (!providerType || !accessKeyId || !secretAccessKey) {
      throw new AppError(400, 'Missing required provider fields')
    }

    if (providerType === 'r2' && !accountId) {
      throw new AppError(400, 'Account ID is required for Cloudflare R2')
    }

    const credentials = JSON.stringify({
      accessKeyId,
      secretAccessKey,
      accountId: accountId || null,
    })

    const [provider] = await sql`
      INSERT INTO storage_providers (user_id, provider_type, encrypted_credentials, is_default)
      VALUES (${userId}, ${providerType}, ${credentials}, false)
      RETURNING id, provider_type, is_default, created_at
    `

    return { success: true, provider }
  })

  // GET /api/v1/storage/providers - list providers
  app.get('/api/v1/storage/providers', async (request) => {
    const userId = request.user!.sub as string

    const providers = await sql`
      SELECT id, provider_type, is_default, created_at, updated_at
      FROM storage_providers
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `

    return { providers, success: true }
  })

  // DELETE /api/v1/storage/providers/:id
  app.delete('/api/v1/storage/providers/:id', async (request) => {
    const userId = request.user!.sub as string
    const { id } = request.params as { id: string }

    const [deleted] = await sql`
      DELETE FROM storage_providers
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `

    if (!deleted) {
      throw new AppError(404, 'Provider not found')
    }

    return { success: true, message: 'Provider removed' }
  })
}
