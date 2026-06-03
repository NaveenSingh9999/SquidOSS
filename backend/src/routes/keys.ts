import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { generateApiKey, computeSaltedHash, generateSalt, generateKeyPrefix } from '../utils/hash.js'
import { ConflictError, NotFoundError } from '../utils/errors.js'

export default async function keyRoutes(fastify: FastifyInstance) {
  fastify.get('/keys', { preHandler: [fastify.authenticate] }, async (request) => {
    const { sub: userId } = request.user as any
    const keys = await sql`
      SELECT id, name, key_prefix, scopes, is_active, last_used_at, created_at
      FROM api_keys WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `
    return { keys }
  })

  fastify.post('/keys', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { sub: userId } = request.user as any
    const { name, scopes } = request.body as any

    const [count] = await sql`
      SELECT COUNT(*)::int as count FROM api_keys WHERE user_id = ${userId} AND is_active = true
    `
    if (count.count >= 10) throw new ConflictError('Maximum of 10 API keys allowed')

    const apiKey = generateApiKey()
    const keyPrefix = generateKeyPrefix(apiKey)
    const salt = generateSalt()
    const keyHash = computeSaltedHash(apiKey, salt)

    const [keyRecord] = await sql`
      INSERT INTO api_keys (user_id, name, key_hash, key_salt, key_prefix, scopes)
      VALUES (${userId}, ${name || 'My Key'}, ${keyHash}, ${salt}, ${keyPrefix}, ${scopes || ['read', 'write', 'delete']})
      RETURNING id, name, key_prefix, scopes, created_at
    `

    return reply.status(201).send({ apiKey, keyData: keyRecord })
  })

  fastify.delete('/keys/:id', { preHandler: [fastify.authenticate] }, async (request) => {
    const { sub: userId } = request.user as any
    const { id } = request.params as any

    const [key] = await sql`
      DELETE FROM api_keys WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `
    if (!key) throw new NotFoundError('API key')
    return { success: true }
  })
}
