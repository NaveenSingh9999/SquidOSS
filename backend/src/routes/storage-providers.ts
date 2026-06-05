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

  // POST /api/v1/storage/providers/github-init - create 10 private repos
  app.post('/api/v1/storage/providers/github-init', async (request) => {
    const userId = request.user!.sub as string
    const { token, owner } = request.body as any
    if (!token || !owner) {
      throw new AppError(400, 'GitHub token and owner required')
    }

    const repos: Array<{
      repo_name: string
      repo_full_name: string
      repo_url: string
      clone_url: string
    }> = []

    for (let i = 0; i < 10; i++) {
      const repoName = `squidoss-${String(i).padStart(2, '0')}`
      try {
        const res = await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json',
          },
          body: JSON.stringify({
            name: repoName,
            private: true,
            description: `SquidOSS storage repository ${i + 1}/10`,
            auto_init: false,
          }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.message || `Failed to create ${repoName}`)
        }

        const data = await res.json()
        repos.push({
          repo_name: data.name,
          repo_full_name: data.full_name,
          repo_url: data.html_url,
          clone_url: data.clone_url,
        })

        // Store in DB
        await sql`
          INSERT INTO github_repos (user_id, repo_name, repo_full_name, repo_url, clone_url)
          VALUES (${userId}, ${data.name}, ${data.full_name}, ${data.html_url}, ${data.clone_url})
        `
      } catch (e: any) {
        request.log.error({ repoName, error: e.message }, 'GitHub repo creation failed')
      }
    }

    return { success: true, reposCreated: repos.length, repos }
  })

  // PATCH /api/v1/storage/providers/:id/default - set as default
  app.patch('/api/v1/storage/providers/:id/default', async (request) => {
    const userId = request.user!.sub as string
    const { id } = request.params as { id: string }

    // Unset any existing default
    await sql`
      UPDATE storage_providers SET is_default = false
      WHERE user_id = ${userId} AND is_default = true
    `

    // Set the new default
    const [updated] = await sql`
      UPDATE storage_providers SET is_default = true
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id, provider_type, is_default
    `

    if (!updated) throw new AppError(404, 'Provider not found')
    return { success: true, provider: updated }
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
