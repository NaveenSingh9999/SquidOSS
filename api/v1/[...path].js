/**
 * SquidCloud API Proxy
 * Route: /api/v1/*  →  Supabase cloudbliss-api
 *
 * Injects the Supabase apikey header automatically.
 * Users only need X-SquidCloud-Key — no Supabase headers required.
 */

const SUPABASE_URL      = process.env.SUPABASE_URL || 'https://aouqcwbdoyrccjcrhzzi.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

export const config = { runtime: 'edge' }

export default async function handler(req) {
  // Strip /api/v1 prefix and forward the rest to cloudbliss-api
  const url      = new URL(req.url)
  const subPath  = url.pathname.replace(/^\/api\/v1/, '') || '/'
  const target   = `${SUPABASE_URL}/functions/v1/cloudbliss-api${subPath}${url.search}`

  // Forward all original headers + inject Supabase apikey
  const headers  = new Headers(req.headers)
  headers.set('apikey', SUPABASE_ANON_KEY)
  headers.delete('host') // Don't forward the original host

  const upstream = await fetch(target, {
    method:  req.method,
    headers,
    body:    ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? null : req.body,
    // @ts-ignore
    duplex: 'half',
  })

  // Forward response as-is with CORS headers added
  const resHeaders = new Headers(upstream.headers)
  resHeaders.set('Access-Control-Allow-Origin', '*')
  resHeaders.set('Access-Control-Allow-Headers', 'X-SquidCloud-Key, X-SquidCloud-Encryption-Key, Content-Type')
  resHeaders.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: resHeaders })
  }

  return new Response(upstream.body, {
    status:  upstream.status,
    headers: resHeaders,
  })
}
