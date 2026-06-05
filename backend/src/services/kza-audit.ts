import { sql } from '../db/index.js'

export interface KzaAuditResult {
  passed: boolean
  warnings: KzaWarning[]
  threatLevel: 'none' | 'yellow' | 'orange' | 'red' | 'black'
}

export interface KzaWarning {
  type: 'threat_event' | 'banned_entity' | 'anomaly'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  sourceId?: string
}

export async function kzaAuditUser(userId: string, context?: string): Promise<KzaAuditResult> {
  const warnings: KzaWarning[] = []
  let maxSeverity: string = 'none'

  const recentThreats = await sql`
    SELECT id, threat_tier, threat_type, description, created_at
    FROM kza_threat_events
    WHERE user_id = ${userId} AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC LIMIT 10
  `

  for (const t of recentThreats) {
    const tAny = t as any
    const sev = threatTierToSeverity(tAny.threat_tier || 'YELLOW')
    warnings.push({
      type: 'threat_event',
      severity: sev,
      message: `${tAny.threat_type || 'Suspicious activity'}: ${(tAny.description || '').slice(0, 100)}`,
      sourceId: tAny.id,
    })
    if (sevPriority(sev) > sevPriority(maxSeverity as any)) maxSeverity = sev
  }

  const bans = await sql`
    SELECT id, ban_type, ban_reason, banned_until
    FROM kza_banned_entities
    WHERE user_id = ${userId} AND is_active = true
      AND (banned_until IS NULL OR banned_until > NOW())
    LIMIT 5
  `

  for (const b of bans) {
    const bAny = b as any
    warnings.push({
      type: 'banned_entity',
      severity: 'high',
      message: `Active restriction: ${bAny.ban_reason || 'Banned entity'}${bAny.banned_until ? ` until ${new Date(bAny.banned_until).toLocaleString()}` : ''}`,
      sourceId: bAny.id,
    })
    if (sevPriority('high') > sevPriority(maxSeverity as any)) maxSeverity = 'high'
  }

  const result: KzaAuditResult = {
    passed: maxSeverity !== 'critical' && maxSeverity !== 'red',
    warnings,
    threatLevel: maxSeverity as any || 'none',
  }

  if (warnings.length > 0 && context) {
    await sql`
      INSERT INTO kza_admin_incidents (incident_title, threat_tier, status, created_at)
      VALUES (${`KZA audit: ${context}`}, ${maxSeverity.toUpperCase()}, 'PENDING', NOW())
    `
  }

  return result
}

function threatTierToSeverity(tier: string): 'low' | 'medium' | 'high' | 'critical' {
  switch (tier.toUpperCase()) {
    case 'YELLOW': return 'low'
    case 'ORANGE': return 'medium'
    case 'RED': return 'high'
    case 'BLACK': return 'critical'
    default: return 'low'
  }
}

function sevPriority(s: string): number {
  switch (s) {
    case 'critical': return 5
    case 'high': return 4
    case 'medium': return 3
    case 'low': return 2
    default: return 1
  }
}
