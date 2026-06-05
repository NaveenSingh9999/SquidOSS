import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, copyFileSync, renameSync, truncateSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CHUNKS_DIR = resolve(process.cwd(), 'data', 'chunks')
const BACKEND_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

let native: any = null
const nativePath = resolve(BACKEND_DIR, 'build', 'Release', 'local_storage.node')
if (!existsSync(nativePath)) {
  const sourcePath = resolve(BACKEND_DIR, 'src', 'native', 'local_storage.c')
  if (existsSync(sourcePath)) {
    try {
      const env = { ...process.env }
      const r = spawnSync('npm', ['run', 'build:native'], { cwd: BACKEND_DIR, stdio: 'pipe', env, timeout: 30000 })
      if (r.status === 0 && existsSync(nativePath)) native = require(nativePath)
    } catch {}
  }
}
if (!native) {
  try {
    native = require(nativePath)
  } catch {
    try {
      native = require('local_storage')
    } catch {}
  }
}

export function ensureChunksDir(userId: string): string {
  const dir = resolve(CHUNKS_DIR, userId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function writeChunk(userId: string, chunkId: string, data: Buffer): void {
  const dir = ensureChunksDir(userId)
  const path = resolve(dir, chunkId)
  if (native) {
    native.writeFile(path, data)
  } else {
    writeFileSync(path, data)
  }
}

export function readChunk(userId: string, chunkId: string): Buffer | null {
  const dir = resolve(CHUNKS_DIR, userId)
  const path = resolve(dir, chunkId)
  if (!existsSync(path)) return null
  if (native) {
    return native.readFile(path)
  }
  return readFileSync(path)
}

export function deleteChunk(userId: string, chunkId: string): boolean {
  const dir = resolve(CHUNKS_DIR, userId)
  const path = resolve(dir, chunkId)
  if (!existsSync(path)) return false
  if (native) {
    return native.unlink(path)
  }
  unlinkSync(path)
  return true
}

export function chunkExists(userId: string, chunkId: string): boolean {
  const dir = resolve(CHUNKS_DIR, userId)
  const path = resolve(dir, chunkId)
  if (native) {
    return native.exists(path)
  }
  return existsSync(path)
}

export function listChunks(userId: string): string[] {
  const dir = ensureChunksDir(userId)
  if (native) {
    return native.readdir(dir)
  }
  return readdirSync(dir)
}

export function chunkStat(userId: string, chunkId: string): { size: number; mtime: number } | null {
  const dir = resolve(CHUNKS_DIR, userId)
  const path = resolve(dir, chunkId)
  if (!existsSync(path)) return null
  if (native) {
    return native.stat(path)
  }
  const st = statSync(path)
  return { size: st.size, mtime: st.mtimeMs }
}

export function generateChunkId(prefix = 'res54_local'): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 9)
  const hash = createHash('md5').update(`${ts}-${rand}`).digest('hex').substring(0, 8)
  return `${prefix}_${ts}_${rand}_${hash}`
}
