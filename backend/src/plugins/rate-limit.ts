import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { rateLimit } from '../services/redis.js'
import { getUserId } from '../middleware/auth.js'

interface RateLimitOptions {
  windowSec?: number
  max?: number
  name?: string
}

export async function rateLimitPlugin(app: FastifyInstance, options: RateLimitOptions = {}) {
  const windowSec = options.windowSec || 60
  const max = options.max || 100

  app.decorateRequest('rateLimited', false)

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(request) || request.ip
    const key = `ratelimit:${options.name || 'default'}:${userId}`

    const result = await rateLimit(key, max, windowSec)

    reply.header('X-RateLimit-Limit', max)
    reply.header('X-RateLimit-Remaining', result.remaining)
    reply.header('X-RateLimit-Reset', result.resetAt)

    if (!result.allowed) {
      return reply.status(429).send({
        error: 'Too many requests, please try again later',
        code: 'RATE_LIMITED',
        success: false,
      })
    }
  })
}
