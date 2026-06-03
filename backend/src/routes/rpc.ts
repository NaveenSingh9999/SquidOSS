import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../utils/errors.js'

export default async function rpcRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth)

  app.post('/api/v1/rpc/:name', async (request) => {
    const userId = (request.user as any)?.sub
    const { name } = request.params as { name: string }
    const params = request.body as Record<string, any> || {}

    const rpcMap: Record<string, (p: any) => Promise<any>> = {
      delete_file_secure: async (p) => {
        const [result] = await sql`
          UPDATE files SET is_deleted = true, deleted_at = NOW()
          WHERE id = ${p.file_uuid} AND user_id = ${userId}
          RETURNING id
        `
        if (!result) throw new AppError(404, 'File not found')
        return { success: true }
      },

      create_file_share: async (p) => {
        const [share] = await sql`
          INSERT INTO shares (file_id, created_by, access_code, expires_at)
          VALUES (${p.file_id_param}, ${userId}, ${p.access_code || null},
            CASE WHEN ${p.expires_in_days || null} IS NOT NULL
              THEN NOW() + (${p.expires_in_days || 7} || ' days')::INTERVAL
              ELSE NULL
            END)
          RETURNING *
        `
        return share
      },

      revoke_file_share: async (p) => {
        await sql`DELETE FROM shares WHERE id = ${p.share_id_param || p.share_id} AND created_by = ${userId}`
        return { success: true }
      },

      get_shared_file_info: async (p) => {
        const [info] = await sql`
          SELECT f.id, f.name, f.type, f.size, f.created_at, f.updated_at,
                 f.encrypted, f.storage_path, s.access_code, s.expires_at
          FROM shares s JOIN files f ON f.id = s.file_id
          WHERE s.id = ${p.share_id_param}
        `
        if (!info) throw new AppError(404, 'Share not found')
        return info
      },

      get_or_create_default_workspace: async (p) => {
        let [ws] = await sql`
          SELECT id FROM workspaces WHERE user_id = ${userId} ORDER BY created_at LIMIT 1
        `
        if (!ws) {
          [ws] = await sql`
            INSERT INTO workspaces (name, user_id) VALUES ('Default', ${userId})
            RETURNING id
          `
        }
        return ws?.id
      },

      get_workspace_role: async (p) => {
        const [member] = await sql`
          SELECT role FROM workspace_members
          WHERE workspace_id = ${p.p_workspace_id} AND user_id = ${p.p_user_id}
        `
        return member?.role || null
      },

      cleanup_trashed_files: async (p) => {
        await sql`DELETE FROM files WHERE user_id = ${userId} AND is_deleted = true`
        return { success: true }
      },

      restore_from_trash: async (p) => {
        await sql`
          UPDATE files SET is_deleted = false, deleted_at = NULL
          WHERE id = ${p.file_id || p.p_file_id} AND user_id = ${userId}
        `
        return { success: true }
      },

      encrypt_keyring_secret: async (p) => {
        const [secret] = await sql`
          INSERT INTO keyring_secrets (user_id, encrypted_value)
          VALUES (${userId}, ${p.secret || JSON.stringify(p)})
          RETURNING id
        `
        return secret
      },
    }

    const handler = rpcMap[name]
    if (!handler) {
      throw new AppError(404, `RPC '${name}' not found`)
    }

    const result = await handler(params)
    return { data: result, error: null }
  })
}
