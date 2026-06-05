import { sql } from '../db/index.js'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCAL_STORAGE_DIR = resolve(process.cwd(), 'data', 'files')

type ProviderRow = {
  id: string
  provider_type: string
  encrypted_credentials: string
  is_default: boolean
}

export async function uploadToProvider(
  userId: string,
  buffer: Buffer,
  fileName: string,
  providerId?: string | null
): Promise<string> {
  const provider = providerId
    ? await resolveProvider(providerId, userId)
    : await getDefaultProvider(userId)

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${userId}/${Date.now()}_${safeName}`

  if (!provider || provider.provider_type === 'local') {
    const diskDir = resolve(LOCAL_STORAGE_DIR, userId)
    if (!existsSync(diskDir)) mkdirSync(diskDir, { recursive: true })
    writeFileSync(resolve(LOCAL_STORAGE_DIR, storagePath), buffer)
    return storagePath
  }

  const credentials = JSON.parse(provider.encrypted_credentials)

  switch (provider.provider_type) {
    case 'github': {
      const [repo] = await sql`
        SELECT clone_url, repo_full_name FROM github_repos
        WHERE user_id = ${userId} ORDER BY created_at LIMIT 1
      `
      if (repo) {
        const url = `https://api.github.com/repos/${(repo as any).repo_full_name}/contents/${storagePath}`
        const content = buffer.toString('base64')
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${credentials.accessKeyId}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json',
          },
          body: JSON.stringify({ message: `Upload ${fileName}`, content }),
        })
        if (res.ok) return `github://${(repo as any).repo_full_name}/${storagePath}`
      }
      break
    }
    case 's3':
    case 'r2': {
      try {
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
        const endpoint = provider.provider_type === 'r2'
          ? `https://${credentials.accountId}.r2.cloudflarestorage.com`
          : undefined
        const client = new S3Client({
          region: credentials.region || 'us-east-1',
          endpoint,
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
          },
        })
        await client.send(new PutObjectCommand({
          Bucket: credentials.bucket || 'squidoss-files',
          Key: storagePath,
          Body: buffer,
          ContentType: fileName.split('.').pop() || 'application/octet-stream',
        }))
        return `${provider.provider_type}://${credentials.bucket || 'squidoss-files'}/${storagePath}`
      } catch {
        // Fall through to local if S3 SDK not installed
      }
    }
  }

  // Fallback to local
  const diskDir = resolve(LOCAL_STORAGE_DIR, userId)
  if (!existsSync(diskDir)) mkdirSync(diskDir, { recursive: true })
  writeFileSync(resolve(LOCAL_STORAGE_DIR, storagePath), buffer)
  return storagePath
}

export async function downloadFromProvider(
  storagePath: string,
  userId: string
): Promise<Buffer | null> {
  if (!storagePath.includes('://')) {
    // Local file
    const filepath = resolve(LOCAL_STORAGE_DIR, storagePath)
    if (!existsSync(filepath)) return null
    return readFileSync(filepath)
  }

  const [scheme, path] = storagePath.split('://')
  const provider = await getDefaultProvider(userId)

  if (!provider) return null
  const credentials = JSON.parse(provider.encrypted_credentials)

  switch (scheme) {
    case 'github': {
      const [owner, repo, ...rest] = path.split('/')
      const filePath = rest.join('/')
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${credentials.accessKeyId}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      })
      if (!res.ok) return null
      const data = await res.json() as any
      return Buffer.from(data.content, 'base64')
    }
    case 's3':
    case 'r2': {
      try {
        const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
        const endpoint = scheme === 'r2'
          ? `https://${credentials.accountId}.r2.cloudflarestorage.com`
          : undefined
        const client = new S3Client({
          region: credentials.region || 'us-east-1',
          endpoint,
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
          },
        })
        const bucket = path.split('/')[0]
        const key = path.split('/').slice(1).join('/')
        const result = await client.send(new GetObjectCommand({
          Bucket: bucket || credentials.bucket || 'squidoss-files',
          Key: key,
        }))
        const chunks: Buffer[] = []
        for await (const chunk of result.Body as any) {
          chunks.push(Buffer.from(chunk))
        }
        return Buffer.concat(chunks)
      } catch {
        return null
      }
    }
  }

  return null
}

export async function deleteFromProvider(storagePath: string, userId: string): Promise<boolean> {
  if (!storagePath.includes('://')) {
    const filepath = resolve(LOCAL_STORAGE_DIR, storagePath)
    if (!existsSync(filepath)) return false
    unlinkSync(filepath)
    return true
  }

  const [scheme, path] = storagePath.split('://')
  const provider = await getDefaultProvider(userId)
  if (!provider) return false
  const credentials = JSON.parse(provider.encrypted_credentials)

  switch (scheme) {
    case 'github': {
      const [owner, repo, ...rest] = path.split('/')
      const filePath = rest.join('/')
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${credentials.accessKeyId}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({ message: `Delete ${filePath}`, sha: '' }),
      })
      return res.ok
    }
    case 's3':
    case 'r2': {
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3')
      const endpoint = scheme === 'r2'
        ? `https://${credentials.accountId}.r2.cloudflarestorage.com`
        : undefined
      const client = new S3Client({
        region: credentials.region || 'us-east-1',
        endpoint,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        },
      })
      const bucket = path.split('/')[0]
      const key = path.split('/').slice(1).join('/')
      await client.send(new DeleteObjectCommand({
        Bucket: bucket || credentials.bucket || 'squidoss-files',
        Key: key,
      }))
      return true
    }
  }

  return false
}

async function resolveProvider(providerId: string, userId: string): Promise<ProviderRow | null> {
  const [row] = await sql`
    SELECT id, provider_type, encrypted_credentials, is_default
    FROM storage_providers
    WHERE id = ${providerId} AND user_id = ${userId}
  `
  return (row as ProviderRow) || null
}

async function getDefaultProvider(userId: string): Promise<ProviderRow | null> {
  const [row] = await sql`
    SELECT id, provider_type, encrypted_credentials, is_default
    FROM storage_providers
    WHERE user_id = ${userId} AND is_default = true
    LIMIT 1
  `
  return (row as ProviderRow) || null
}
