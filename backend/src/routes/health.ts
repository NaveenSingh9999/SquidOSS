import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    try {
      await sql`SELECT 1`
      return { status: 'healthy', database: 'connected', timestamp: new Date().toISOString() }
    } catch (error: any) {
      reply.status(503)
      return { status: 'unhealthy', database: 'disconnected', error: error.message }
    }
  })
}
