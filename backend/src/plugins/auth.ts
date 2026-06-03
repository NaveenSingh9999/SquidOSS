import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { config } from '../config.js'

export interface JwtPayload {
  sub: string
  email: string
  role: string
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  fastify.register(import('@fastify/jwt'), {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.expiresIn,
    },
  })

  fastify.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Invalid or expired token' })
    }
  })

  fastify.decorate('optionalAuth', async function (request: any) {
    try {
      await request.jwtVerify()
    } catch {
      // No auth required
    }
  })
})
