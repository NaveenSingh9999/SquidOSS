import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'

const SALT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

export function sha256Buffer(data: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(data)).digest('hex')
}

export function generateSalt(length = 32): string {
  return randomBytes(length).toString('base64')
}

export function generateApiKey(): string {
  const bytes = randomBytes(32)
  const hex = bytes.toString('hex')
  return `cb_${hex}`
}

export function generateKeyPrefix(apiKey: string): string {
  return apiKey.substring(0, 8)
}

export function computeSaltedHash(apiKey: string, saltBase64: string): string {
  const saltBytes = Buffer.from(saltBase64, 'base64')
  const combined = Buffer.concat([saltBytes, Buffer.from(apiKey)])
  return createHash('sha256').update(combined).digest('hex')
}

export function generateToken(length = 32): string {
  return randomBytes(length).toString('hex')
}

export function generateId(): string {
  return randomBytes(16).toString('hex')
}
