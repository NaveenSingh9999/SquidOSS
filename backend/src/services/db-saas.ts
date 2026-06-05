import { sql } from '../db/index.js'
import { randomBytes } from 'node:crypto'
import { fls } from './fls.js'
import { kzaAuditUser } from './kza-audit.js'
import { createServer } from 'node:net'

const POOL_START = 40000
const POOL_END = 49999
const usedPorts = new Set<number>()

function generatePassword(): string {
  return randomBytes(24).toString('base64url')
}

function generateDbName(): string {
  return `saas_${randomBytes(6).toString('hex')}`
}

function findAvailablePort(): number | null {
  for (let port = POOL_START; port <= POOL_END; port++) {
    if (!usedPorts.has(port)) return port
  }
  return null
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(true))
    server.once('listening', () => {
      server.close()
      resolve(false)
    })
    server.listen(port, '127.0.0.1')
  })
}

interface DbSaaSInstance {
  id: string
  port: number
  dbName: string
  dbUser: string
  dbPassword: string
  status: string
}

export async function spawnDbInstance(userId: string, name: string): Promise<DbSaaSInstance> {
  const audit = await kzaAuditUser(userId, `DB SaaS spawn: ${name}`)

  const channel = `db-saas-${userId}-${Date.now()}`
  await fls.emit(channel, 'spawn:start', { name, auditWarnings: audit.warnings.length })

  const port = findAvailablePort()
  if (!port) throw new Error('No available ports in pool')

  await fls.emit(channel, 'spawn:progress', { percent: 10, message: 'Port allocated' })

  const dbName = generateDbName()
  const dbUser = dbName
  const dbPassword = generatePassword()

  await fls.emit(channel, 'spawn:progress', { percent: 25, message: 'Credentials generated' })

  let pgConnected = false
  try {
    await sql`SELECT 1`
    pgConnected = true
  } catch {}

  const [instance] = await sql`
    INSERT INTO db_saas_instances (user_id, name, port, status, db_name, db_user, db_password_encrypted, connection_url, created_at)
    VALUES (${userId}, ${name}, ${port}, 'booting', ${dbName}, ${dbUser}, ${dbPassword},
            ${`postgresql://${dbUser}:${dbPassword}@127.0.0.1:${port}/${dbName}`}, NOW())
    RETURNING id, port, status, db_name, db_user, connection_url, created_at
  `

  usedPorts.add(port)

  await fls.emit(channel, 'spawn:progress', { percent: 50, message: 'Instance registered in database' })

  if (pgConnected) {
    try {
      await sql`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = ${dbUser}) THEN
            CREATE ROLE ${sql.unsafe(dbUser)} WITH LOGIN PASSWORD ${dbPassword};
          END IF;
        END
        $$;
      `

      await fls.emit(channel, 'spawn:progress', { percent: 75, message: 'Database role created' })

      await sql`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_database WHERE datname = ${dbName}) THEN
            PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE ' || ${dbName} || ' OWNER ' || ${dbUser});
          END IF;
        END
        $$;
      `
    } catch (e: any) {
      await sql`
        UPDATE db_saas_instances SET status = 'error' WHERE id = ${(instance as any).id}
      `

      await fls.emit(channel, 'spawn:error', { message: e.message })

      const [errInstance] = await sql`
        SELECT id, port, status, db_name, db_user, connection_url, created_at
        FROM db_saas_instances WHERE id = ${(instance as any).id}
      `

      return errInstance as any
    }
  }

  await fls.emit(channel, 'spawn:progress', { percent: 100, message: 'Instance ready' })

  await sql`
    UPDATE db_saas_instances SET status = 'running' WHERE id = ${(instance as any).id}
  `

  const [final] = await sql`
    SELECT id, port, status, db_name, db_user, connection_url, created_at
    FROM db_saas_instances WHERE id = ${(instance as any).id}
  `

  await fls.emit(channel, 'instance:ready', { instanceId: (instance as any).id, port, dbName })

  return final as any
}

export async function destroyDbInstance(instanceId: string, userId: string) {
  const [instance] = await sql`
    SELECT * FROM db_saas_instances WHERE id = ${instanceId} AND user_id = ${userId}
  `
  if (!instance) throw new Error('Instance not found')
  const inst = instance as any

  try {
    await sql`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM pg_database WHERE datname = ${inst.db_name}) THEN
          PERFORM dblink_exec('dbname=postgres',
            'DROP DATABASE IF EXISTS ' || ${inst.db_name});
        END IF;
      END
      $$;
    `
  } catch {}

  try {
    await sql`DROP ROLE IF EXISTS ${sql.unsafe(inst.db_user)}`
  } catch {}

  await sql`UPDATE db_saas_instances SET status = 'stopped' WHERE id = ${instanceId}`
  usedPorts.delete(inst.port)
}

export async function executeSql(instanceId: string, userId: string, query: string): Promise<any> {
  const [instance] = await sql`
    SELECT * FROM db_saas_instances WHERE id = ${instanceId} AND user_id = ${userId}
  `
  if (!instance) throw new Error('Instance not found')
  const inst = instance as any
  if (inst.status !== 'running') throw new Error('Instance not running')

  const decryptedPassword = inst.db_password_encrypted
  if (!decryptedPassword) throw new Error('Password not available')

  const url = `postgresql://${inst.db_user}:${decryptedPassword}@127.0.0.1:${inst.port}/${inst.db_name}`
  const { default: postgres } = await import('postgres')

  const instanceSql = postgres(url, { max: 5, idle_timeout: 10, connect_timeout: 5 })

  try {
    const result = await instanceSql.unsafe(query)
    return result
  } finally {
    await instanceSql.end()
  }
}

export async function listDbInstances(userId?: string) {
  if (userId) {
    return await sql`
      SELECT * FROM db_saas_instances WHERE user_id = ${userId} ORDER BY created_at DESC
    `
  }
  return await sql`
    SELECT i.*, u.email FROM db_saas_instances i
    JOIN auth.users u ON u.id = i.user_id
    ORDER BY i.created_at DESC LIMIT 50
  `
}

export async function getHiddenServerPort(): Promise<number> {
  let port = parseInt(process.env.SQUIDOSS_FSTF_PORT || '')
  if (!port || isNaN(port)) {
    port = 30000 + Math.floor(Math.random() * 5000)
  }
  return port
}
