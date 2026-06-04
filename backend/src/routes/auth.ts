import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { hashPassword, verifyPassword } from '../utils/hash.js'
import { ValidationError, ConflictError, UnauthorizedError } from '../utils/errors.js'

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/register', async (request, reply) => {
    const { email, password, fullName } = request.body as any
    if (!email || !password) throw new ValidationError('Email and password are required')
    if (password.length < 8) throw new ValidationError('Password must be at least 8 characters')

    const existing = await sql`SELECT id FROM auth.users WHERE email = ${email}`
    if (existing.length > 0) throw new ConflictError('Email already registered')

    const userId = crypto.randomUUID()
    const hashed = await hashPassword(password)

    await sql.begin(async (tx) => {
      await tx`INSERT INTO auth.users (id, email, encrypted_password) VALUES (${userId}, ${email}, ${hashed})`
      await tx`INSERT INTO public.profiles (id, full_name) VALUES (${userId}, ${fullName || null})`
    })

    const token = fastify.jwt.sign({ sub: userId, email, role: 'user' })
    return reply.status(201).send({ user: { id: userId, email, fullName: fullName || null }, token })
  })

  fastify.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body as any
    if (!email || !password) throw new ValidationError('Email and password are required')

    const [user] = await sql<Array<{ id: string; encrypted_password: string }>>`
      SELECT id, encrypted_password FROM auth.users WHERE email = ${email}
    `
    if (!user) throw new UnauthorizedError('Invalid email or password')

    const valid = await verifyPassword(password, user.encrypted_password)
    if (!valid) throw new UnauthorizedError('Invalid email or password')

    const token = fastify.jwt.sign({ sub: user.id, email, role: 'user' })
    return { user: { id: user.id, email }, token }
  })

  fastify.get('/auth/me', { preHandler: [fastify.authenticate] }, async (request) => {
    const { sub } = request.user as any
    const [profile] = await sql`
      SELECT p.id, u.email, p.full_name, p.avatar_url, p.storage_used, p.is_admin, p.is_premium, p.pin_enabled
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.id = ${sub}
    `
    return { user: profile }
  })

  // Mark setup as complete (server-side persistence)
  fastify.post('/auth/setup-complete', { preHandler: [fastify.authenticate] }, async (request) => {
    const { sub } = request.user as any
    const { name } = request.body as any
    // Store in app_settings table
    await sql`
      INSERT INTO app_settings (key, value, user_id)
      VALUES ('setup_complete', 'true', ${sub})
      ON CONFLICT (key, user_id) DO UPDATE SET value = 'true', updated_at = NOW()
    `
    if (name) {
      const existing = await sql`SELECT id FROM app_settings WHERE key = 'server_name' AND user_id = ${sub}`
      if (existing.length === 0) {
        await sql`
          INSERT INTO app_settings (key, value, user_id)
          VALUES ('server_name', ${name}, ${sub})
        `
      }
    }
    return { ok: true }
  })

  // Check setup status from server
  fastify.get('/auth/setup-status', async () => {
    const [row] = await sql`
      SELECT value FROM app_settings WHERE key = 'setup_complete' LIMIT 1
    `
    return { setupComplete: row?.value === 'true' }
  })
}
