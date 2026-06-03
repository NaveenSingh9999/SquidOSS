import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { AppError } from '../utils/errors.js'
import { randomBytes } from 'node:crypto'

// In-memory challenge store (use Redis in production)
const challenges = new Map<string, { challenge: string; email?: string; userId?: string }>()

export default async function passkeyRoutes(app: FastifyInstance) {
  // Begin passkey registration
  app.post('/auth/passkey/register/begin', async (request) => {
    const { email, displayName } = request.body as { email: string; displayName?: string }

    if (!email) throw new AppError(400, 'Email required')

    const challenge = randomBytes(32).toString('base64url')
    const userId = randomBytes(16).toString('hex')

    challenges.set(email, { challenge, email })

    return {
      success: true,
      publicKey: {
        challenge,
        rp: { name: 'SquidOSS', id: request.hostname },
        user: {
          id: userId,
          name: email,
          displayName: displayName || email.split('@')[0],
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      },
    }
  })

  // Complete passkey registration
  app.post('/auth/passkey/register/complete', async (request) => {
    const { email, credential } = request.body as {
      email: string
      credential: {
        id: string
        rawId: string
        response: {
          clientDataJSON: string
          attestationObject: string
        }
        type: string
      }
    }

    if (!email || !credential) throw new AppError(400, 'Email and credential required')

    const storedChallenge = challenges.get(email)
    if (!storedChallenge) throw new AppError(400, 'No registration in progress')

    challenges.delete(email)

    // Check if user exists, create if not
    let [user] = await sql`SELECT id FROM auth.users WHERE email = ${email}`
    if (!user) {
      [user] = await sql`
        INSERT INTO auth.users (email) VALUES (${email}) RETURNING id
      `
    }

    // Check if passkey already exists
    const [existing] = await sql`
      SELECT id FROM user_passkeys WHERE email = ${email}
    `
    if (existing) throw new AppError(409, 'Passkey already registered for this email')

    await sql`
      INSERT INTO user_passkeys (user_id, email, credential_id, public_key)
      VALUES (${(user as any).id}, ${email}, ${credential.id}, ${JSON.stringify(credential)})
    `

    return { success: true, message: 'Passkey registered' }
  })

  // Begin passkey authentication
  app.post('/auth/passkey/login/begin', async (request) => {
    const { email } = request.body as { email?: string }

    const challenge = randomBytes(32).toString('base64url')

    // Get allowed credentials for this email
    let allowCredentials: any[] = []
    if (email) {
      const passkeys = await sql`
        SELECT credential_id FROM user_passkeys WHERE email = ${email}
      `
      allowCredentials = (passkeys as any[]).map(pk => ({
        id: pk.credential_id,
        type: 'public-key' as const,
      }))
    }

    const key = email || `anon_${randomBytes(8).toString('hex')}`
    challenges.set(key, { challenge, email })

    return {
      success: true,
      publicKey: {
        challenge,
        timeout: 60000,
        rpId: request.hostname,
        allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
        userVerification: 'preferred',
      },
    }
  })

  // Complete passkey authentication
  app.post('/auth/passkey/login/complete', async (request, reply) => {
    const { email, credential } = request.body as {
      email?: string
      credential: {
        id: string
        rawId: string
        response: {
          clientDataJSON: string
          authenticatorData: string
          signature: string
          userHandle?: string
        }
        type: string
      }
    }

    if (!credential) throw new AppError(400, 'Credential required')

    const [passkey] = await sql`
      SELECT * FROM user_passkeys WHERE credential_id = ${credential.id}
    `
    if (!passkey) throw new AppError(404, 'Passkey not found')

    const pk = passkey as any

    const jwt = await reply.jwtSign({
      sub: pk.user_id,
      email: pk.email,
      role: 'user',
    })

    return {
      success: true,
      token: jwt,
      user: { id: pk.user_id, email: pk.email },
    }
  })
}
