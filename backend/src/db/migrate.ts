import { readdirSync, readFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { config } from '../config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = resolve(__dirname, '../../migrations')

export async function runMigrations() {
  const sql = postgres(config.database.url, {
    max: 1,
    idle_timeout: 10,
    connect_timeout: 10,
    ssl: config.isDev ? false : 'require',
  })

  // Ensure migrations tracking table exists
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const [existing] = await sql`SELECT id FROM _migrations WHERE name = ${file}`
    if (existing) {
      console.log(`  SKIP ${file} (already applied)`)
      continue
    }

    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
    console.log(`  APPLY ${file}...`)

    await sql.unsafe(content)

    await sql`INSERT INTO _migrations (name) VALUES (${file})`
    console.log(`  DONE  ${file}`)
  }

  await sql.end()
  console.log('All migrations applied.')
}

// Run directly
runMigrations().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
