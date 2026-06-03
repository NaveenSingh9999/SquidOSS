import postgres from 'postgres'
import { config } from '../config.js'

export const sql = postgres(config.database.url, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
  ssl: config.isDev ? false : 'require',
})

export async function testConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`
    return true
  } catch {
    return false
  }
}
