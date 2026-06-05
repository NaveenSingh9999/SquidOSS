import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { hashPassword, verifyPassword } from '../utils/hash.js'
import { ValidationError, ConflictError, UnauthorizedError } from '../utils/errors.js'

export default async function authRoutes(fastify: FastifyInstance) {
  // Register — if first user, make them sudo (admin)
  fastify.post('/auth/register', async (request, reply) => {
    const { email, password, fullName } = request.body as any
    if (!email || !password) throw new ValidationError('Email and password are required')
    if (password.length < 8) throw new ValidationError('Password must be at least 8 characters')

    const existing = await sql`SELECT id FROM auth.users WHERE email = ${email}`
    if (existing.length > 0) throw new ConflictError('Email already registered')

    const userId = crypto.randomUUID()
    const hashed = await hashPassword(password)

    // First user gets sudo role
    const [count] = await sql`SELECT COUNT(*) as count FROM auth.users`
    const isFirst = parseInt((count as any).count) === 0
    const role = isFirst ? 'sudo' : 'user'

    await sql.begin(async (tx) => {
      await tx`INSERT INTO auth.users (id, email, encrypted_password, role) VALUES (${userId}, ${email}, ${hashed}, ${role})`
      await tx`INSERT INTO public.profiles (id, full_name) VALUES (${userId}, ${fullName || null})`
    })

    const token = fastify.jwt.sign({ sub: userId, email, role })
    return reply.status(201).send({
      user: { id: userId, email, fullName: fullName || null, role },
      token,
      isSudo: isFirst,
    })
  })

  // Login
  fastify.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body as any
    if (!email || !password) throw new ValidationError('Email and password are required')

    const [user] = await sql<Array<{ id: string; encrypted_password: string; role: string }>>`
      SELECT id, encrypted_password, role FROM auth.users WHERE email = ${email}
    `
    if (!user) throw new UnauthorizedError('Invalid email or password')

    const valid = await verifyPassword(password, user.encrypted_password)
    if (!valid) throw new UnauthorizedError('Invalid email or password')

    const token = fastify.jwt.sign({ sub: user.id, email, role: user.role })
    return { user: { id: user.id, email, role: user.role }, token }
  })

  // Me
  fastify.get('/auth/me', { preHandler: [fastify.authenticate] }, async (request) => {
    const { sub } = request.user as any
    const [profile] = await sql`
      SELECT p.id, u.email, u.role, p.full_name, p.avatar_url, p.storage_used, p.is_admin, p.is_premium
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.id = ${sub}
    `
    return { user: profile }
  })

  // Setup complete
  fastify.post('/auth/setup-complete', { preHandler: [fastify.authenticate] }, async (request) => {
    const { sub } = request.user as any
    const { name } = request.body as any
    await sql`INSERT INTO app_settings (key, value, user_id) VALUES ('setup_complete', 'true', ${sub})`
    if (name) await sql`INSERT INTO app_settings (key, value, user_id) VALUES ('server_name', ${name}, ${sub})`
    return { ok: true }
  })

  // Setup status
  fastify.get('/auth/setup-status', async () => {
    const [row] = await sql`SELECT value FROM app_settings WHERE key = 'setup_complete' LIMIT 1`
    return { setupComplete: row?.value === 'true' }
  })

  // Change password
  fastify.post('/auth/change-password', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { sub } = request.user as any
    const { currentPassword, newPassword } = request.body as any
    if (!currentPassword || !newPassword) throw new ValidationError('Current and new password required')
    if (newPassword.length < 8) throw new ValidationError('New password must be at least 8 characters')

    const [user] = await sql<Array<{ encrypted_password: string }>>`
      SELECT encrypted_password FROM auth.users WHERE id = ${sub}
    `
    const valid = await verifyPassword(currentPassword, user.encrypted_password)
    if (!valid) throw new UnauthorizedError('Current password is incorrect')

    const hashed = await hashPassword(newPassword)
    await sql`UPDATE auth.users SET encrypted_password = ${hashed} WHERE id = ${sub}`
    return { success: true }
  })
}
