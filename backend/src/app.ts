import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { config } from './config.js'
import { testConnection, sql } from './db/index.js'
import { connectRedis } from './services/redis.js'
import { AppError } from './utils/errors.js'

import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import fileRoutes from './routes/files.js'
import keyRoutes from './routes/keys.js'
import trashRoutes from './routes/trash.js'
import shareRoutes from './routes/shares.js'
import storageProviderRoutes from './routes/storage-providers.js'
import videoRoutes from './routes/video.js'
import adminRoutes from './routes/admin.js'
import fileOpsRoutes from './routes/file-operations.js'
import queryRoutes from './routes/query.js'
import rpcRoutes from './routes/rpc.js'
import storageRoutes from './routes/storage.js'
import passkeyRoutes from './routes/passkey.js'
import healthRoutes from './routes/health.js'

export async function buildApp() {
  const app = Fastify({
    logger: config.isDev ? { transport: { target: 'pino-pretty' } } : true,
    bodyLimit: 200 * 1024 * 1024, // 200MB
  })

  await app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'authorization', 'x-client-info', 'apikey', 'content-type',
      'x-squidcloud-key', 'x-squidcloud-encryption-key', 'x-encryption-key',
      'x-kza-session', 'range', 'x-forwarded-for', 'user-agent',
    ],
  })

  await app.register(multipart, {
    limits: { fileSize: 200 * 1024 * 1024 },
  })

  await app.register(authPlugin)

  // Health check
  await app.register(healthRoutes)

  // Public routes
  await app.register(authRoutes)
  await app.register(shareRoutes)
  await app.register(passkeyRoutes)

  // Authenticated routes
  await app.register(fileRoutes)
  await app.register(keyRoutes, { prefix: '/api/v1' })
  await app.register(trashRoutes)
  await app.register(storageProviderRoutes)
  await app.register(videoRoutes)
  await app.register(adminRoutes)
  await app.register(fileOpsRoutes)
  await app.register(queryRoutes)
  await app.register(rpcRoutes)
  await app.register(storageRoutes)

  // Root API info
  app.get('/api/v1', async () => ({
    message: 'SquidOSS API v1.0',
    version: '1.0.0',
    endpoints: [
      '/auth', '/files', '/keys', '/trash', '/shares',
      '/video', '/admin', '/storage/providers',
      '/query', '/rpc', '/storage',
    ],
  }))

  // Generic edge function invoker
  app.post('/api/v1/edge/:functionName', async (request, reply) => {
    const { functionName } = request.params as { functionName: string }
    const userId = (request as any).userId || (request.user as any)?.sub

    const edgeRoutes: Record<string, (req: any) => Promise<any>> = {
      'github-storage': async (req) => {
        return { success: true, message: 'GitHub storage endpoint' }
      },
      'gemini-api': async (req) => {
        const { prompt, action, fileId } = req.body || {}
        return { success: true, message: 'Gemini API placeholder' }
      },
      'squid-ai-chat': async (req) => {
        const { messages, context } = req.body || {}
        return { success: true, message: 'AI chat placeholder' }
      },
      'download-manager': async (req) => {
        return { success: true, message: 'Download manager placeholder' }
      },
      'download-shared-file': async (req) => {
        const { shareId } = req.body || {}
        return { success: true, message: 'Shared download placeholder' }
      },
      'hls-generation': async (req) => {
        const { fileId } = req.body || {}
        return { success: true, message: 'HLS generation placeholder' }
      },
      'create-repos': async (req) => {
        const { count } = req.body || {}
        return { success: true, repositories: [], message: 'Repo creation placeholder' }
      },
      'secure-file-metadata': async (req) => {
        const { fileId } = req.body || {}
        if (!fileId) throw new AppError(400, 'File ID required')
        const [file] = await sql`SELECT * FROM files WHERE id = ${fileId}`
        return { success: true, file, metadata: file?.tags || null }
      },
      'send-workspace-invite': async (req) => {
        const { workspaceId, email, role } = req.body || {}
        if (!workspaceId || !email) throw new AppError(400, 'Workspace ID and email required')
        const [invite] = await sql`
          INSERT INTO workspace_invites (workspace_id, email, role, invited_by)
          VALUES (${workspaceId}, ${email}, ${role || 'viewer'}, ${userId})
          RETURNING *
        `
        return { success: true, invite }
      },
      'migration-oauth': async (req) => {
        return { success: true, url: null, message: 'OAuth migration placeholder' }
      },
      'migration-oauth-callback': async (req) => {
        const { code } = req.body || {}
        return { success: true, message: 'OAuth callback placeholder' }
      },
      'start-cloud-import': async (req) => {
        const { provider, files } = req.body || {}
        return { success: true, message: 'Cloud import placeholder' }
      },
      'ink-ai': async (req) => {
        const { prompt } = req.body || {}
        return { success: true, response: 'AI response placeholder' }
      },
      'start-migration': async (req) => {
        return { success: true, message: 'Migration placeholder' }
      },
      'cli-operations': async (req) => {
        return { success: true, message: 'CLI operations placeholder' }
      },
      'verify-admin': async (req) => {
        if (!userId) throw new AppError(401, 'Unauthorized')
        const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
        const isAdmin = user?.role === 'admin'
        return { success: true, isAdmin, role: user?.role || 'user' }
      },
      'check-admin-status': async (req) => {
        if (!userId) throw new AppError(401, 'Unauthorized')
        const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
        return { success: true, isAdmin: user?.role === 'admin', role: user?.role || 'user' }
      },
      'api-key-management': async (req) => {
        if (!userId) throw new AppError(401, 'Unauthorized')
        const { action, keyId, name, scopes } = req.body || {}
        if (action === 'list') {
          const keys = await sql`
            SELECT id, name, key_prefix, scopes, created_at, last_used_at
            FROM api_keys WHERE user_id = ${userId} ORDER BY created_at DESC
          `
          return { keys, success: true }
        }
        return { success: true, message: 'API key management' }
      },
      'cloud-file-browser': async (req) => {
        const { action, path } = req.body || {}
        return { success: true, files: [], folders: [], message: 'Cloud file browser placeholder' }
      },
      'admin-data-access': async (req) => {
        const { action, query, table } = req.body || {}
        if (!userId) throw new AppError(401, 'Unauthorized')
        const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
        if (user?.role !== 'admin') throw new AppError(403, 'Admin required')
        if (action === 'query' && query) {
          if (!query.trim().toLowerCase().startsWith('select')) throw new AppError(400, 'Only SELECT allowed')
          const data = await sql.unsafe(query)
          return { success: true, data }
        }
        if (action === 'users') {
          const users = await sql`SELECT id, email, role, created_at FROM auth.users ORDER BY created_at DESC LIMIT 100`
          return { success: true, users }
        }
        return { success: true, message: 'Admin data access' }
      },
      'github-cluster': async (req) => {
        const { action } = req.body || {}
        return { success: true, repos: [], message: 'GitHub cluster placeholder' }
      },
      'get-app-updates': async (req) => {
        return { success: true, updates: [], currentVersion: '1.0.0', message: 'App updates placeholder' }
      },
      'add-app-update': async (req) => {
        return { success: true, message: 'App update added placeholder' }
      },
      'file-key': async (req) => {
        return { success: true, key: null, message: 'File key placeholder' }
      },
      'video-stream-url': async (req) => {
        const { fileId, quality } = req.body || {}
        return { success: true, url: null, token: null, message: 'Video stream placeholder' }
      },
      'media-manifest': async (req) => {
        const { fileId } = req.body || {}
        return { success: true, manifest: null, message: 'Media manifest placeholder' }
      },
    }

    const handler = edgeRoutes[functionName]
    if (!handler) {
      return reply.status(404).send({
        error: `Edge function '${functionName}' not found`,
        success: false,
      })
    }

    return handler(request)
  })

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500
    const message = statusCode === 500 && !config.isDev
      ? 'Internal server error'
      : error.message

    if (statusCode === 500) {
      app.log.error(error)
    }

    reply.status(statusCode).send({
      error: message,
      code: (error as any).code || 'INTERNAL_ERROR',
      success: false,
    })
  })

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: `Route ${request.method} ${request.url} not found`,
      code: 'NOT_FOUND',
      success: false,
    })
  })

  return app
}

export async function startServer() {
  const app = await buildApp()

  const dbOk = await testConnection()
  if (!dbOk) {
    app.log.error('Database connection failed. Make sure PostgreSQL is running.')
    process.exit(1)
  }
  app.log.info('Database connected')

  // Redis is optional - start gracefully
  const redisOk = await connectRedis()
  if (redisOk) {
    app.log.info('Redis connected')
  } else {
    app.log.warn('Redis not available - rate limiting and caching disabled')
  }

  try {
    await app.listen({ port: config.port, host: config.host })
    app.log.info(`SquidOSS backend running at http://${config.host}:${config.port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  return app
}
