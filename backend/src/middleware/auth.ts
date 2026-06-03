import { FastifyRequest, FastifyReply } from 'fastify'
import { sql } from '../db/index.js'
import { computeSaltedHash, sha256 } from '../utils/hash.js'

export interface AuthenticatedRequest extends FastifyRequest {
  userId: string
  userEmail: string
  userRole: string
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired token' })
  }
}

export async function optionalAuth(request: FastifyRequest) {
  try {
    await request.jwtVerify()
  } catch {
    // continue without auth
  }
}

export async function requireApiKey(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-squidcloud-key'] as string ||
    request.headers['authorization']?.replace('Bearer ', '')

  if (!apiKey) {
    return reply.status(401).send({ error: 'API key required' })
  }

  const keyPrefix = apiKey.substring(0, 8)

  const keys = await sql<Array<{
    id: string
    user_id: string
    key_hash: string
    key_salt: string
  }>>`
    SELECT id, user_id, key_hash, key_salt FROM api_keys
    WHERE key_prefix = ${keyPrefix} AND is_active = true
  `

  let matchedKey: { id: string; user_id: string } | null = null

  for (const key of keys) {
    const computedHash = computeSaltedHash(apiKey, key.key_salt)
    if (computedHash === key.key_hash) {
      matchedKey = { id: key.id, user_id: key.user_id }
      break
    }
  }

  if (!matchedKey) {
    return reply.status(401).send({ error: 'Invalid API key' })
  }

  await sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${matchedKey.id}`

  ;(request as any).apiKeyId = matchedKey.id
  ;(request as any).userId = matchedKey.user_id
}

export function getUserId(request: FastifyRequest): string {
  return (request as any).userId || (request.user as any)?.sub
}
