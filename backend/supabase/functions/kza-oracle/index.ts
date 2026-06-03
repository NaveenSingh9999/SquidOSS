import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const inferSkillLevel = (techniques: string[]) => {
  const joined = techniques.join(',').toLowerCase()
  if (joined.includes('privilege') || joined.includes('sql') || joined.includes('token')) {
    return 'ADVANCED'
  }
  if (joined.includes('traversal') || joined.includes('enumeration') || joined.includes('recon')) {
    return 'INTERMEDIATE'
  }
  return 'SCRIPT_KIDDIE'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const KZA_ORACLE_ENABLED = (Deno.env.get('KZA_ORACLE_ENABLED') ?? 'true').toLowerCase() === 'true'
  const ORANGE_THRESHOLD = Number(Deno.env.get('KZA_ORANGE_THRESHOLD') ?? 40)
  const RED_THRESHOLD = Number(Deno.env.get('KZA_RED_THRESHOLD') ?? 70)

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'KZA oracle misconfigured' }, 500)
  }

  if (!KZA_ORACLE_ENABLED) {
    return jsonResponse({ ok: true, disabled: true })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const payload = await req.json().catch(() => ({} as Record<string, unknown>))
  const threatEventId = typeof payload.threat_event_id === 'string' ? payload.threat_event_id : null
  const userId = typeof payload.user_id === 'string' ? payload.user_id : null
  const ipAddress = typeof payload.ip_address === 'string' ? payload.ip_address : null
  const userAgent = typeof payload.user_agent === 'string' ? payload.user_agent : null
  const threatTier = typeof payload.threat_tier === 'string' ? payload.threat_tier : null
  const threatType = typeof payload.threat_type === 'string' ? payload.threat_type : null

  if (!threatEventId || !ipAddress) {
    return jsonResponse({ error: 'Missing threat context' }, 400)
  }

  const now = new Date()
  const since30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const since30Minutes = new Date(now.getTime() - 30 * 60 * 1000).toISOString()

  const { data: recentEvents } = await supabase
    .from('kza_threat_events')
    .select('id,user_id,ip_address,endpoint_hit,created_at,payload_snapshot,threat_type')
    .gte('created_at', since30Days)
    .or(`ip_address.eq.${ipAddress}`)

  const linkedUsers = new Set<string>()
  const linkDetails: { linked_user_id: string; reason: string; score: number }[] = []
  for (const event of recentEvents ?? []) {
    if (!event.user_id || event.user_id === userId) continue
    let score = 0
    const reasons: string[] = []
    if (event.ip_address === ipAddress) {
      score += 40
      reasons.push('IP_MATCH')
    }
    const eventUa = event.payload_snapshot?.headers?.user_agent
    if (userAgent && eventUa && eventUa === userAgent) {
      score += 30
      reasons.push('UA_MATCH')
    }
    if (score > 0) {
      linkedUsers.add(event.user_id)
      linkDetails.push({ linked_user_id: event.user_id, reason: reasons.join(','), score })
    }
  }

  for (const link of linkDetails) {
    await supabase.from('kza_linked_accounts').insert({
      primary_user_id: userId,
      linked_user_id: link.linked_user_id,
      link_reason: link.reason,
      confidence_score: link.score,
    })

    await supabase
      .from('kza_user_profiles')
      .update({
        is_watchlisted: true,
        threat_score: Math.max(ORANGE_THRESHOLD, link.score),
      })
      .eq('user_id', link.linked_user_id)
  }

  if (threatType) {
    const { data: campaignEvents } = await supabase
      .from('kza_threat_events')
      .select('user_id,ip_address')
      .eq('threat_type', threatType)
      .gte('created_at', since30Minutes)

    const campaignUsers = new Set<string>()
    const campaignIps = new Set<string>()
    for (const event of campaignEvents ?? []) {
      if (event.user_id) campaignUsers.add(event.user_id)
      if (event.ip_address) campaignIps.add(event.ip_address)
    }

    if (campaignUsers.size + campaignIps.size >= 3) {
      const { data: campaignThreat } = await supabase
        .from('kza_threat_events')
        .insert({
          threat_tier: 'RED',
          threat_type: 'COORDINATED_ATTACK',
          description: 'Coordinated attack detected across multiple accounts/IPs',
          payload_snapshot: { threat_type: threatType, users: [...campaignUsers], ips: [...campaignIps] },
          endpoint_hit: 'MULTIPLE',
          method: 'MULTIPLE',
        })
        .select('id')
        .maybeSingle()

      if (campaignThreat?.id) {
        await supabase.from('kza_admin_incidents').insert({
          threat_event_id: campaignThreat.id,
          incident_title: 'COORDINATED ATTACK DETECTED',
          threat_tier: 'RED',
          attacker_profile: { accounts: [...campaignUsers], ips: [...campaignIps] },
          attack_timeline: [],
          what_was_targeted: 'Multiple endpoints',
          potential_harm: 'Coordinated campaign detected.',
          techniques_used: [threatType],
          actions_taken: ['ORACLE_ESCALATION'],
          linked_accounts: [...campaignUsers],
          network_intel: { ips: [...campaignIps] },
        })

        await fetch(`${SUPABASE_URL}/functions/v1/kza-verdict`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            threat_event_id: campaignThreat.id,
            threat_tier: 'RED',
            coordinated: true,
          }),
        }).catch(() => null)
      }

      if (campaignUsers.size) {
        await supabase
          .from('kza_user_profiles')
          .update({ threat_score: RED_THRESHOLD, is_watchlisted: true })
          .in('user_id', [...campaignUsers])
      }
    }
  }

  if (threatTier === 'BLACK') {
    const techniques = (recentEvents ?? [])
      .filter((event) => event.user_id === userId || event.ip_address === ipAddress)
      .map((event) => event.threat_type)
      .filter((value) => typeof value === 'string') as string[]

    const firstSeen = (recentEvents ?? [])
      .filter((event) => event.user_id === userId || event.ip_address === ipAddress)
      .map((event) => new Date(event.created_at))
      .sort((a, b) => a.getTime() - b.getTime())[0]

    const endpoints = new Set<string>()
    for (const event of recentEvents ?? []) {
      if (event.endpoint_hit) endpoints.add(event.endpoint_hit)
    }

    await supabase
      .from('kza_admin_incidents')
      .update({
        attacker_profile: {
          accounts: [...linkedUsers, ...(userId ? [userId] : [])],
          ips: [...new Set([ipAddress, ...(recentEvents ?? []).map((event) => event.ip_address).filter(Boolean)])],
          techniques_attempted: techniques,
          inferred_skill_level: inferSkillLevel(techniques),
          first_seen: firstSeen?.toISOString() ?? null,
          total_requests: recentEvents?.length ?? 0,
          endpoints_probed: [...endpoints],
        },
      })
      .eq('threat_event_id', threatEventId)
  }

  return jsonResponse({ ok: true })
})
