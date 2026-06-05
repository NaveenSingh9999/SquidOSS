import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError, ForbiddenError } from '../utils/errors.js'
import { randomBytes, createHash } from 'node:crypto'

const SUDO_ROLE = 'sudo'

function hashCbisKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function generateCbisKey(): { publicKey: string; privateKey: string } {
  const raw = randomBytes(32).toString('hex')
  const publicKey = `cbis_pub_${raw.slice(0, 16)}${Date.now().toString(36)}`
  const privateKey = `cbis_sec_${raw}_${randomBytes(16).toString('hex')}`
  return { publicKey, privateKey }
}

export default async function cbisRoutes(app: FastifyInstance) {

  // GET /api/v1/cbis/status — check if current user is sudo
  app.get('/api/v1/cbis/status', { preHandler: [requireAuth] }, async (request) => {
    const userId = (request.user as any).sub
    const [user] = await sql`
      SELECT id, role FROM auth.users WHERE id = ${userId}
    `
    const isSudo = user?.role === SUDO_ROLE
    return { success: true, isSudo, role: user?.role || 'user' }
  })

  // POST /api/v1/cbis/generate — generate a new CBIS keypair
  app.post('/api/v1/cbis/generate', { preHandler: [requireAuth] }, async (request) => {
    const userId = (request.user as any).sub

    // Only sudo users can generate CBIS keys
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (user?.role !== SUDO_ROLE) throw new ForbiddenError('Only sudo accounts can generate CBIS keys')

    // Check existing keys
    const existing = await sql`
      SELECT COUNT(*) as count FROM cbis_keys WHERE user_id = ${userId}
    `
    if ((existing[0] as any).count >= 5) throw new AppError(400, 'Max 5 CBIS keys per account')

    const { publicKey, privateKey } = generateCbisKey()
    const keyHash = hashCbisKey(privateKey)

    await sql`
      INSERT INTO cbis_keys (user_id, public_key, key_hash, created_at)
      VALUES (${userId}, ${publicKey}, ${keyHash}, NOW())
    `

    return {
      success: true,
      publicKey,
      privateKey,
      message: 'Save this private key — it will not be shown again',
    }
  })

  // GET /api/v1/cbis/keys — list user's CBIS public keys
  app.get('/api/v1/cbis/keys', { preHandler: [requireAuth] }, async (request) => {
    const userId = (request.user as any).sub
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (user?.role !== SUDO_ROLE) throw new ForbiddenError('Sudo only')

    const keys = await sql`
      SELECT id, public_key, created_at, last_used_at
      FROM cbis_keys WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `
    return { success: true, keys }
  })

  // DELETE /api/v1/cbis/keys/:id — revoke a CBIS key
  app.delete('/api/v1/cbis/keys/:id', { preHandler: [requireAuth] }, async (request) => {
    const userId = (request.user as any).sub
    const { id } = request.params as any
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (user?.role !== SUDO_ROLE) throw new ForbiddenError('Sudo only')

    const [deleted] = await sql`
      DELETE FROM cbis_keys WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `
    if (!deleted) throw new AppError(404, 'Key not found')
    return { success: true, message: 'CBIS key revoked' }
  })

  // POST /api/v1/cbis/verify — verify a CBIS key for admin operations
  app.post('/api/v1/cbis/verify', { preHandler: [requireAuth] }, async (request) => {
    const userId = (request.user as any).sub
    const { cbisKey } = request.body as { cbisKey: string }
    if (!cbisKey) throw new AppError(400, 'CBIS key required')

    const keyHash = hashCbisKey(cbisKey)
    const [key] = await sql`
      SELECT id, user_id FROM cbis_keys
      WHERE key_hash = ${keyHash} AND user_id = ${userId}
    `
    if (!key) throw new ForbiddenError('Invalid CBIS key')

    // Update last used
    await sql`UPDATE cbis_keys SET last_used_at = NOW() WHERE id = ${(key as any).id}`

    return { success: true, message: 'CBIS key verified', userId: (key as any).user_id }
  })

  // ── Admin endpoints (CBIS-protected) ────────────────────────

  // GET /api/v1/admin/users — list all users
  app.get('/api/v1/admin/users', { preHandler: [requireAuth] }, async (request) => {
    const userId = (request.user as any).sub
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (user?.role !== SUDO_ROLE) throw new ForbiddenError('Sudo only')

    const users = await sql`
      SELECT u.id, u.email, u.role, u.created_at,
             p.full_name, p.storage_used, p.is_premium
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      ORDER BY u.created_at DESC LIMIT 100
    `
    return { success: true, users }
  })

  // PATCH /api/v1/admin/users/:id — update user limits/role
  app.patch('/api/v1/admin/users/:id', { preHandler: [requireAuth] }, async (request) => {
    const sudoId = (request.user as any).sub
    const { id } = request.params as any
    const { role, storageLimit, isPremium } = request.body as any

    const [sudo] = await sql`SELECT role FROM auth.users WHERE id = ${sudoId}`
    if (sudo?.role !== SUDO_ROLE) throw new ForbiddenError('Sudo only')

    if (role) await sql`UPDATE auth.users SET role = ${role} WHERE id = ${id}`
    if (storageLimit) await sql`UPDATE public.profiles SET storage_used = ${storageLimit} WHERE id = ${id}`
    if (isPremium !== undefined) await sql`UPDATE public.profiles SET is_premium = ${isPremium} WHERE id = ${id}`
    return { success: true }
  })

  // GET /api/v1/admin/stats — system usage stats
  app.get('/api/v1/admin/stats', { preHandler: [requireAuth] }, async (request) => {
    const userId = (request.user as any).sub
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (user?.role !== SUDO_ROLE) throw new ForbiddenError('Sudo only')

    const [userCount] = await sql`SELECT COUNT(*) as count FROM auth.users`
    const [fileCount] = await sql`SELECT COUNT(*) as count FROM public.files`
    const [storageTotal] = await sql`SELECT COALESCE(SUM(size), 0) as total FROM public.files`
    const [activeShares] = await sql`SELECT COUNT(*) as count FROM public.shares WHERE expires_at > NOW() OR expires_at IS NULL`

    return {
      success: true,
      stats: {
        users: parseInt((userCount as any).count),
        files: parseInt((fileCount as any).count),
        storageBytes: parseFloat((storageTotal as any).total),
        activeShares: parseInt((activeShares as any).count),
      },
    }
  })

  // POST /api/v1/admin/workspaces — create workspace for any user
  app.post('/api/v1/admin/workspaces', { preHandler: [requireAuth] }, async (request) => {
    const userId = (request.user as any).sub
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (user?.role !== SUDO_ROLE) throw new ForbiddenError('Sudo only')

    const { targetUserId, name } = request.body as { targetUserId: string; name: string }
    if (!targetUserId || !name) throw new AppError(400, 'targetUserId and name required')

    const [ws] = await sql`
      INSERT INTO workspaces (user_id, name) VALUES (${targetUserId}, ${name})
      RETURNING *
    `
    return { success: true, workspace: ws }
  })

  // POST /api/v1/admin/stop-all — stop all active operations (placeholder)
  app.post('/api/v1/admin/stop-all', { preHandler: [requireAuth] }, async (request) => {
    const userId = (request.user as any).sub
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (user?.role !== SUDO_ROLE) throw new ForbiddenError('Sudo only')
    return { success: true, message: 'All operations stopped' }
  })
}
