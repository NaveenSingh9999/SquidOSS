import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { config } from './config.js'
import { testConnection } from './db/index.js'
import { connectRedis } from './services/redis.js'

import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import fileRoutes from './routes/files.js'
import keyRoutes from './routes/keys.js'
import trashRoutes from './routes/trash.js'
import shareRoutes from './routes/shares.js'
import storageProviderRoutes from './routes/storage-providers.js'
import storageDeviceRoutes from './routes/storage-devices.js'
import videoRoutes from './routes/video.js'
import queryRoutes from './routes/query.js'
import rpcRoutes from './routes/rpc.js'
import storageRoutes from './routes/storage.js'
import healthRoutes from './routes/health.js'
import systemRoutes from './routes/system.js'
import res54Routes from './routes/res54.js'
import res54LocalRoutes from './routes/res54-local.js'
import cbisRoutes from './routes/cbis.js'

import { startHiddenServer, getActivePort } from './services/hidden-server.js'
import { getHiddenServerPort } from './services/db-saas.js'
import { createHash } from 'node:crypto'

export async function buildApp() {
  const app = Fastify({
    logger: false,
    bodyLimit: 200 * 1024 * 1024,
  })

  await app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'authorization', 'x-client-info', 'apikey', 'content-type',
      'x-squidcloud-key', 'x-cbis-key', 'range',
    ],
  })

  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } })
  await app.register(authPlugin)

  // Session heartbeat middleware
  app.addHook('onResponse', async (request, reply) => {
    if (request.url.startsWith('/api/v1') && request.user) {
      const userId = (request.user as any)?.sub
      if (userId) {
        const token = request.headers.authorization?.replace('Bearer ', '') || ''
        const tokenHash = createHash('sha256').update(token).digest('hex')
        const { sql } = await import('./db/index.js')
        try {
          await sql`
            INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, current_route, last_active_at)
            VALUES (${userId}, ${tokenHash}, ${request.ip}, ${request.headers['user-agent'] || ''}, ${request.url}, NOW())
            ON CONFLICT DO NOTHING
          `
          await sql`
            UPDATE user_sessions SET last_active_at = NOW(), current_route = ${request.url}
            WHERE user_id = ${userId} AND token_hash = ${tokenHash} AND is_active = true
          `
        } catch {}
      }
    }
  })

  // Public
  await app.register(healthRoutes)
  await app.register(authRoutes)

  // Authenticated
  await app.register(fileRoutes)
  await app.register(keyRoutes, { prefix: '/api/v1' })
  await app.register(trashRoutes)
  await app.register(storageProviderRoutes)
  await app.register(storageDeviceRoutes)
  await app.register(videoRoutes)
  await app.register(queryRoutes)
  await app.register(rpcRoutes)
  await app.register(storageRoutes)
  await app.register(systemRoutes)
  await app.register(res54Routes)
  await app.register(res54LocalRoutes)
  await app.register(cbisRoutes)
  await app.register(shareRoutes)

  app.get('/api/v1/admin/hidden-port', async (request) => {
    const port = getActivePort()
    if (!port) return { success: false, error: 'Hidden server not started' }
    const token = createHash('sha256').update(`${port}:${Date.now()}:fstf`).digest('hex').slice(0, 16)
    return { success: true, port, token, host: '127.0.0.1' }
  })

  app.get('/api/v1/admin/db-saas/port', async (request) => {
    const port = getActivePort()
    if (!port) return { success: false, error: 'Hidden server not started' }
    return { success: true, port }
  })

  // Root API info
  app.get('/api/v1', async () => ({
    message: 'SquidOSS API v1.0',
    version: '1.0.0',
    endpoints: ['/auth', '/files', '/keys', '/trash', '/shares', '/storage/providers', '/query', '/rpc', '/storage', '/res54', '/res54-local', '/cbis', '/admin'],
  }))

  app.setErrorHandler((error: any, request, reply) => {
    const origin = request.headers.origin || config.cors.origin || '*'
    reply.header('Access-Control-Allow-Origin', origin === true ? '*' : origin)
    reply.header('Access-Control-Allow-Credentials', 'true')
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type, x-squidcloud-key, x-cbis-key, range')
    if (request.method === 'OPTIONS') return reply.status(204).send()
    const statusCode = error.statusCode || 500
    const message = statusCode === 500 && !config.isDev ? 'Internal server error' : error.message
    if (statusCode === 500) app.log.error(error)
    reply.status(statusCode).send({ error: message, code: (error as any).code || 'INTERNAL_ERROR', success: false })
  })

  app.setNotFoundHandler((request, reply) => {
    const origin = request.headers.origin || config.cors.origin || '*'
    reply.header('Access-Control-Allow-Origin', origin === true ? '*' : origin)
    reply.header('Access-Control-Allow-Credentials', 'true')
    reply.status(404).send({ error: `Route ${request.method} ${request.url} not found`, code: 'NOT_FOUND', success: false })
  })

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: `Route ${request.method} ${request.url} not found`, code: 'NOT_FOUND', success: false })
  })

  return app
}

export async function startServer() {
  const app = await buildApp()
  const dbOk = await testConnection()
  if (!dbOk) { app.log.error('Database connection failed'); process.exit(1) }
  app.log.info('Database connected')

  const redisOk = await connectRedis()
  if (redisOk) app.log.info('Redis connected')
  else app.log.warn('Redis not available')

  try {
    await app.listen({ port: config.port, host: config.host })
    app.log.info(`SquidOSS backend running at http://${config.host}:${config.port}`)

    const fstfPort = await getHiddenServerPort()
    const startedPort = await startHiddenServer(fstfPort)
    if (startedPort) {
      app.log.info(`FSTF hidden server on 127.0.0.1:${startedPort} (external nmap invisible)`)
    } else {
      app.log.warn('FSTF hidden server could not start')
    }
  } catch (err) { app.log.error(err); process.exit(1) }

  return app
}
