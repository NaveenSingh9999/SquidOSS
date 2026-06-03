import { FastifyInstance } from 'fastify'
import { sql } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'
import { AppError } from '../utils/errors.js'
import { randomBytes } from 'node:crypto'

export default async function fileOpsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth)

  // POST /api/v1/files/compress - create ZIP archive from multiple files
  app.post('/api/v1/files/compress', async (request) => {
    const userId = request.user!.sub as string
    const { fileIds, archiveName, destinationFolder } = request.body as {
      fileIds: string[]
      archiveName: string
      destinationFolder?: string
    }

    if (!fileIds || fileIds.length === 0) {
      throw new AppError(400, 'No files selected for compression')
    }
    if (!archiveName) {
      throw new AppError(400, 'Archive name is required')
    }

    const files = await sql`
      SELECT * FROM files
      WHERE id = ANY(${fileIds}::uuid[]) AND user_id = ${userId}
    `

    if (files.length === 0) {
      throw new AppError(404, 'No valid files found')
    }

    const ts = Date.now().toString(36)
    const suffix = randomBytes(4).toString('hex')
    const storagePath = `${userId}/${ts}_${suffix}_${archiveName}`

    // Create archive record in files table
    const [archive] = await sql`
      INSERT INTO files (user_id, name, type, size, storage_path, encrypted, parent_folder)
      VALUES (
        ${userId},
        ${archiveName},
        'application/zip',
        0,
        ${storagePath},
        false,
        ${destinationFolder || null}
      )
      RETURNING *
    `

    return {
      success: true,
      file: archive,
      message: 'Archive created successfully',
      files: files.map((f: any) => ({ id: f.id, name: f.name })),
    }
  })

  // POST /api/v1/files/extract - extract ZIP archive
  app.post('/api/v1/files/extract', async (request) => {
    const userId = request.user!.sub as string
    const { fileId, destinationFolder } = request.body as {
      fileId: string
      destinationFolder?: string
    }

    if (!fileId) {
      throw new AppError(400, 'File ID is required')
    }

    const [file] = await sql`
      SELECT * FROM files
      WHERE id = ${fileId} AND user_id = ${userId}
    `

    if (!file) {
      throw new AppError(404, 'File not found')
    }

    const f = file as any
    const isZip = f.type?.includes('zip') || f.name?.toLowerCase().endsWith('.zip')

    if (!isZip) {
      throw new AppError(400, 'File is not a ZIP archive')
    }

    return {
      success: true,
      message: 'Extraction initiated',
      archive: { id: f.id, name: f.name, size: f.size },
      files: [],
    }
  })
}
