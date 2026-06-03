
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kza-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EXPLORER_TABLES = new Set([
  'admin_access_logs',
  'kza_admin_incidents',
  'kza_threat_events',
  'kza_banned_entities',
  'kza_user_profiles',
  'kza_honeypot_hits',
  'kza_linked_accounts',
  'kza_phantom_assets',
])

const TABLE_ORDER_COLUMNS: Record<string, string> = {
  admin_access_logs: 'access_timestamp',
  audit_logs: 'created_at',
  analytics_events: 'created_at',
  kza_admin_incidents: 'created_at',
  kza_threat_events: 'created_at',
  kza_banned_entities: 'created_at',
  kza_user_profiles: 'updated_at',
  kza_honeypot_hits: 'created_at',
  kza_linked_accounts: 'created_at',
  kza_phantom_assets: 'created_at',
}

const MANAGEMENT_API_BASE = 'https://api.supabase.com'

const getSecret = (...keys: string[]) => {
  for (const key of keys) {
    const value = Deno.env.get(key)
    if (value && value.length > 0) {
      return value
    }
  }

  return ''
}

const LOG_SOURCE_FILTERS = {
  all: [
    'edge_logs',
    'function_edge_logs',
    'function_logs',
    'auth_logs',
    'postgres_logs',
    'realtime_logs',
    'storage_logs',
  ],
  api: ['edge_logs'],
  edge_functions: ['function_edge_logs', 'function_logs'],
  function_edge_logs: ['function_edge_logs'],
  function_logs: ['function_logs'],
  auth: ['auth_logs'],
  postgres: ['postgres_logs'],
  realtime: ['realtime_logs'],
  storage: ['storage_logs'],
} as const

const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''")

const parseProjectRefFromUrl = (value: string) => {
  const match = value.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)
  return match?.[1] ?? ''
}

const buildCombinedLogsSql = (sources: string[]) => {
  return sources
    .map((source) => `SELECT '${source}' AS source, timestamp, event_message FROM ${source}`)
    .join(' UNION ALL ')
}

const buildLogsWhereClause = (
  startIso: string,
  endIso: string,
  searchTerm: string,
  severity: string
) => {
  const clauses = [
    `timestamp >= TIMESTAMP('${escapeSqlLiteral(startIso)}')`,
    `timestamp <= TIMESTAMP('${escapeSqlLiteral(endIso)}')`,
  ]

  if (searchTerm) {
    const safeSearch = escapeSqlLiteral(searchTerm.toLowerCase())
    clauses.push(`LOWER(event_message) LIKE '%${safeSearch}%'`)
  }

  if (severity === 'errors') {
    clauses.push("(LOWER(event_message) LIKE '%error%' OR LOWER(event_message) LIKE '%exception%' OR LOWER(event_message) LIKE '%fail%' OR LOWER(event_message) LIKE '%fatal%' OR LOWER(event_message) LIKE '%panic%' OR LOWER(event_message) LIKE '%timeout%' OR LOWER(event_message) LIKE '%forbidden%' OR LOWER(event_message) LIKE '%unauthorized%')")
  }

  if (severity === 'warnings') {
    clauses.push("(LOWER(event_message) LIKE '%warn%' OR LOWER(event_message) LIKE '%deprecated%' OR LOWER(event_message) LIKE '%throttle%' OR LOWER(event_message) LIKE '%rate limit%')")
  }

  return `WHERE ${clauses.join(' AND ')}`
}

const runManagementLogsQuery = async (
  projectRef: string,
  managementToken: string,
  sql: string,
  startIso: string,
  endIso: string
) => {
  const params = new URLSearchParams({
    sql,
    iso_timestamp_start: startIso,
    iso_timestamp_end: endIso,
  })

  const response = await fetch(
    `${MANAGEMENT_API_BASE}/v1/projects/${projectRef}/analytics/endpoints/logs.all?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${managementToken}`,
      },
    }
  )

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const details = payload?.message || payload?.error || `Management API request failed (${response.status})`
    throw new Error(details)
  }

  if (Array.isArray(payload?.result)) {
    return payload.result as Array<Record<string, unknown>>
  }

  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>
  }

  return []
}

const inferLevel = (message: string) => {
  const lower = message.toLowerCase()
  if (lower.includes('error') || lower.includes('exception') || lower.includes('fatal') || lower.includes('panic')) {
    return 'error'
  }
  if (lower.includes('warn') || lower.includes('deprecated')) {
    return 'warning'
  }
  return 'info'
}

const normalizeLogTimestamp = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value / 1000).toISOString()
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return new Date(numeric / 1000).toISOString()
    }

    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  }

  return new Date().toISOString()
}

const jsonResponse = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const toPositiveInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

const sanitizeSearchTerm = (value: unknown) => {
  if (typeof value !== 'string') return ''
  return value.replace(/[,%()]/g, ' ').trim()
}

const buildSearchPattern = (value: string) => {
  if (!value) return ''
  return `%${value}%`
}

const safeDate = (value: string | null | undefined) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const createEmptyGlobalLogsPayload = (
  page: number,
  pageSize: number,
  sourceFilter: string,
  severity: string,
  windowHours: number,
  projectRef: string,
  error?: string
) => {
  const base = {
    logs: [],
    pagination: {
      page,
      pageSize,
      totalFiltered: 0,
      totalPages: 1,
    },
    summary: {
      totalLogs: 0,
      errorLogs: 0,
      sourceFilter,
      severity,
      windowHours,
      sourceBreakdown: [],
      projectRef,
    },
    timeline: [],
  }

  if (!error) {
    return base
  }

  return {
    ...base,
    error,
  }
}

const countRows = async (
  supabase: any,
  table: string,
  filters: Array<{ type: 'eq' | 'gte' | 'ilike'; column: string; value: unknown }> = []
) => {
  let query: any = supabase.from(table).select('*', { count: 'exact', head: true })

  for (const filter of filters) {
    if (filter.type === 'eq') {
      query = query.eq(filter.column, filter.value)
    }
    if (filter.type === 'gte') {
      query = query.gte(filter.column, filter.value)
    }
    if (filter.type === 'ilike') {
      query = query.ilike(filter.column, String(filter.value))
    }
  }

  const { count, error } = await query
  if (error) return 0
  return count ?? 0
}

const inferColumnType = (rows: Record<string, unknown>[], column: string) => {
  for (const row of rows) {
    const value = row[column]
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) return 'array'
    if (typeof value === 'object') return 'json'
    return typeof value
  }

  return 'unknown'
}

serve(async (req) => {
  // Allow preflight requests without KZA enforcement.
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // KZA Guard — must be first
  const kzaResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/kza-sentinel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': req.headers.get('Authorization') ?? '',
      'X-KZA-Session': req.headers.get('X-KZA-Session') ?? '',
      'X-Forwarded-For': req.headers.get('X-Forwarded-For') ?? '',
      'User-Agent': req.headers.get('User-Agent') ?? '',
    },
    body: JSON.stringify({
      url: req.url,
      method: req.method,
      body_snapshot: await req.clone().text()
    })
  });

  if (!kzaResponse.ok) {
    return kzaResponse; // KZA blocked this request — return its response directly
  }

  let requestBody: Record<string, unknown> = {}

  try {
    const supabase = createClient(
      getSecret('SP_URL', 'SUPABASE_URL'),
      getSecret('SP_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY')
    )

    // Get the user from the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'No authorization header' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return jsonResponse({ error: 'Invalid token' }, 401)
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return jsonResponse({ error: 'Admin access required' }, 403)
    }

    requestBody = await req.json()
    const action = requestBody?.action
    const userId = requestBody?.userId

    if (action === 'all_users') {
      // Get all users with their profile information
      const { data: users, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      return jsonResponse({ users })
    }

    if (action === 'user_details' && userId) {
      // Get user profile
      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) throw profileError

      // Get user's API keys
      const { data: apiKeys, error: keysError } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      // Get user's files
      const { data: files, error: filesError } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      // Get user's API request logs
      const { data: logs, error: logsError } = await supabase
        .from('api_request_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (keysError || filesError || logsError) {
        console.error('user_details partial error:', { keysError, filesError, logsError })
      }

      return jsonResponse({
        profile: userProfile,
        apiKeys: apiKeys || [],
        files: files || [],
        logs: logs || []
      })
    }

    if (action === 'global_analytics') {
      // Get global analytics data
      
      // Total users
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })

      // All files for analytics
      const { data: filesData } = await supabase
        .from('files')
        .select('size, created_at, user_id')

      const totalFiles = filesData?.length || 0
      const totalStorageUsed = filesData?.reduce((sum, file) => sum + (file.size || 0), 0) || 0

      // Calculate time-based metrics
      const now = new Date()
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const last6Months = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000)
      const lastYear = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

      const filesLast7Days = filesData?.filter(f => safeDate(f.created_at)?.getTime()! > last7Days.getTime()).length || 0
      const filesLast30Days = filesData?.filter(f => safeDate(f.created_at)?.getTime()! > last30Days.getTime()).length || 0
      const filesLast6Months = filesData?.filter(f => safeDate(f.created_at)?.getTime()! > last6Months.getTime()).length || 0
      const filesLastYear = filesData?.filter(f => safeDate(f.created_at)?.getTime()! > lastYear.getTime()).length || 0

      // Top active users by file count
      const userFileCounts = filesData?.reduce((acc: any, file) => {
        acc[file.user_id] = (acc[file.user_id] || 0) + 1
        return acc
      }, {}) || {}

      // Get user names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')

      const topActiveUsers = Object.entries(userFileCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 10)
        .map(([userId, count]) => ({
          userId,
          count,
          name: profiles?.find(p => p.id === userId)?.full_name || 'Unknown User'
        }))

      // Top storage users
      const userStorageUsage = filesData?.reduce((acc: any, file) => {
        acc[file.user_id] = (acc[file.user_id] || 0) + (file.size || 0)
        return acc
      }, {}) || {}

      const topStorageUsers = Object.entries(userStorageUsage)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 10)
        .map(([userId, storage]) => ({
          userId,
          storage: storage as number,
          name: profiles?.find(p => p.id === userId)?.full_name || 'Unknown User'
        }))

      // Upload trends (last 30 days)
      const uploadTrends = []
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
        const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
        
        const dayUploads = filesData?.filter(f => {
          const fileDate = safeDate(f.created_at)
          if (!fileDate) return false
          return fileDate >= dayStart && fileDate < dayEnd
        }).length || 0

        uploadTrends.push({
          date: dayStart.toISOString().split('T')[0],
          uploads: dayUploads
        })
      }

      // User growth (last 12 months)
      const userGrowth = []
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
        
        const { count: monthUsers } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .lt('created_at', nextMonth.toISOString())

        userGrowth.push({
          month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          users: monthUsers || 0
        })
      }

      return jsonResponse({
        totalUsers: totalUsers || 0,
        totalStorageUsed,
        totalFiles,
        filesLast7Days,
        filesLast30Days,
        filesLast6Months,
        filesLastYear,
        topActiveUsers,
        topStorageUsers,
        uploadTrends,
        userGrowth
      })
    }

    if (action === 'global_logs') {
      const page = toPositiveInt(requestBody.page, 1, 1, 5000)
      const pageSize = toPositiveInt(requestBody.pageSize, 50, 10, 200)
      const windowHours = toPositiveInt(requestBody.windowHours, 24, 1, 24)
      const searchTerm = sanitizeSearchTerm(requestBody.searchTerm).toLowerCase()
      const severity = typeof requestBody.severity === 'string' ? requestBody.severity : 'all'
      const sourceFilter = typeof requestBody.sourceFilter === 'string' ? requestBody.sourceFilter : 'all'
      const selectedSources =
        LOG_SOURCE_FILTERS[sourceFilter as keyof typeof LOG_SOURCE_FILTERS] || LOG_SOURCE_FILTERS.all

      const managementToken =
        getSecret('SP_MANAGEMENT_API_TOKEN', 'SUPABASE_MANAGEMENT_API_TOKEN')
        || getSecret('SP_ACCESS_TOKEN', 'SUPABASE_ACCESS_TOKEN')
        || ''

      const projectRef =
        getSecret('SP_PROJECT_REF', 'SUPABASE_PROJECT_REF')
        || parseProjectRefFromUrl(getSecret('SP_URL', 'SUPABASE_URL'))

      const emptyPayload = createEmptyGlobalLogsPayload(
        page,
        pageSize,
        sourceFilter,
        severity,
        windowHours,
        projectRef
      )

      if (!managementToken || !projectRef) {
        return jsonResponse(
          createEmptyGlobalLogsPayload(
            page,
            pageSize,
            sourceFilter,
            severity,
            windowHours,
            projectRef,
            'Missing management config. Set SP_MANAGEMENT_API_TOKEN (or SP_ACCESS_TOKEN), SP_PROJECT_REF, and SP_URL in edge function secrets.'
          )
        )
      }

      const now = new Date()
      const start = new Date(now.getTime() - windowHours * 60 * 60 * 1000)
      const startIso = start.toISOString()
      const endIso = now.toISOString()
      const offset = (page - 1) * pageSize

      const combinedSql = buildCombinedLogsSql(selectedSources)
      const whereSql = buildLogsWhereClause(startIso, endIso, searchTerm, severity)
      const errorWhereSql = buildLogsWhereClause(startIso, endIso, searchTerm, 'errors')

      const pageSql = `
        SELECT source, timestamp, event_message
        FROM (${combinedSql}) AS logs
        ${whereSql}
        ORDER BY timestamp DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `

      const countSql = `
        SELECT COUNT(1) AS total
        FROM (${combinedSql}) AS logs
        ${whereSql}
      `

      const errorCountSql = `
        SELECT COUNT(1) AS total
        FROM (${combinedSql}) AS logs
        ${errorWhereSql}
      `

      const sourcesSql = `
        SELECT source, COUNT(1) AS total
        FROM (${combinedSql}) AS logs
        ${whereSql}
        GROUP BY source
        ORDER BY total DESC
      `

      const timelineSql = `
        SELECT
          FORMAT_TIMESTAMP('%Y-%m-%d %H:00:00', TIMESTAMP_TRUNC(timestamp, HOUR)) AS bucket,
          COUNT(1) AS total
        FROM (${combinedSql}) AS logs
        ${whereSql}
        GROUP BY bucket
        ORDER BY bucket ASC
      `

      let rows: Array<Record<string, unknown>> = []
      let counts: Array<Record<string, unknown>> = []
      let errorCounts: Array<Record<string, unknown>> = []
      let sourceBreakdownRows: Array<Record<string, unknown>> = []
      let timelineRows: Array<Record<string, unknown>> = []

      try {
        ;[rows, counts, errorCounts, sourceBreakdownRows, timelineRows] = await Promise.all([
          runManagementLogsQuery(projectRef, managementToken, pageSql, startIso, endIso),
          runManagementLogsQuery(projectRef, managementToken, countSql, startIso, endIso),
          runManagementLogsQuery(projectRef, managementToken, errorCountSql, startIso, endIso),
          runManagementLogsQuery(projectRef, managementToken, sourcesSql, startIso, endIso),
          runManagementLogsQuery(projectRef, managementToken, timelineSql, startIso, endIso),
        ])
      } catch (queryError) {
        console.error('global_logs management query failed:', queryError)
        const errorMessage =
          queryError instanceof Error
            ? queryError.message
            : 'Failed to query Supabase management logs endpoint'

        return jsonResponse({
          ...emptyPayload,
          error: errorMessage,
        })
      }

      const normalizedLogs = rows.map((row, index) => {
        const source = typeof row.source === 'string' ? row.source : 'unknown'
        const rawMessage =
          typeof row.event_message === 'string'
            ? row.event_message
            : JSON.stringify(row.event_message ?? '')

        let parsedMessage: Record<string, unknown> | null = null
        if (rawMessage.startsWith('{')) {
          try {
            parsedMessage = JSON.parse(rawMessage)
          } catch {
            parsedMessage = null
          }
        }

        const message =
          typeof parsedMessage?.msg === 'string'
            ? parsedMessage.msg
            : rawMessage

        const level =
          typeof parsedMessage?.level === 'string'
            ? parsedMessage.level.toLowerCase()
            : inferLevel(message)

        const path =
          typeof parsedMessage?.path === 'string'
            ? parsedMessage.path
            : null

        const statusValue =
          parsedMessage?.status
            ?? parsedMessage?.status_code
            ?? null

        const numericStatus = Number(statusValue)
        const statusCode = Number.isFinite(numericStatus) ? numericStatus : null

        const timestamp = normalizeLogTimestamp(row.timestamp ?? parsedMessage?.time ?? null)

        return {
          id: typeof row.id === 'string' ? row.id : `${source}-${timestamp}-${index}`,
          source,
          timestamp,
          level,
          path,
          statusCode,
          message,
          eventMessage: rawMessage,
        }
      })

      const totalFiltered = Number((counts[0]?.total ?? 0)) || 0
      const errorLogs = Number((errorCounts[0]?.total ?? 0)) || 0

      const sourceBreakdown = sourceBreakdownRows.map((row) => ({
        source: typeof row.source === 'string' ? row.source : 'unknown',
        total: Number(row.total ?? 0) || 0,
      }))

      const timeline = timelineRows.map((row) => ({
        bucket: typeof row.bucket === 'string' ? row.bucket : '',
        total: Number(row.total ?? 0) || 0,
      }))

      return jsonResponse({
        logs: normalizedLogs,
        pagination: {
          page,
          pageSize,
          totalFiltered,
          totalPages: Math.max(1, Math.ceil(totalFiltered / pageSize)),
        },
        summary: {
          totalLogs: totalFiltered,
          errorLogs,
          sourceFilter,
          severity,
          windowHours,
          sourceBreakdown,
          projectRef,
        },
        timeline,
      })
    }

    if (action === 'enterprise_overview') {
      const now24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [
        users,
        workspaces,
        filesTotal,
        encryptedFiles,
        folders,
        shares,
        publicFiles,
        deletedFiles,
        providers,
        apiKeys,
        apiRequests24h,
        apiErrors24h,
        adminAccess24h,
        supportOpen,
        supportNotifications,
        repositories,
        audit24h,
        analytics24h,
        archiveJobs,
        maintenanceFlags,
      ] = await Promise.all([
        countRows(supabase, 'profiles'),
        countRows(supabase, 'workspaces'),
        countRows(supabase, 'files'),
        countRows(supabase, 'files', [{ type: 'eq', column: 'encrypted', value: true }]),
        countRows(supabase, 'folders'),
        countRows(supabase, 'shares'),
        countRows(supabase, 'files', [{ type: 'eq', column: 'is_public', value: true }]),
        countRows(supabase, 'files', [{ type: 'eq', column: 'is_deleted', value: true }]),
        countRows(supabase, 'storage_providers'),
        countRows(supabase, 'api_keys'),
        countRows(supabase, 'api_request_logs', [{ type: 'gte', column: 'created_at', value: now24h }]),
        countRows(supabase, 'api_request_logs', [
          { type: 'gte', column: 'created_at', value: now24h },
          { type: 'gte', column: 'status_code', value: 400 },
        ]),
        countRows(supabase, 'admin_access_logs', [{ type: 'gte', column: 'access_timestamp', value: now24h }]),
        countRows(supabase, 'support_tickets', [{ type: 'eq', column: 'status', value: 'open' }]),
        countRows(supabase, 'support_notifications', [{ type: 'eq', column: 'is_read', value: false }]),
        countRows(supabase, 'repositories'),
        countRows(supabase, 'audit_logs', [{ type: 'gte', column: 'created_at', value: now24h }]),
        countRows(supabase, 'analytics_events', [{ type: 'gte', column: 'created_at', value: now24h }]),
        countRows(supabase, 'archive_extractions'),
        countRows(supabase, 'maintenance_mode'),
      ])

      const [uploadsRes, auditRes, storageRes] = await Promise.all([
        supabase
          .from('files')
          .select('id, name, size, encrypted, storage_path, created_at, user_id')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('audit_logs')
          .select('id, action, resource, created_at, user_id')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('files')
          .select('user_id, size')
          .limit(10000),
      ])

      const recentUploads = uploadsRes.data || []
      const recentAudit = auditRes.data || []

      const usageMap = new Map<string, number>()
      for (const row of storageRes.data || []) {
        const userId = row.user_id
        usageMap.set(userId, (usageMap.get(userId) || 0) + (row.size || 0))
      }

      const topUsagePairs = [...usageMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)

      const topUserIds = topUsagePairs.map(([id]) => id)
      const { data: topProfiles } = topUserIds.length
        ? await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', topUserIds)
        : { data: [] }

      const topNameMap = new Map<string, string>()
      for (const profileRow of topProfiles || []) {
        topNameMap.set(profileRow.id, profileRow.full_name || 'Unknown user')
      }

      const topStorageUsers = topUsagePairs.map(([userId, size]) => ({
        userId,
        name: topNameMap.get(userId) || 'Unknown user',
        size,
      }))

      const [workspaceLinks, providerLinks, fileLinks, folderLinks, shareLinks, maintenanceRows, fileTrendRows, userTrendRows] = await Promise.all([
        supabase.from('workspaces').select('id'),
        supabase.from('storage_providers').select('id'),
        supabase.from('files').select('id, workspace_id, storage_provider_id, is_public, encrypted'),
        supabase.from('folders').select('id, workspace_id, storage_provider_id'),
        supabase.from('shares').select('id, file_id'),
        supabase.from('maintenance_mode').select('id, is_enabled').limit(1),
        supabase
          .from('files')
          .select('created_at')
          .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from('profiles')
          .select('created_at')
          .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
      ])

      const workspaceSet = new Set<string>((workspaceLinks.data || []).map((row: any) => row.id))
      const providerSet = new Set<string>((providerLinks.data || []).map((row: any) => row.id))
      const fileRows = (fileLinks.data || []) as Array<{ id: string; workspace_id: string | null; storage_provider_id: string | null; is_public: boolean | null; encrypted: boolean | null }>
      const folderRows = (folderLinks.data || []) as Array<{ workspace_id: string | null; storage_provider_id: string | null }>
      const shareRows = (shareLinks.data || []) as Array<{ file_id: string }>
      const fileIdSet = new Set<string>(fileRows.map((row) => row.id))

      const brokenWorkspaceRefs =
        fileRows.filter((row) => row.workspace_id && !workspaceSet.has(row.workspace_id)).length
        + folderRows.filter((row) => row.workspace_id && !workspaceSet.has(row.workspace_id)).length

      const brokenProviderRefs =
        fileRows.filter((row) => row.storage_provider_id && !providerSet.has(row.storage_provider_id)).length
        + folderRows.filter((row) => row.storage_provider_id && !providerSet.has(row.storage_provider_id)).length

      const orphanShares = shareRows.filter((row) => !fileIdSet.has(row.file_id)).length
      const unsafePublicFiles = fileRows.filter((row) => row.is_public && !row.encrypted).length
      const maintenanceEnabled = Boolean((maintenanceRows.data || []).find((row: any) => row.is_enabled))

      const now = Date.now()
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
      const fileTrend = (fileTrendRows.data || []) as Array<{ created_at: string | null }>
      const userTrend = (userTrendRows.data || []) as Array<{ created_at: string | null }>

      const fileLast7 = fileTrend.filter((row) => {
        const parsed = safeDate(row.created_at)
        return parsed ? parsed.getTime() >= sevenDaysAgo : false
      }).length

      const filePrev7 = Math.max(fileTrend.length - fileLast7, 0)

      const userLast7 = userTrend.filter((row) => {
        const parsed = safeDate(row.created_at)
        return parsed ? parsed.getTime() >= sevenDaysAgo : false
      }).length

      const userPrev7 = Math.max(userTrend.length - userLast7, 0)

      const fileGrowthRate = filePrev7 === 0 ? (fileLast7 > 0 ? 100 : 0) : ((fileLast7 - filePrev7) / filePrev7) * 100
      const userGrowthRate = userPrev7 === 0 ? (userLast7 > 0 ? 100 : 0) : ((userLast7 - userPrev7) / userPrev7) * 100

      return jsonResponse({
        metrics: {
          users,
          workspaces,
          filesTotal,
          encryptedFiles,
          folders,
          shares,
          publicFiles,
          deletedFiles,
          providers,
          apiKeys,
          apiRequests24h,
          apiErrors24h,
          adminAccess24h,
          supportOpen,
          supportNotifications,
          repositories,
          audit24h,
          analytics24h,
          archiveJobs,
          maintenanceFlags,
        },
        recentUploads,
        recentAudit,
        topStorageUsers,
        integrityReport: {
          brokenWorkspaceRefs,
          brokenProviderRefs,
          orphanShares,
          unsafePublicFiles,
          maintenanceEnabled,
        },
        forecastReport: {
          next7DayFiles: Math.max(Math.round(fileLast7 + (fileLast7 - filePrev7) * 0.6), 0),
          next7DayUsers: Math.max(Math.round(userLast7 + (userLast7 - userPrev7) * 0.6), 0),
          fileGrowthRate,
          userGrowthRate,
        },
      })
    }

    if (action === 'kza_unban') {
      const banId = typeof requestBody?.banId === 'string' ? requestBody.banId : null
      const incident = requestBody?.incident as Record<string, any> | undefined
      const incidentUserId = incident?.attacker_profile?.user_id ?? incident?.user_id ?? null
      const incidentIp = incident?.network_intel?.ip ?? incident?.ip_address ?? null

      if (banId) {
        await supabase
          .from('kza_banned_entities')
          .update({ is_active: false, banned_until: new Date().toISOString() })
          .eq('id', banId)
      } else if (incidentUserId || incidentIp) {
        let query = supabase
          .from('kza_banned_entities')
          .update({ is_active: false, banned_until: new Date().toISOString() })
        if (incidentUserId) {
          query = query.eq('user_id', incidentUserId)
        }
        if (incidentIp) {
          query = query.eq('ip_address', incidentIp)
        }
        await query
      } else {
        return jsonResponse({ error: 'Missing ban identifier' }, 400)
      }

      return jsonResponse({ ok: true })
    }

    if (action === 'kza_extend_ban') {
      const banId = typeof requestBody?.banId === 'string' ? requestBody.banId : null
      const incident = requestBody?.incident as Record<string, any> | undefined
      const incidentUserId = incident?.attacker_profile?.user_id ?? incident?.user_id ?? null
      const incidentIp = incident?.network_intel?.ip ?? incident?.ip_address ?? null
      const hours = Number(requestBody?.hours ?? 24)
      const newExpiry = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

      if (banId) {
        await supabase
          .from('kza_banned_entities')
          .update({ is_active: true, ban_type: 'TEMP', banned_until: newExpiry })
          .eq('id', banId)
      } else if (incidentUserId || incidentIp) {
        let query = supabase
          .from('kza_banned_entities')
          .update({ is_active: true, ban_type: 'TEMP', banned_until: newExpiry })
        if (incidentUserId) {
          query = query.eq('user_id', incidentUserId)
        }
        if (incidentIp) {
          query = query.eq('ip_address', incidentIp)
        }
        await query
      } else {
        return jsonResponse({ error: 'Missing ban identifier' }, 400)
      }

      return jsonResponse({ ok: true })
    }

    if (action === 'kza_permanent_ban') {
      const banId = typeof requestBody?.banId === 'string' ? requestBody.banId : null
      const incident = requestBody?.incident as Record<string, any> | undefined
      const incidentUserId = incident?.attacker_profile?.user_id ?? incident?.user_id ?? null
      const incidentIp = incident?.network_intel?.ip ?? incident?.ip_address ?? null

      if (banId) {
        await supabase
          .from('kza_banned_entities')
          .update({ is_active: true, ban_type: 'PERMANENT', banned_until: null })
          .eq('id', banId)
      } else if (incidentUserId || incidentIp) {
        await supabase.from('kza_banned_entities').insert({
          user_id: incidentUserId,
          ip_address: incidentIp,
          ban_type: 'PERMANENT',
          ban_reason: 'Manual permanent ban',
          ban_tier: 'BLACK',
          attack_summary: 'Manual escalation',
          is_active: true,
        })
      } else {
        return jsonResponse({ error: 'Missing ban identifier' }, 400)
      }

      return jsonResponse({ ok: true })
    }

    if (action === 'kza_update_incident_status') {
      const incidentId = typeof requestBody?.incidentId === 'string' ? requestBody.incidentId : null
      const status = typeof requestBody?.status === 'string' ? requestBody.status : null

      if (!incidentId || !status) {
        return jsonResponse({ error: 'Missing incident status' }, 400)
      }

      await supabase
        .from('kza_admin_incidents')
        .update({
          status,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', incidentId)

      return jsonResponse({ ok: true })
    }

    if (action === 'table_explorer') {
      const tableName = String(requestBody.tableName || '')
      const page = toPositiveInt(requestBody.page, 1, 1, 5000)
      const pageSize = toPositiveInt(requestBody.pageSize, 15, 5, 100)

      if (!EXPLORER_TABLES.has(tableName)) {
        return jsonResponse({ error: 'Table is not allowed for explorer access' }, 400)
      }

      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      const orderColumn = TABLE_ORDER_COLUMNS[tableName] || 'created_at'

      const { count: totalRows, error: countError } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })

      if (countError) throw countError

      let rowQuery = supabase
        .from(tableName)
        .select('*')
        .range(from, to)

      let rowResult = await rowQuery.order(orderColumn, { ascending: false })

      if (rowResult.error) {
        rowResult = await supabase
          .from(tableName)
          .select('*')
          .range(from, to)
      }

      if (rowResult.error) throw rowResult.error

      const rows = (rowResult.data || []) as Record<string, unknown>[]
      const columns = rows.length
        ? Object.keys(rows[0]).map((name) => ({
            name,
            type: inferColumnType(rows, name),
          }))
        : []

      return jsonResponse({
        tableName,
        rows,
        columns,
        pagination: {
          page,
          pageSize,
          totalRows: totalRows || 0,
          totalPages: Math.max(1, Math.ceil((totalRows || 0) / pageSize)),
        },
      })
    }

    return jsonResponse({ error: 'Invalid action' }, 400)

  } catch (error) {
    console.error('Admin data access error:', error)
    const action = typeof requestBody?.action === 'string' ? requestBody.action : null

    if (action === 'global_logs') {
      const page = toPositiveInt((requestBody as any).page, 1, 1, 5000)
      const pageSize = toPositiveInt((requestBody as any).pageSize, 50, 10, 200)
      const windowHours = toPositiveInt((requestBody as any).windowHours, 24, 1, 24)
      const severity = typeof (requestBody as any).severity === 'string' ? (requestBody as any).severity : 'all'
      const sourceFilter = typeof (requestBody as any).sourceFilter === 'string' ? (requestBody as any).sourceFilter : 'all'
      const projectRef =
        getSecret('SP_PROJECT_REF', 'SUPABASE_PROJECT_REF')
        || parseProjectRefFromUrl(getSecret('SP_URL', 'SUPABASE_URL'))

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return jsonResponse(
        createEmptyGlobalLogsPayload(
          page,
          pageSize,
          sourceFilter,
          severity,
          windowHours,
          projectRef,
          errorMessage
        )
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: errorMessage }, 500)
  }
})
