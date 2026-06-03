// RES54 crypto helpers for Supabase Edge Functions.
// Uses AES-256-GCM with authenticated additional data.

const AES_GCM_IV_LENGTH = 12
const U32_BYTES = 4
const MAX_HEADER_LENGTH = 8192

interface Res54LargeHeader {
  version: number
  chunks: number
  totalSize: number
  iv: number[]
}

function deriveAesKeyBytes(key: string): Uint8Array {
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid encryption key')
  }

  // Keep compatibility with existing RES54 client key derivation.
  return new TextEncoder().encode(key.slice(0, 32).padEnd(32, '0'))
}

async function importAesKey(key: string, usage: KeyUsage): Promise<CryptoKey> {
  const keyBytes = deriveAesKeyBytes(key)
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  )
}

function readUint32LE(buffer: Uint8Array, offset: number): number {
  if (offset < 0 || offset + U32_BYTES > buffer.byteLength) {
    throw new Error('Invalid encrypted payload structure')
  }
  return new DataView(buffer.buffer, buffer.byteOffset + offset, U32_BYTES).getUint32(0, true)
}

function decodeBase64(input: string): Uint8Array {
  const binary = atob(input)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function normalizeEncryptedPayload(input: Uint8Array): Uint8Array {
  // Some upload paths store encrypted payloads as base64 text.
  try {
    const decodedText = new TextDecoder().decode(input).trim()
    const base64Like =
      decodedText.length > 0 &&
      decodedText.length % 4 === 0 &&
      /^[A-Za-z0-9+/=]+$/.test(decodedText)

    if (base64Like) {
      return decodeBase64(decodedText)
    }
  } catch {
    // Treat as raw bytes when not UTF-8/base64 text.
  }

  return input
}

async function decryptStandardPayload(payload: Uint8Array, key: string): Promise<Uint8Array> {
  const additionalDataLength = readUint32LE(payload, 0)
  const additionalDataStart = U32_BYTES
  const additionalDataEnd = additionalDataStart + additionalDataLength
  const ivStart = additionalDataEnd
  const ivEnd = ivStart + AES_GCM_IV_LENGTH

  if (additionalDataLength <= 0 || ivEnd >= payload.byteLength) {
    throw new Error('Invalid encrypted payload structure')
  }

  const additionalData = payload.slice(additionalDataStart, additionalDataEnd)
  const iv = payload.slice(ivStart, ivEnd)
  const encryptedContent = payload.slice(ivEnd)

  if (encryptedContent.byteLength === 0) {
    throw new Error('Encrypted payload is empty')
  }

  const cryptoKey = await importAesKey(key, 'decrypt')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData },
    cryptoKey,
    encryptedContent
  )

  return new Uint8Array(decrypted)
}

async function decryptLargePayload(
  payload: Uint8Array,
  header: Res54LargeHeader,
  key: string,
  headerLength: number
): Promise<Uint8Array> {
  let offset = U32_BYTES + headerLength
  const iv = new Uint8Array(header.iv)
  const output = new Uint8Array(header.totalSize)
  let outputOffset = 0

  const cryptoKey = await importAesKey(key, 'decrypt')

  for (let i = 0; i < header.chunks; i++) {
    const additionalDataLength = readUint32LE(payload, offset)
    offset += U32_BYTES

    if (additionalDataLength <= 0 || offset + additionalDataLength > payload.byteLength) {
      throw new Error('Invalid encrypted chunk metadata')
    }

    const additionalData = payload.slice(offset, offset + additionalDataLength)
    offset += additionalDataLength

    const encryptedChunkLength = readUint32LE(payload, offset)
    offset += U32_BYTES

    if (encryptedChunkLength <= 0 || offset + encryptedChunkLength > payload.byteLength) {
      throw new Error('Invalid encrypted chunk payload')
    }

    const encryptedChunk = payload.slice(offset, offset + encryptedChunkLength)
    offset += encryptedChunkLength

    const decryptedChunk = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData },
      cryptoKey,
      encryptedChunk
    )

    const chunkBytes = new Uint8Array(decryptedChunk)
    if (outputOffset + chunkBytes.byteLength > output.byteLength) {
      throw new Error('Decrypted chunk overflow')
    }
    output.set(chunkBytes, outputOffset)
    outputOffset += chunkBytes.byteLength
  }

  if (outputOffset !== output.byteLength) {
    throw new Error('Decrypted payload size mismatch')
  }

  return output
}

function parseLargeHeader(payload: Uint8Array): { header: Res54LargeHeader; headerLength: number } | null {
  if (payload.byteLength < U32_BYTES) {
    return null
  }

  const headerLength = readUint32LE(payload, 0)
  if (headerLength <= 0 || headerLength > MAX_HEADER_LENGTH || U32_BYTES + headerLength >= payload.byteLength) {
    return null
  }

  try {
    const headerBytes = payload.slice(U32_BYTES, U32_BYTES + headerLength)
    const headerJson = new TextDecoder().decode(headerBytes)
    const parsed = JSON.parse(headerJson) as Partial<Res54LargeHeader>

    if (
      parsed.version === 2 &&
      typeof parsed.chunks === 'number' &&
      parsed.chunks > 0 &&
      typeof parsed.totalSize === 'number' &&
      parsed.totalSize > 0 &&
      Array.isArray(parsed.iv) &&
      parsed.iv.length === AES_GCM_IV_LENGTH
    ) {
      return {
        header: {
          version: parsed.version,
          chunks: parsed.chunks,
          totalSize: parsed.totalSize,
          iv: parsed.iv,
        },
        headerLength,
      }
    }
  } catch {
    return null
  }

  return null
}

export async function decrypt(encryptedData: Uint8Array, key: string): Promise<Uint8Array> {
  try {
    const payload = normalizeEncryptedPayload(encryptedData)

    const largeHeader = parseLargeHeader(payload)
    if (largeHeader) {
      return await decryptLargePayload(payload, largeHeader.header, key, largeHeader.headerLength)
    }

    return await decryptStandardPayload(payload, key)
  } catch (error) {
    console.error('RES54 decryption error:', error)
    throw new Error('Failed to decrypt data')
  }
}

export async function encrypt(data: Uint8Array, key: string): Promise<Uint8Array> {
  try {
    const cryptoKey = await importAesKey(key, 'encrypt')
    const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH))
    const additionalData = new TextEncoder().encode(`res54-edge-${Date.now()}`)

    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData },
      cryptoKey,
      data
    )

    const encryptedBytes = new Uint8Array(encryptedContent)
    const output = new Uint8Array(
      U32_BYTES + additionalData.byteLength + AES_GCM_IV_LENGTH + encryptedBytes.byteLength
    )

    new DataView(output.buffer, 0, U32_BYTES).setUint32(0, additionalData.byteLength, true)
    output.set(additionalData, U32_BYTES)
    output.set(iv, U32_BYTES + additionalData.byteLength)
    output.set(encryptedBytes, U32_BYTES + additionalData.byteLength + AES_GCM_IV_LENGTH)

    return output
  } catch (error) {
    console.error('RES54 encryption error:', error)
    throw new Error('Failed to encrypt data')
  }
}

export function generateKey(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (const byte of bytes) {
    out += (byte % 36).toString(36)
  }
  return out
}