import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { NotFoundError } from '../utils/errors.js'

export default async function fileRoutes(fastify: FastifyInstance) {
  // List files
  fastify.get('/files', { preHandler: [fastify.authenticate] }, async (request) => {
    const { sub: userId } = request.user as any
    const query = request.query as any
    const workspaceId = query.workspace_id
    const folderId = query.folder_id

    let fileQuery = sql`SELECT * FROM files WHERE user_id = ${userId} AND is_deleted = false`
    if (workspaceId) fileQuery = sql`${fileQuery} AND workspace_id = ${workspaceId}`
    if (folderId) fileQuery = sql`${fileQuery} AND parent_folder = ${folderId}`
    fileQuery = sql`${fileQuery} ORDER BY created_at DESC`

    const files = await fileQuery

    const folders = await sql`
      SELECT * FROM folders WHERE user_id = ${userId} AND parent_folder IS NULL ORDER BY name
    `
    return { files, folders }
  })

  // Get file metadata
  fastify.get('/files/:id/metadata', { preHandler: [fastify.authenticate] }, async (request) => {
    const { sub: userId } = request.user as any
    const { id } = request.params as any

    const [file] = await sql`SELECT * FROM files WHERE id = ${id} AND user_id = ${userId}`
    if (!file) throw new NotFoundError('File')
    return { file }
  })

  // POST /api/v1/folders - create a new folder
  fastify.post('/api/v1/folders', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { sub: userId } = request.user as any
    const { name, parent_folder } = request.body as { name: string; parent_folder?: string }
    if (!name) return reply.status(400).send({ error: 'Folder name required' })

    const path = parent_folder ? `${parent_folder}/${name}` : name
    const [folder] = await sql`
      INSERT INTO folders (user_id, name, path, parent_folder)
      VALUES (${userId}, ${name}, ${path}, ${parent_folder || null})
      RETURNING *
    `
    return reply.status(201).send({ folder })
  })

  // Upload file
  fastify.post('/files/upload', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { sub: userId } = request.user as any
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'No file provided' })

    const buffer = await data.toBuffer()
    const fileName = data.filename
    const fileType = data.mimetype || ''
    const fileSize = buffer.length
    const parentFolder = (data.fields.parent_folder as any)?.value || null
    const providerId = (data.fields.storage_provider_id as any)?.value || null

    // Get or create default workspace
    let ws = await sql`SELECT id FROM workspaces WHERE user_id = ${userId} LIMIT 1`
    let workspaceId
    if (ws.length === 0) {
      const [created] = await sql`
        INSERT INTO workspaces (user_id, name, is_default)
        VALUES (${userId}, 'My Workspace', true)
        RETURNING id
      `
      workspaceId = created.id
    } else {
      workspaceId = ws[0].id
    }

    const storagePath = `local/${userId}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    const [file] = await sql`
      INSERT INTO files (user_id, name, type, size, storage_path, workspace_id, parent_folder, storage_provider_id)
      VALUES (${userId}, ${fileName}, ${fileType}, ${fileSize}, ${storagePath}, ${workspaceId}, ${parentFolder}, ${providerId})
      RETURNING *
    `
    return reply.status(201).send({ file })
  })
}
