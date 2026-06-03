import Redis from 'ioredis'
import { config } from '../config.js'

let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redis.url || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null
        return Math.min(times * 200, 2000)
      },
      lazyConnect: true,
    })
  }
  return redis
}

export async function connectRedis(): Promise<boolean> {
  try {
    const r = getRedis()
    await r.connect()
    await r.ping()
    config.redis.url = `redis://localhost:6379`
    return true
  } catch {
    return false
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit()
    redis = null
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const data = await getRedis().get(key)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec = 300): Promise<void> {
  try {
    await getRedis().setex(key, ttlSec, JSON.stringify(value))
  } catch {
    // silently fail
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await getRedis().del(key)
  } catch {
    // silently fail
  }
}

export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  try {
    const r = getRedis()
    const keys = await r.keys(pattern)
    if (keys.length > 0) await r.del(...keys)
  } catch {
    // silently fail
  }
}

export async function publish(channel: string, message: unknown): Promise<void> {
  try {
    await getRedis().publish(channel, JSON.stringify(message))
  } catch {
    // silently fail
  }
}

export async function rateLimit(
  key: string,
  maxRequests: number,
  windowSec: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const r = getRedis()
  const now = Date.now()
  const windowMs = windowSec * 1000
  const resetAt = Math.floor((now + windowMs) / 1000)

  try {
    const current = await r.get(key)
    if (!current) {
      await r.setex(key, windowSec, '1')
      return { allowed: true, remaining: maxRequests - 1, resetAt }
    }

    const count = parseInt(current, 10)
    if (count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt }
    }

    await r.incr(key)
    return { allowed: true, remaining: maxRequests - count - 1, resetAt }
  } catch {
    return { allowed: true, remaining: maxRequests, resetAt } // fail open
  }
}
