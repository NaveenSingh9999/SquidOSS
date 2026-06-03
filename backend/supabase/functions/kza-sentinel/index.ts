import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (payload: Record<string, unknown>, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...headers,
    },
  })

const getFirstIp = (value: string | null) => {
  if (!value) return null
  return value.split(',')[0]?.trim() || null
}

const parseDeviceProfile = (value: unknown) => {
  if (Array.isArray(value)) {
    return { fingerprints: value.filter((item) => typeof item === 'string'), recent_intervals: [] as number[] }
  }
  if (value && typeof value === 'object') {
    const fingerprints = Array.isArray((value as any).fingerprints)
      ? (value as any).fingerprints.filter((item: unknown) => typeof item === 'string')
      : []
    const recent_intervals = Array.isArray((value as any).recent_intervals)
      ? (value as any).recent_intervals.filter((item: unknown) => typeof item === 'number')
      : []
    return { fingerprints, recent_intervals }
  }
  return { fingerprints: [] as string[], recent_intervals: [] as number[] }
}

const normalizePath = (urlValue: string) => {
  try {
    return new URL(urlValue).pathname || '/'
  } catch {
    return '/'
  }
}

const findResourceIds = (path: string) => {
  const ids = new Set<string>()
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi
  const numericRegex = /\/(\d{2,})/g
  for (const match of path.matchAll(uuidRegex)) {
    ids.add(match[0])
  }
  for (const match of path.matchAll(numericRegex)) {
    ids.add(match[1])
  }
  return [...ids]
}

async function hmacHex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const KZA_ENABLED = (Deno.env.get('KZA_ENABLED') ?? 'true').toLowerCase() === 'true'
  const KZA_ORACLE_ENABLED = (Deno.env.get('KZA_ORACLE_ENABLED') ?? 'true').toLowerCase() === 'true'
  const ORANGE_THRESHOLD = Number(Deno.env.get('KZA_ORANGE_THRESHOLD') ?? 40)
  const RED_THRESHOLD = Number(Deno.env.get('KZA_RED_THRESHOLD') ?? 70)
  const BLACK_THRESHOLD = Number(Deno.env.get('KZA_BLACK_THRESHOLD') ?? 100)
  const YELLOW_THRESHOLD = Number(Deno.env.get('KZA_YELLOW_THRESHOLD') ?? 10)
  const TEMP_BAN_HOURS = Number(Deno.env.get('KZA_TEMP_BAN_DURATION_HOURS') ?? 24)

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'KZA misconfigured' }, 500)
  }

   if (!KZA_ENABLED) {
     return jsonResponse({ ok: true, disabled: true })
   }

   // Internal KZA call check
   const internalTokenHeader = req.headers.get('x-kza-internal');
   if (internalTokenHeader) {
     const expectedToken = await hmacHex(SUPABASE_SERVICE_ROLE_KEY, 'kza-internal-v1');
     if (internalTokenHeader.length === expectedToken.length) {
       let match = 0;
       for (let i = 0; i < internalTokenHeader.length; i++) {
         match |= internalTokenHeader.charCodeAt(i) ^ expectedToken.charCodeAt(i);
       }
       if (match === 0) {
         return jsonResponse({ ok: true, internal: true }, 200);
       }
     }
   }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const requestPayload = await req.json().catch(() => ({} as Record<string, unknown>))
  const url = typeof requestPayload.url === 'string' ? requestPayload.url : req.url
  const method = typeof requestPayload.method === 'string' ? requestPayload.method.toUpperCase() : req.method
  const bodySnapshot = typeof requestPayload.body_snapshot === 'string' ? requestPayload.body_snapshot : ''
  const forcedTier = typeof requestPayload.forced_tier === 'string' ? requestPayload.forced_tier : null
  const forcedThreatType = typeof requestPayload.threat_type === 'string' ? requestPayload.threat_type : null
  const forcedDescription = typeof requestPayload.description === 'string' ? requestPayload.description : null

  const authHeader = req.headers.get('Authorization') ?? ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim()
  let userId: string | null = null
  let authErrorMessage: string | null = null

  if (bearerToken) {
    const { data, error } = await supabase.auth.getUser(bearerToken)
    if (error) {
      authErrorMessage = error.message
    } else {
      userId = data.user?.id ?? null
    }
  }

  const ipAddress =
    getFirstIp(req.headers.get('cf-connecting-ip')) ||
    getFirstIp(req.headers.get('x-forwarded-for')) ||
    getFirstIp(req.headers.get('x-real-ip')) ||
    'unknown'
  const userAgent = req.headers.get('user-agent') ?? ''
  const referer = req.headers.get('referer') ?? ''
  const acceptLanguage = req.headers.get('accept-language') ?? ''
  const acceptEncoding = req.headers.get('accept-encoding') ?? ''
  const country = req.headers.get('cf-ipcountry') ?? req.headers.get('x-country') ?? 'UNKNOWN'
  const sessionId = req.headers.get('x-kza-session') ?? crypto.randomUUID()
  const endpoint = normalizePath(url)

  const isAdmin = async () => {
    if (!userId) return false
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle()
    return Boolean(data?.is_admin)
  }

  const adminSession = await isAdmin()

  const scoreHeaders = (score: number) =>
    adminSession ? { 'X-KZA-Score': score.toString() } : {}

  const now = new Date()

  if (userId || ipAddress !== 'unknown') {
    const banQuery = supabase
      .from('kza_banned_entities')
      .select('*')
      .eq('is_active', true)

    if (userId) {
      banQuery.or(`user_id.eq.${userId},ip_address.eq.${ipAddress}`)
    } else {
      banQuery.eq('ip_address', ipAddress)
    }

    const { data: bans } = await banQuery
    const activeBan = (bans ?? []).find((ban) => {
      if (!ban.is_active) return false
      if (ban.ban_type === 'TEMP' && ban.banned_until) {
        return new Date(ban.banned_until) > now
      }
      if (ban.ban_type === 'TEMP' && ban.banned_until) {
        return false
      }
      return true
    })

    if (bans?.length) {
      const expiredTempBans = bans.filter(
        (ban) => ban.ban_type === 'TEMP' && ban.banned_until && new Date(ban.banned_until) <= now
      )
      if (expiredTempBans.length) {
        await supabase
          .from('kza_banned_entities')
          .update({ is_active: false })
          .in(
            'id',
            expiredTempBans.map((ban) => ban.id)
          )
      }
    }

    if (activeBan) {
      return jsonResponse({ error: 'Access denied', code: 'KZA_BANNED' }, 403, scoreHeaders(BLACK_THRESHOLD))
    }
  }

  let threatScore = 0
  const threatFlags: string[] = []
  const anomalyFlags: string[] = []
  let profileData: any = null

  if (userId) {
    const { data: profile } = await supabase
      .from('kza_user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    const deviceProfile = parseDeviceProfile(profile?.typical_devices)
    const lastSeen = profile?.last_seen_at ? new Date(profile.last_seen_at) : null
    const intervalMs = lastSeen ? now.getTime() - lastSeen.getTime() : null
    const currentHour = now.getUTCHours()
    const typicalEndpoints = profile?.typical_endpoints ?? []
    const typicalCountries = profile?.typical_countries ?? []
    const typicalHours = profile?.typical_active_hours ?? []

    if (profile) {
      if (country !== 'UNKNOWN' && typicalCountries.length && !typicalCountries.includes(country)) {
        threatScore += 25
        anomalyFlags.push('GEO_ANOMALY')
      }
      if (userAgent && deviceProfile.fingerprints.length && !deviceProfile.fingerprints.includes(userAgent)) {
        threatScore += 15
        anomalyFlags.push('DEVICE_ANOMALY')
      }
      if (intervalMs !== null && profile.avg_request_interval_ms) {
        if (intervalMs < profile.avg_request_interval_ms / 3) {
          threatScore += 20
          anomalyFlags.push('VELOCITY_ANOMALY')
        }
      }
      if (endpoint && typicalEndpoints.length && !typicalEndpoints.includes(endpoint)) {
        threatScore += 10
        anomalyFlags.push('ENDPOINT_ANOMALY')
      }
      if (typicalHours.length && !typicalHours.includes(currentHour)) {
        threatScore += 10
        anomalyFlags.push('TIME_ANOMALY')
      }
    }

    const updatedEndpoints = [...new Set([...(typicalEndpoints ?? []), endpoint])].slice(0, 100)
    const updatedCountries = country === 'UNKNOWN' ? typicalCountries ?? [] : [...new Set([...(typicalCountries ?? []), country])]
    const updatedHours = [...new Set([...(typicalHours ?? []), currentHour])]
    const updatedFingerprints = userAgent
      ? [...new Set([...(deviceProfile.fingerprints ?? []), userAgent])]
      : deviceProfile.fingerprints

    const nextIntervals = intervalMs !== null
      ? [...(deviceProfile.recent_intervals ?? []), intervalMs].slice(-5)
      : deviceProfile.recent_intervals ?? []

    const nextAverageInterval = intervalMs !== null
      ? Math.round(
          ((profile?.avg_request_interval_ms ?? intervalMs) * (profile?.total_requests ?? 0) + intervalMs) /
            ((profile?.total_requests ?? 0) + 1)
        )
      : profile?.avg_request_interval_ms ?? null

    const totalRequests = (profile?.total_requests ?? 0) + 1

    if (!profile) {
      await supabase.from('kza_user_profiles').insert({
        user_id: userId,
        typical_endpoints: [endpoint],
        typical_countries: country === 'UNKNOWN' ? [] : [country],
        typical_devices: { fingerprints: userAgent ? [userAgent] : [], recent_intervals: nextIntervals },
        avg_request_interval_ms: intervalMs ?? null,
        typical_active_hours: [currentHour],
        total_requests: 1,
        last_seen_at: now.toISOString(),
      })
    } else {
      await supabase
        .from('kza_user_profiles')
        .update({
          typical_endpoints: updatedEndpoints,
          typical_countries: updatedCountries,
          typical_active_hours: updatedHours,
          typical_devices: { fingerprints: updatedFingerprints, recent_intervals: nextIntervals },
          avg_request_interval_ms: nextAverageInterval,
          total_requests: totalRequests,
          last_seen_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('user_id', userId)
    }

    profileData = profile
  }

  const loweredPayload = `${url} ${bodySnapshot} ${userAgent} ${referer}`.toLowerCase()

  const sqlSignals = ["' or", '; drop', 'union select', '1=1', '--', 'xp_', 'exec(', 'cast(', '%27', '%3b', '%2d%2d']
  if (sqlSignals.some((signal) => loweredPayload.includes(signal))) {
    threatScore += 60
    threatFlags.push('SQL_INJECTION')
  }

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const isProfileEndpoint = endpoint.includes('profile') || endpoint.includes('user')
    if (isProfileEndpoint && /(is_admin|is_premium|role|permissions)/i.test(bodySnapshot)) {
      threatScore += 60
      threatFlags.push('PRIVILEGE_FIELD_INJECTION')
    }
  }

  const traversalSignals = ['../', '..%2f', '..%5c', '%2e%2e']
  if (traversalSignals.some((signal) => loweredPayload.includes(signal))) {
    threatScore += 70
    threatFlags.push('PATH_TRAVERSAL')
  }

  if (userId && endpoint.includes(userId) === false && /(profiles|users|files)/i.test(endpoint)) {
    threatScore += 70
    threatFlags.push('NAMESPACE_ESCAPE')
  }

  const resourceIds = findResourceIds(endpoint)
  if (userId && resourceIds.some((id) => id !== userId)) {
    threatScore += 40
    threatFlags.push('ENUMERATION_PATTERN')
  }

  if (resourceIds.length) {
    const since = new Date(now.getTime() - 60_000).toISOString()
    const { data: recentAccess } = await supabase
      .from('kza_threat_events')
      .select('payload_snapshot')
      .eq('threat_type', 'RESOURCE_ACCESS')
      .gte('created_at', since)
      .or(userId ? `user_id.eq.${userId},ip_address.eq.${ipAddress}` : `ip_address.eq.${ipAddress}`)

    const recentIds = new Set<string>()
    for (const item of recentAccess ?? []) {
      const ids = (item.payload_snapshot?.resource_ids ?? []) as string[]
      ids?.forEach((id) => recentIds.add(id))
    }
    resourceIds.forEach((id) => recentIds.add(id))

    await supabase.from('kza_threat_events').insert({
      user_id: userId,
      session_id: sessionId,
      ip_address: ipAddress,
      threat_tier: null,
      threat_type: 'RESOURCE_ACCESS',
      description: 'Resource access tracking',
      payload_snapshot: { resource_ids: resourceIds, endpoint },
      endpoint_hit: endpoint,
      method,
      automated_action_taken: tier ? `KZA_${tier}_ACTION` : null,
    })

    if (recentIds.size > 20) {
      threatScore += 40
      threatFlags.push('ENUMERATION_VOLUME')
    }
  }

  const reconPaths = [
    '/.env',
    '/config',
    '/admin',
    '/admin-dashboard',
    '/_admin',
    '/api/internal',
    '/debug',
    '/backup',
    '/wp-admin',
    '/phpmyadmin',
    '/management',
    '/supabase',
    '/v2',
    '/.git',
  ]
  if (reconPaths.some((path) => endpoint.toLowerCase().includes(path))) {
    threatScore += 30
    threatFlags.push('RECONNAISSANCE')
  }

  if (['OPTIONS', 'HEAD'].includes(method)) {
    const since = new Date(now.getTime() - 60_000).toISOString()
    const { data: recentOptions } = await supabase
      .from('kza_threat_events')
      .select('payload_snapshot')
      .eq('threat_type', 'OPTIONS_PROBE')
      .gte('created_at', since)
      .or(userId ? `user_id.eq.${userId},ip_address.eq.${ipAddress}` : `ip_address.eq.${ipAddress}`)

    const endpoints = new Set<string>()
    for (const event of recentOptions ?? []) {
      const path = event.payload_snapshot?.endpoint
      if (typeof path === 'string') endpoints.add(path)
    }
    endpoints.add(endpoint)

    await supabase.from('kza_threat_events').insert({
      user_id: userId,
      session_id: sessionId,
      ip_address: ipAddress,
      threat_tier: null,
      threat_type: 'OPTIONS_PROBE',
      description: 'OPTIONS/HEAD endpoint probe',
      payload_snapshot: { endpoint },
      endpoint_hit: endpoint,
      method,
      automated_action_taken: null,
    })

    if (endpoints.size > 5) {
      threatScore += 30
      threatFlags.push('RECON_OPTIONS_SWEEP')
    }
  }

  if (!acceptLanguage) {
    threatScore += 35
    threatFlags.push('BOT_NO_ACCEPT_LANGUAGE')
  }
  if (!acceptEncoding) {
    threatScore += 35
    threatFlags.push('BOT_NO_ACCEPT_ENCODING')
  }

  const headlessSignals = [
    'headlesschrome',
    'phantomjs',
    'selenium',
    'puppeteer',
    'playwright',
    'python-requests',
    'curl',
    'wget',
    'sqlmap',
    'nikto',
    'nuclei',
  ]
  if (headlessSignals.some((signal) => userAgent.toLowerCase().includes(signal))) {
    threatScore += 35
    threatFlags.push('BOT_USER_AGENT')
  }

  if (userId && profileData?.typical_devices) {
    const deviceProfile = parseDeviceProfile(profileData.typical_devices)
    if (deviceProfile.recent_intervals.length >= 5) {
      const lastInterval = deviceProfile.recent_intervals[deviceProfile.recent_intervals.length - 1]
      const precise = deviceProfile.recent_intervals.every((interval) => Math.abs(interval - lastInterval) <= 5)
      if (precise) {
        threatScore += 35
        threatFlags.push('BOT_PRECISE_INTERVALS')
      }
    }
  }

  if (authErrorMessage && authErrorMessage.toLowerCase().includes('revoked')) {
    threatScore += 80
    threatFlags.push('TOKEN_REPLAY')
  }

  const isAuthEndpoint = /auth|login|token|mfa/i.test(endpoint)
  if (isAuthEndpoint && ['POST', 'PUT', 'PATCH'].includes(method)) {
    let accountIdentifier: string | null = null
    try {
      const parsedBody = JSON.parse(bodySnapshot || '{}')
      accountIdentifier = parsedBody.email || parsedBody.user_id || parsedBody.username || null
    } catch {
      const emailMatch = bodySnapshot.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
      accountIdentifier = emailMatch?.[0] ?? null
    }

    await supabase.from('kza_threat_events').insert({
      user_id: userId,
      session_id: sessionId,
      ip_address: ipAddress,
      threat_tier: null,
      threat_type: 'AUTH_ATTEMPT',
      description: 'Auth attempt tracking',
      payload_snapshot: { account: accountIdentifier },
      endpoint_hit: endpoint,
      method,
    })

    const authFailure = (req.headers.get('x-kza-auth-result') ?? '').toLowerCase() === 'failure'
    if (authFailure) {
      await supabase.from('kza_threat_events').insert({
        user_id: userId,
        session_id: sessionId,
        ip_address: ipAddress,
        threat_tier: null,
        threat_type: 'AUTH_FAILURE',
        description: 'Auth failure tracking',
        payload_snapshot: { account: accountIdentifier },
        endpoint_hit: endpoint,
        method,
      })
    }

    const failureSince = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
    const { data: recentFailures } = await supabase
      .from('kza_threat_events')
      .select('id')
      .eq('threat_type', 'AUTH_FAILURE')
      .gte('created_at', failureSince)
      .eq('ip_address', ipAddress)
    if ((recentFailures?.length ?? 0) > 5) {
      threatScore += 80
      threatFlags.push('AUTH_BRUTE_FORCE')
    }

    const stuffingSince = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
    const { data: recentAttempts } = await supabase
      .from('kza_threat_events')
      .select('payload_snapshot')
      .eq('threat_type', 'AUTH_ATTEMPT')
      .gte('created_at', stuffingSince)
      .eq('ip_address', ipAddress)
    const uniqueAccounts = new Set<string>()
    for (const attempt of recentAttempts ?? []) {
      const account = attempt.payload_snapshot?.account
      if (typeof account === 'string') uniqueAccounts.add(account)
    }
    if (uniqueAccounts.size > 10) {
      threatScore += 80
      threatFlags.push('CREDENTIAL_STUFFING')
    }

    if (bodySnapshot.toLowerCase().includes('mfa') || bodySnapshot.toLowerCase().includes('otp')) {
      const mfaFailure = (req.headers.get('x-kza-mfa-result') ?? '').toLowerCase() === 'failure'
      if (mfaFailure) {
        await supabase.from('kza_threat_events').insert({
          user_id: userId,
          session_id: sessionId,
          ip_address: ipAddress,
          threat_tier: null,
          threat_type: 'MFA_FAILURE',
          description: 'MFA failure tracking',
          payload_snapshot: { account: accountIdentifier },
          endpoint_hit: endpoint,
          method,
        })
      }

      const mfaSince = new Date(now.getTime() - 2 * 60 * 1000).toISOString()
      const { data: mfaFailures } = await supabase
        .from('kza_threat_events')
        .select('id')
        .eq('threat_type', 'MFA_FAILURE')
        .gte('created_at', mfaSince)
        .eq('ip_address', ipAddress)
      if ((mfaFailures?.length ?? 0) > 3) {
        threatScore += 80
        threatFlags.push('MFA_BRUTE_FORCE')
      }
    }
  }

  if (forcedTier) {
    threatScore = forcedTier === 'BLACK' ? BLACK_THRESHOLD : forcedTier === 'RED' ? RED_THRESHOLD : threatScore
    if (forcedThreatType) {
      threatFlags.push(forcedThreatType)
    }
  }

  if (/(is_admin\s*:\s*true|is_premium\s*:\s*true)/i.test(bodySnapshot)) {
    threatScore += 100
    threatFlags.push('PRIVILEGE_ESCALATION')
  }

  if (endpoint.includes('/admin') && !adminSession) {
    threatScore += 100
    threatFlags.push('ADMIN_ROUTE_ACCESS')
  }

  if (userId && /\/profiles\/|\/users\/|\/files\//i.test(endpoint)) {
    const idsInPath = findResourceIds(endpoint)
    if (idsInPath.length && !idsInPath.includes(userId)) {
      threatScore += 100
      threatFlags.push('CROSS_USER_MODIFICATION')
    }
  }

  const totalScore = threatScore
  let tier: string | null = null
  if (totalScore >= BLACK_THRESHOLD) tier = 'BLACK'
  else if (totalScore >= RED_THRESHOLD) tier = 'RED'
  else if (totalScore >= ORANGE_THRESHOLD) tier = 'ORANGE'
  else if (totalScore >= YELLOW_THRESHOLD) tier = 'YELLOW'

  if (tier && userId) {
    await supabase
      .from('kza_user_profiles')
      .update({
        threat_score: Math.max(profileData?.threat_score ?? 0, totalScore),
        is_watchlisted: tier === 'YELLOW' || tier === 'ORANGE' || totalScore >= ORANGE_THRESHOLD,
        updated_at: now.toISOString(),
      })
      .eq('user_id', userId)
  }

  let threatEventId: string | null = null
  if (tier) {
    const { data: insertedThreat } = await supabase
      .from('kza_threat_events')
      .insert({
        user_id: userId,
        session_id: sessionId,
        ip_address: ipAddress,
        threat_tier: tier,
        threat_type: forcedThreatType || threatFlags.join(',') || 'KZA_ANOMALY',
        description: forcedDescription ?? `KZA detected: ${[...threatFlags, ...anomalyFlags].join(', ')}`,
        payload_snapshot: {
          url,
          method,
          body_snapshot: bodySnapshot,
          headers: {
            user_agent: userAgent,
            referer,
            accept_language: acceptLanguage,
            accept_encoding: acceptEncoding,
          },
          anomalies: anomalyFlags,
          flags: threatFlags,
          country,
        },
        endpoint_hit: endpoint,
        method,
        automated_action_taken: null,
      })
      .select('id')
      .maybeSingle()
    threatEventId = insertedThreat?.id ?? null
  }

  if (tier === 'ORANGE') {
    const since = new Date(now.getTime() - 60_000).toISOString()
    const { data: recent } = await supabase
      .from('kza_threat_events')
      .select('id')
      .eq('threat_type', 'ORANGE_RATE_TRACK')
      .gte('created_at', since)
      .or(userId ? `user_id.eq.${userId},ip_address.eq.${ipAddress}` : `ip_address.eq.${ipAddress}`)
    if ((recent?.length ?? 0) >= 5) {
      return jsonResponse({ error: 'Rate limit enforced', code: 'KZA_ORANGE_RATE' }, 429, scoreHeaders(totalScore))
    }
    await supabase.from('kza_threat_events').insert({
      user_id: userId,
      session_id: sessionId,
      ip_address: ipAddress,
      threat_tier: 'ORANGE',
      threat_type: 'ORANGE_RATE_TRACK',
      description: 'ORANGE watchlist request tracking',
      payload_snapshot: { endpoint, method },
      endpoint_hit: endpoint,
      method,
      automated_action_taken: 'ORANGE_RATE_LIMIT',
    })
  }

  if (tier === 'RED' || tier === 'BLACK') {
    await supabase.from('kza_banned_entities').insert({
      user_id: userId,
      ip_address: ipAddress,
      ban_type: tier === 'BLACK' ? 'PERMANENT' : 'TEMP',
      ban_reason: `KZA auto-ban (${tier})`,
      ban_tier: tier,
      attack_summary: threatFlags.join(', '),
      banned_until: tier === 'RED' ? new Date(now.getTime() + TEMP_BAN_HOURS * 60 * 60 * 1000).toISOString() : null,
      is_active: true,
    })

    if (userId) {
      await supabase.auth.admin.signOut(userId)
    }

    if (threatEventId) {
      await supabase.from('kza_admin_incidents').insert({
        threat_event_id: threatEventId,
        incident_title: `${tier} - ${threatFlags[0] ?? 'KZA'} detected from ${ipAddress}`,
        threat_tier: tier,
        attacker_profile: {
          user_id: userId,
          ip_address: ipAddress,
          session_id: sessionId,
        },
        attack_timeline: [
          {
            timestamp: now.toISOString(),
            action: threatFlags.join(',') || 'KZA_ENFORCEMENT',
            endpoint,
            result: 'BLOCKED',
          },
        ],
        what_was_targeted: endpoint,
        potential_harm: 'Automated enforcement triggered due to high-risk signals.',
        techniques_used: threatFlags,
        actions_taken: ['BAN_APPLIED', 'SESSION_TERMINATED'],
        linked_accounts: [],
        network_intel: { ip: ipAddress, country },
      })
    }

    const internalHeaders = {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    }
    if (threatEventId) {
      if (KZA_ORACLE_ENABLED) {
        await fetch(`${SUPABASE_URL}/functions/v1/kza-oracle`, {
          method: 'POST',
          headers: internalHeaders,
          body: JSON.stringify({
            threat_event_id: threatEventId,
            user_id: userId,
            ip_address: ipAddress,
            user_agent: userAgent,
            threat_tier: tier,
            threat_type: forcedThreatType || threatFlags.join(',') || null,
          }),
        }).catch(() => null)
      }

      await fetch(`${SUPABASE_URL}/functions/v1/kza-verdict`, {
        method: 'POST',
        headers: internalHeaders,
        body: JSON.stringify({
          threat_event_id: threatEventId,
          threat_tier: tier,
        }),
      }).catch(() => null)
    }

    return jsonResponse({ error: 'Access denied', code: 'KZA_BLOCKED' }, 403, scoreHeaders(totalScore))
  }

  return jsonResponse({ ok: true, score: totalScore, tier }, 200, scoreHeaders(totalScore))
})
