import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth, getUserId } from '../middleware/auth.js'
import { AppError } from '../utils/errors.js'

interface GithubRepo {
  id: number
  repo_full_name: string
  clone_url: string
}

export default async function res54Routes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth)

  // GET /api/v1/res54/repos - list all GitHub repos for res54
  app.get('/api/v1/res54/repos', async (request) => {
    const userId = getUserId(request)
    const repos = await sql`
      SELECT id, repo_name, repo_full_name, repo_url, clone_url
      FROM github_repos
      WHERE user_id = ${userId}
      ORDER BY repo_name
    `
    return { repos, success: true }
  })

  // POST /api/v1/res54/store-chunk - store an encrypted chunk in a GitHub repo
  app.post('/api/v1/res54/store-chunk', async (request, reply) => {
    const userId = getUserId(request)
    const { repoFullName, path, content, token } = request.body as {
      repoFullName: string
      path: string
      content: string  // base64-encoded encrypted content
      token: string    // GitHub PAT
    }

    if (!repoFullName || !path || !content || !token) {
      throw new AppError(400, 'Missing required fields: repoFullName, path, content, token')
    }

    // Verify repo belongs to user
    const [repo] = await sql`
      SELECT id FROM github_repos
      WHERE repo_full_name = ${repoFullName} AND user_id = ${userId}
    `
    if (!repo) {
      throw new AppError(404, 'GitHub repo not found')
    }

    // Encode the base64 content properly for GitHub API
    const encoded = Buffer.from(content, 'base64').toString('base64')

    const res = await fetch(`https://api.github.com/repos/${repoFullName}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        message: `res54 chunk: ${path}`,
        content: encoded,
      }),
    })

    if (!res.ok) {
      const err: any = await res.json()
      request.log.error({ repoFullName, path, error: err?.message }, 'Failed to store chunk')
      throw new AppError(502, `GitHub API error: ${err?.message || 'Unknown'}`)
    }

    const data: any = await res.json()
    return { success: true, sha: data?.content?.sha, path: data?.content?.path }
  })

  // GET /api/v1/res54/get-chunk - retrieve a chunk from a GitHub repo
  app.get('/api/v1/res54/get-chunk', async (request) => {
    const userId = getUserId(request)
    const query = request.query as {
      repoFullName: string
      path: string
      token: string
    }

    if (!query.repoFullName || !query.path || !query.token) {
      throw new AppError(400, 'Missing required query params')
    }

    // Verify repo belongs to user
    const [repo] = await sql`
      SELECT id FROM github_repos
      WHERE repo_full_name = ${query.repoFullName} AND user_id = ${userId}
    `
    if (!repo) {
      throw new AppError(404, 'GitHub repo not found')
    }

    const res = await fetch(`https://api.github.com/repos/${query.repoFullName}/contents/${query.path}`, {
      headers: {
        'Authorization': `Bearer ${query.token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    })

    if (!res.ok) {
      throw new AppError(502, 'Failed to retrieve chunk from GitHub')
    }

    const data = await res.json() as any
    // GitHub returns base64-encoded content
    const decoded = Buffer.from(data.content, 'base64').toString('utf-8')

    return { success: true, content: decoded, sha: data.sha }
  })

  // DELETE /api/v1/res54/delete-chunk - delete a chunk from GitHub
  app.delete('/api/v1/res54/delete-chunk', async (request) => {
    const userId = getUserId(request)
    const { repoFullName, path, token, sha } = request.body as {
      repoFullName: string
      path: string
      token: string
      sha: string
    }

    if (!repoFullName || !path || !token) {
      throw new AppError(400, 'Missing required fields')
    }

    const [repo] = await sql`
      SELECT id FROM github_repos
      WHERE repo_full_name = ${repoFullName} AND user_id = ${userId}
    `
    if (!repo) {
      throw new AppError(404, 'GitHub repo not found')
    }

    const res = await fetch(`https://api.github.com/repos/${repoFullName}/contents/${path}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        message: `res54 delete: ${path}`,
        sha,
      }),
    })

    if (!res.ok) {
      throw new AppError(502, 'Failed to delete chunk from GitHub')
    }

    return { success: true }
  })

  // GET /api/v1/res54/status - get distributed storage status
  app.get('/api/v1/res54/status', async (request) => {
    const userId = getUserId(request)

    const repos = await sql`
      SELECT id, repo_name, repo_full_name, repo_url
      FROM github_repos
      WHERE user_id = ${userId}
      ORDER BY repo_name
    `

    const providers = await sql`
      SELECT id, provider_type, is_default
      FROM storage_providers
      WHERE user_id = ${userId}
    `

    return {
      success: true,
      providers,
      githubRepos: repos,
      totalRepos: repos.length,
      activeProviders: providers.length,
    }
  })
}
