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
import videoRoutes from './routes/video.js'
import queryRoutes from './routes/query.js'
import rpcRoutes from './routes/rpc.js'
import storageRoutes from './routes/storage.js'
import healthRoutes from './routes/health.js'
import systemRoutes from './routes/system.js'
import res54Routes from './routes/res54.js'
import cbisRoutes from './routes/cbis.js'

export async function buildApp() {
  const app = Fastify({
    logger: config.isDev ? { transport: { target: 'pino-pretty' } } : true,
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

  // Public
  await app.register(healthRoutes)
  await app.register(authRoutes)

  // Authenticated
  await app.register(fileRoutes)
  await app.register(keyRoutes, { prefix: '/api/v1' })
  await app.register(trashRoutes)
  await app.register(storageProviderRoutes)
  await app.register(videoRoutes)
  await app.register(queryRoutes)
  await app.register(rpcRoutes)
  await app.register(storageRoutes)
  await app.register(systemRoutes)
  await app.register(res54Routes)
  await app.register(cbisRoutes)
  await app.register(shareRoutes)

  // Root API info
  app.get('/api/v1', async () => ({
    message: 'SquidOSS API v1.0',
    version: '1.0.0',
    endpoints: ['/auth', '/files', '/keys', '/trash', '/shares', '/storage/providers', '/query', '/rpc', '/storage', '/res54', '/cbis'],
  }))

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500
    const message = statusCode === 500 && !config.isDev ? 'Internal server error' : error.message
    if (statusCode === 500) app.log.error(error)
    reply.status(statusCode).send({ error: message, code: (error as any).code || 'INTERNAL_ERROR', success: false })
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
  } catch (err) { app.log.error(err); process.exit(1) }
  return app
}
