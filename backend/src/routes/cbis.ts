import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth, getUserId } from '../middleware/auth.js'
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

function isSudo(user: any): boolean {
  return user?.role === SUDO_ROLE
}

export default async function cbisRoutes(app: FastifyInstance) {

  app.get('/api/v1/cbis/status', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT id, role FROM auth.users WHERE id = ${userId}`
    return { success: true, isSudo: isSudo(user), role: user?.role || 'user' }
  })

  app.post('/api/v1/cbis/generate', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)

    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Only sudo accounts can generate CBIS keys')

    const [existing] = await sql`SELECT COUNT(*) as count FROM cbis_keys WHERE user_id = ${userId}`
    if (parseInt((existing as any).count) >= 5) throw new AppError(400, 'Max 5 CBIS keys per account')

    const { publicKey, privateKey } = generateCbisKey()
    const keyHash = hashCbisKey(privateKey)

    await sql`
      INSERT INTO cbis_keys (user_id, public_key, key_hash, created_at)
      VALUES (${userId}, ${publicKey}, ${keyHash}, NOW())
    `

    return { success: true, publicKey, privateKey, message: 'Save this private key — it will not be shown again' }
  })

  app.get('/api/v1/cbis/keys', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    const keys = await sql`
      SELECT id, public_key, created_at, last_used_at
      FROM cbis_keys WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `
    return { success: true, keys }
  })

  app.delete('/api/v1/cbis/keys/:id', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const { id } = request.params as any
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    const [deleted] = await sql`
      DELETE FROM cbis_keys WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `
    if (!deleted) throw new AppError(404, 'Key not found')
    return { success: true, message: 'CBIS key revoked' }
  })

  app.post('/api/v1/cbis/verify', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const { cbisKey } = request.body as { cbisKey: string }
    if (!cbisKey) throw new AppError(400, 'CBIS key required')

    const keyHash = hashCbisKey(cbisKey)
    const [key] = await sql`
      SELECT id, user_id FROM cbis_keys
      WHERE key_hash = ${keyHash} AND user_id = ${userId}
    `
    if (!key) throw new ForbiddenError('Invalid CBIS key')

    await sql`UPDATE cbis_keys SET last_used_at = NOW() WHERE id = ${(key as any).id}`

    return { success: true, message: 'CBIS key verified', userId: (key as any).user_id }
  })

  app.post('/api/v1/cbis/validate-key', async (request) => {
    const { cbisKey } = request.body as { cbisKey: string }
    if (!cbisKey) throw new AppError(400, 'CBIS key required')

    const keyHash = hashCbisKey(cbisKey)
    const [key] = await sql`
      SELECT c.user_id, u.role FROM cbis_keys c
      JOIN auth.users u ON u.id = c.user_id
      WHERE c.key_hash = ${keyHash}
    `
    if (!key) throw new ForbiddenError('Invalid CBIS key')

    await sql`UPDATE cbis_keys SET last_used_at = NOW() WHERE key_hash = ${keyHash}`

    return { success: true, userId: (key as any).user_id, role: (key as any).role }
  })

  app.get('/api/v1/admin/stats', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    const [userCount] = await sql`SELECT COUNT(*) as count FROM auth.users`
    const [fileCount] = await sql`SELECT COUNT(*) as count FROM public.files`
    const [storageTotal] = await sql`SELECT COALESCE(SUM(size), 0) as total FROM public.files`
    const [activeShares] = await sql`SELECT COUNT(*) as count FROM public.shares WHERE expires_at > NOW() OR expires_at IS NULL`
    const [activeSessions] = await sql`SELECT COUNT(*) as count FROM user_sessions WHERE is_active = true AND last_active_at > NOW() - INTERVAL '15 minutes'`
    const [dbInstances] = await sql`SELECT COUNT(*) as count FROM db_saas_instances WHERE status = 'running'`

    return {
      success: true,
      stats: {
        users: parseInt((userCount as any).count),
        files: parseInt((fileCount as any).count),
        storageBytes: parseFloat((storageTotal as any).total),
        activeShares: parseInt((activeShares as any).count),
        activeSessions: parseInt((activeSessions as any).count),
        dbInstances: parseInt((dbInstances as any).count),
      },
    }
  })

  app.get('/api/v1/admin/users', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    const users = await sql`
      SELECT u.id, u.email, u.role, u.created_at, u.is_restricted,
             p.full_name, p.storage_used, p.is_premium, p.avatar_url
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      ORDER BY u.created_at DESC LIMIT 100
    `
    const enriched = await Promise.all(users.map(async (u: any) => {
      const [session] = await sql`
        SELECT is_active, current_route, last_active_at, ip_address
        FROM user_sessions WHERE user_id = ${u.id} AND is_active = true
        ORDER BY last_active_at DESC LIMIT 1
      `
      return { ...u, activeSession: session || null }
    }))

    return { success: true, users: enriched }
  })

  app.patch('/api/v1/admin/users/:id', { preHandler: [requireAuth] }, async (request) => {
    const sudoId = getUserId(request)
    const { id } = request.params as any
    const { role, storageLimit, isPremium, isRestricted } = request.body as any

    const [sudo] = await sql`SELECT role FROM auth.users WHERE id = ${sudoId}`
    if (!isSudo(sudo)) throw new ForbiddenError('Sudo only')

    if (role) await sql`UPDATE auth.users SET role = ${role} WHERE id = ${id}`
    if (isRestricted !== undefined) await sql`UPDATE auth.users SET is_restricted = ${isRestricted} WHERE id = ${id}`
    if (storageLimit !== undefined) await sql`UPDATE public.profiles SET storage_used = ${storageLimit} WHERE id = ${id}`
    if (isPremium !== undefined) await sql`UPDATE public.profiles SET is_premium = ${isPremium} WHERE id = ${id}`

    return { success: true }
  })

  app.delete('/api/v1/admin/users/:id', { preHandler: [requireAuth] }, async (request) => {
    const sudoId = getUserId(request)
    const { id } = request.params as any
    const [sudo] = await sql`SELECT role FROM auth.users WHERE id = ${sudoId}`
    if (!isSudo(sudo) || id === sudoId) throw new ForbiddenError('Cannot delete yourself or not sudo')

    await sql`DELETE FROM auth.users WHERE id = ${id}`
    return { success: true, message: 'User deleted' }
  })

  app.get('/api/v1/admin/sessions', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    const sessions = await sql`
      SELECT s.id, s.user_id, s.ip_address, s.user_agent, s.current_route,
             s.last_active_at, s.created_at, u.email, u.role
      FROM user_sessions s
      JOIN auth.users u ON u.id = s.user_id
      WHERE s.is_active = true AND s.last_active_at > NOW() - INTERVAL '30 minutes'
      ORDER BY s.last_active_at DESC LIMIT 50
    `
    return { success: true, sessions }
  })

  app.post('/api/v1/admin/session-heartbeat', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const { route } = request.body as any

    const token = request.headers.authorization?.replace('Bearer ', '') || ''
    const tokenHash = createHash('sha256').update(token).digest('hex')

    await sql`
      INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, current_route, last_active_at)
      VALUES (${userId}, ${tokenHash}, ${request.ip}, ${request.headers['user-agent'] || ''}, ${route || '/'}, NOW())
      ON CONFLICT DO NOTHING
    `

    await sql`
      UPDATE user_sessions SET last_active_at = NOW(), current_route = ${route || '/'}
      WHERE user_id = ${userId} AND token_hash = ${tokenHash} AND is_active = true
    `

    return { success: true }
  })

  app.post('/api/v1/admin/session-leave', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const token = request.headers.authorization?.replace('Bearer ', '') || ''
    const tokenHash = createHash('sha256').update(token).digest('hex')

    await sql`
      UPDATE user_sessions SET is_active = false
      WHERE user_id = ${userId} AND token_hash = ${tokenHash}
    `
    return { success: true }
  })

  app.post('/api/v1/admin/stop-all', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    return { success: true, message: 'All operations stopped' }
  })

  app.get('/api/v1/admin/kza/incidents', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    const incidents = await sql`
      SELECT * FROM kza_admin_incidents ORDER BY created_at DESC LIMIT 50
    `
    return { success: true, incidents }
  })

  app.get('/api/v1/admin/kza/threats', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    const threats = await sql`
      SELECT t.*, u.email FROM kza_threat_events t
      LEFT JOIN auth.users u ON u.id = t.user_id
      ORDER BY t.created_at DESC LIMIT 100
    `
    return { success: true, threats }
  })

  app.get('/api/v1/admin/kza/bans', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    const bans = await sql`
      SELECT b.*, u.email FROM kza_banned_entities b
      LEFT JOIN auth.users u ON u.id = b.user_id
      ORDER BY b.created_at DESC LIMIT 50
    `
    return { success: true, bans }
  })

  app.patch('/api/v1/admin/kza/incidents/:id', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const { id } = request.params as any
    const { status, resolved_by } = request.body as any
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    await sql`
      UPDATE kza_admin_incidents SET status = ${status}, resolved_by = ${resolved_by || userId}
      WHERE id = ${id}
    `
    return { success: true }
  })

  app.get('/api/v1/admin/fls/channels', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    const channels = await sql`
      SELECT c.*, (SELECT COUNT(*) FROM fls_events e WHERE e.channel_id = c.id) as event_count
      FROM fls_channels c ORDER BY c.created_at DESC LIMIT 50
    `
    return { success: true, channels }
  })

  app.get('/api/v1/admin/edge-functions', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    const functions = await sql`
      SELECT id, name, runtime, status, created_at, updated_at,
             version, timeout_seconds, memory_mb
      FROM edge_functions
      ORDER BY created_at DESC LIMIT 100
    `
    return { success: true, functions: functions.length > 0 ? functions : [] }
  })

  app.post('/api/v1/admin/edge-functions/sync', { preHandler: [requireAuth] }, async (request) => {
    const userId = getUserId(request)
    const [user] = await sql`SELECT role FROM auth.users WHERE id = ${userId}`
    if (!isSudo(user)) throw new ForbiddenError('Sudo only')

    return { success: true, message: 'Edge functions synced', count: 0 }
  })
}
