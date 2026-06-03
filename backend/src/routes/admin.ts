import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError, ForbiddenError } from '../utils/errors.js'

const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY || 'dev-admin-key'

export default async function adminRoutes(app: FastifyInstance) {
  // POST /api/v1/admin/auth - multi-step admin auth
  app.post('/api/v1/admin/auth', async (request) => {
    const userId = (request as any).userId || (request.user as any)?.sub
    const { step, accessKey, adminUserId, adminPassword, accessPurpose } =
      request.body as {
        step: number
        accessKey?: string
        adminUserId?: string
        adminPassword?: string
        accessPurpose?: string
      }

    if (!step || step < 1 || step > 4) {
      throw new AppError(400, 'Invalid auth step (1-4)')
    }

    if (step === 1) {
      if (!accessKey) {
        throw new AppError(400, 'Access key is required')
      }
      if (accessKey !== ADMIN_ACCESS_KEY) {
        throw new AppError(403, 'Invalid access key')
      }
      return { success: true, step: 2, message: 'Access key verified' }
    }

    if (step === 2) {
      if (!adminUserId) {
        throw new AppError(400, 'Admin user ID is required')
      }
      const [user] = await sql`
        SELECT id, email FROM auth.users WHERE id = ${adminUserId}
      `
      if (!user) {
        throw new AppError(404, 'User not found')
      }
      return { success: true, step: 3, message: 'User verified', user }
    }

    if (step === 3) {
      if (!adminPassword || !accessPurpose) {
        throw new AppError(400, 'Password and purpose are required')
      }
      return { success: true, step: 4, message: 'Ready for authorization' }
    }

    // Step 4 - finalize
    if (step === 4) {
      if (!adminUserId || !accessPurpose || !userId) {
        throw new AppError(400, 'Missing required fields')
      }

      await sql`
        INSERT INTO admin_access_logs (admin_user_id, target_user_id, access_purpose, granted_by, granted_at)
        VALUES (${adminUserId}, ${adminUserId}, ${accessPurpose}, ${userId}, NOW())
      `

      const [session] = await sql`
        SELECT uuid_generate_v4() as token, 'admin' as role
      `

      return {
        success: true,
        step: 'complete',
        message: 'Admin access granted',
        sessionToken: (session as any).token,
        role: 'admin',
      }
    }
  })

  // Middleware to check admin status
  async function requireAdmin(request: any, reply: any) {
    await requireAuth(request, reply)
    if (reply.sent) return
    const userId = request.user.sub as string
    const [user] = await sql`
      SELECT role FROM auth.users WHERE id = ${userId}
    `
    if (!user || (user as any).role !== 'admin') {
      throw new ForbiddenError('Admin access required')
    }
  }

  // GET /api/v1/admin/status - check admin status
  app.get('/api/v1/admin/status', {
    preHandler: requireAdmin,
  }, async (request) => {
    const userId = (request as any).userId
    return { success: true, isAdmin: true, userId }
  })

  // GET /api/v1/admin/users - list users (admin only)
  app.get('/api/v1/admin/users', {
    preHandler: requireAdmin,
  }, async () => {
    const users = await sql`
      SELECT id, email, role, created_at, last_sign_in_at
      FROM auth.users ORDER BY created_at DESC LIMIT 100
    `
    return { users, success: true }
  })

  // POST /api/v1/admin/query - raw SQL query (admin only, read-only)
  app.post('/api/v1/admin/query', {
    preHandler: requireAdmin,
  }, async (request) => {
    const { query } = request.body as { query: string }

    if (!query || !query.trim().toLowerCase().startsWith('select')) {
      throw new AppError(400, 'Only SELECT queries are allowed')
    }

    const result = await sql.unsafe(query)
    return { data: result, success: true }
  })

  // GET /api/v1/admin/logs - admin access logs
  app.get('/api/v1/admin/logs', {
    preHandler: requireAdmin,
  }, async () => {
    const logs = await sql`
      SELECT * FROM admin_access_logs ORDER BY granted_at DESC LIMIT 50
    `
    return { logs, success: true }
  })
}
