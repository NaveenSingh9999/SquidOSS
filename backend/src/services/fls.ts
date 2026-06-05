import { sql } from '../db/index.js'

interface FlsEvent {
  type: string
  channel: string
  payload: any
  timestamp: number
}

type FlsListener = (event: FlsEvent) => void

class FLSService {
  private listeners: Map<string, Set<FlsListener>> = new Map()
  private channels: Map<string, Set<string>> = new Map()

  subscribe(channel: string, listener: FlsListener): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set())
    }
    this.listeners.get(channel)!.add(listener)

    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set())
    }

    return () => {
      this.listeners.get(channel)?.delete(listener)
    }
  }

  async emit(channel: string, type: string, payload: any = {}) {
    const event: FlsEvent = { type, channel, payload, timestamp: Date.now() }

    const listeners = this.listeners.get(channel)
    if (listeners) {
      for (const listener of listeners) {
        try { listener(event) } catch {}
      }
    }

    try {
      const [ch] = await sql`
        INSERT INTO fls_channels (name, status)
        VALUES (${channel}, 'active')
        ON CONFLICT (name) DO UPDATE SET status = 'active'
        RETURNING id
      `
      if (ch) {
        await sql`
          INSERT INTO fls_events (channel_id, event_type, payload)
          VALUES (${(ch as any).id}, ${type}, ${JSON.stringify(payload)})
        `
      }
    } catch {}
  }

  async getChannelEvents(channel: string, limit = 50) {
    const rows = await sql`
      SELECT e.event_type, e.payload, e.created_at
      FROM fls_events e
      JOIN fls_channels c ON c.id = e.channel_id
      WHERE c.name = ${channel}
      ORDER BY e.created_at DESC
      LIMIT ${limit}
    `
    return rows
  }

  async cleanupOldEvents(hours = 24) {
    await sql`
      DELETE FROM fls_events WHERE created_at < NOW() - MAKE_INTERVAL(hours => ${hours})
    `
  }
}

export const fls = new FLSService()
