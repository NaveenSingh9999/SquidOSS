import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth, getUserId } from '../middleware/auth.js'
import { AppError } from '../utils/errors.js'

const ALLOWED_TABLES = new Set([
  'files', 'folders', 'profiles', 'api_keys', 'shares',
  'workspaces', 'workspace_members', 'storage_providers', 'github_repos',
  'repositories', 'media_metadata', 'security_events',
  'audit_logs', 'admin_access_logs', 'api_request_logs',
  'trash_items', 'file_requests', 'shared_file_access',
  'login_sessions', 'encryption_keys', 'encrypted_keys',
  'keyring_secrets', 'master_keys', 'archive_extractions',
  'backup_records', 'access_policies', 'threat_alerts',
  'user_encryption_settings', 'media_playback_logs',
  'collections', 'collection_items', 'notes',
  'extension_installs', 'extension_marketplace',
])

function parseFilters(query: any): { conditions: string[]; params: any[] } {
  const conditions: string[] = []
  const params: any[] = []
  const filterStr = query.filter as string || ''
  if (!filterStr) return { conditions, params }

  for (const part of filterStr.split(',')) {
    const [op, col, ...rest] = part.split('.')
    const val = rest.join('.')
    if (!op || !col) continue

    switch (op) {
      case 'eq': conditions.push(`${col} = $${params.length + 1}`); params.push(val); break
      case 'neq': conditions.push(`${col} != $${params.length + 1}`); params.push(val); break
      case 'gt': conditions.push(`${col} > $${params.length + 1}`); params.push(val); break
      case 'lt': conditions.push(`${col} < $${params.length + 1}`); params.push(val); break
      case 'gte': conditions.push(`${col} >= $${params.length + 1}`); params.push(val); break
      case 'lte': conditions.push(`${col} <= $${params.length + 1}`); params.push(val); break
      case 'is':
        conditions.push(val === 'null' ? `${col} IS NULL` : `${col} IS NOT NULL`)
        break
      case 'in':
        conditions.push(`${col} = ANY($${params.length + 1})`)
        params.push(val.split(','))
        break
    }
  }

  return { conditions, params }
}

export default async function queryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth)

  app.get('/api/v1/query/:table', async (request) => {
    const { table } = request.params as { table: string }
    const userId = getUserId(request)

    if (!ALLOWED_TABLES.has(table)) {
      throw new AppError(403, `Table '${table}' not accessible via API`)
    }

    const { conditions, params } = parseFilters(request.query as any)
    const selectCols = (request.query as any).select || '*'

    let sqlStr = `SELECT ${selectCols} FROM ${table}`
    if (conditions.length > 0) {
      sqlStr += ` WHERE ${conditions.join(' AND ')}`
    }

    const order = (request.query as any).order
    if (order) {
      const [col, dir] = order.split('.')
      sqlStr += ` ORDER BY ${col} ${dir === 'desc' ? 'DESC' : 'ASC'}`
    }

    const limit = parseInt((request.query as any).limit || '0')
    if (limit > 0) sqlStr += ` LIMIT ${limit}`

    const offset = parseInt((request.query as any).offset || '0')
    if (offset > 0) sqlStr += ` OFFSET ${offset}`

    const result = await sql.unsafe(sqlStr, params)
    return result
  })

  app.post('/api/v1/query/:table', async (request) => {
    const { table } = request.params as { table: string }
    if (!ALLOWED_TABLES.has(table)) throw new AppError(403, 'Table not accessible')

    const records = request.body as any[]
    if (!Array.isArray(records) || records.length === 0) {
      throw new AppError(400, 'Records array required')
    }

    const cols = Object.keys(records[0])
    const placeholders = records.map((_, ri) =>
      `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
    ).join(', ')
    const values = records.flatMap(r => cols.map(c => r[c]))

    const result = await sql.unsafe(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${placeholders} RETURNING *`,
      values,
    )
    return result
  })

  app.patch('/api/v1/query/:table', async (request) => {
    const { table } = request.params as { table: string }
    if (!ALLOWED_TABLES.has(table)) throw new AppError(403, 'Table not accessible')

    const { values, filters } = request.body as any
    if (!values || Object.keys(values).length === 0) {
      throw new AppError(400, 'Values required')
    }

    const setClauses = Object.keys(values).map((k, i) => `${k} = $${i + 1}`)
    const setValues = Object.values(values)
    const { conditions, params: filterParams } = parseFilters(filters || {})

    let paramIndex = setValues.length + 1
    const filterClauses = conditions.map(c => {
      const replaced = c.replace(/\$(\d+)/g, () => `$${paramIndex++}`)
      return replaced
    })

    const allValues = [...setValues, ...filterParams]
    const whereClause = filterClauses.length > 0 ? `WHERE ${filterClauses.join(' AND ')}` : ''

    const result = await sql.unsafe(
      `UPDATE ${table} SET ${setClauses.join(', ')} ${whereClause} RETURNING *`,
      allValues,
    )
    return result
  })

  app.delete('/api/v1/query/:table', async (request) => {
    const { table } = request.params as { table: string }
    if (!ALLOWED_TABLES.has(table)) throw new AppError(403, 'Table not accessible')

    const { filters } = request.body as any
    const { conditions, params } = parseFilters(filters || {})
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await sql.unsafe(
      `DELETE FROM ${table} ${whereClause} RETURNING *`,
      params,
    )
    return result
  })
}
