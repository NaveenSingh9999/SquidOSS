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

const sendAdminEmail = async (adminEmail: string, subject: string, content: string) => {
  if (!adminEmail) return
  await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: adminEmail }] }],
      from: { email: 'kza@squidcloud.app', name: 'KZA Sentinel' },
      subject,
      content: [{ type: 'text/plain', value: content }],
    }),
  }).catch(() => null)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const ADMIN_EMAIL = Deno.env.get('KZA_ADMIN_EMAIL') ?? ''
  const PING_INTERVAL_MINUTES = Number(Deno.env.get('KZA_PING_INTERVAL_MINUTES') ?? 15)
  const KZA_ENABLED = (Deno.env.get('KZA_ENABLED') ?? 'true').toLowerCase() === 'true'

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'KZA verdict misconfigured' }, 500)
  }

  if (!KZA_ENABLED) {
    return jsonResponse({ ok: true, disabled: true })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const payload = await req.json().catch(() => ({} as Record<string, unknown>))
  const threatEventId = typeof payload.threat_event_id === 'string' ? payload.threat_event_id : null
  const threatTier = typeof payload.threat_tier === 'string' ? payload.threat_tier : null
  const coordinated = Boolean(payload.coordinated)
  const reminder = Boolean(payload.reminder)

  if (!threatEventId) {
    return jsonResponse({ error: 'Missing threat event id' }, 400)
  }

  const { data: threatEvent } = await supabase
    .from('kza_threat_events')
    .select('*')
    .eq('id', threatEventId)
    .maybeSingle()

  if (!threatEvent) {
    return jsonResponse({ error: 'Threat event not found' }, 404)
  }

  const userId = threatEvent.user_id
  const { data: userProfile } = userId
    ? await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    : { data: null }
  const { data: authUser } = userId ? await supabase.auth.admin.getUserById(userId) : { data: null }

  const { data: linkedAccounts } = userId
    ? await supabase
        .from('kza_linked_accounts')
        .select('linked_user_id,confidence_score')
        .eq('primary_user_id', userId)
    : { data: [] }

  const { data: timelineEvents } = await supabase
    .from('kza_threat_events')
    .select('created_at,threat_type,endpoint_hit,automated_action_taken')
    .or(userId ? `user_id.eq.${userId},ip_address.eq.${threatEvent.ip_address}` : `ip_address.eq.${threatEvent.ip_address}`)
    .order('created_at', { ascending: true })
    .limit(10)

  const incidentCard = {
    incident_title: `[${threatTier ?? threatEvent.threat_tier}] - ${threatEvent.threat_type} detected from ${threatEvent.ip_address}`,
    threat_tier: threatTier ?? threatEvent.threat_tier,
    attacker_profile: {
      user_id: userId,
      email: authUser?.user?.email ?? null,
      registration_date: authUser?.user?.created_at ?? null,
      member_since_days: authUser?.user?.created_at
        ? Math.floor((Date.now() - new Date(authUser.user.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      previous_flags: userProfile?.threat_score ?? 0,
      linked_accounts: linkedAccounts ?? [],
      inferred_skill_level: threatEvent.threat_type?.includes('PRIVILEGE') ? 'ADVANCED' : 'INTERMEDIATE',
    },
    attack_timeline: (timelineEvents ?? []).map((event) => ({
      timestamp: event.created_at,
      action: event.threat_type,
      endpoint: event.endpoint_hit,
      result: event.automated_action_taken ?? 'DETECTED',
    })),
    what_was_targeted: threatEvent.endpoint_hit ?? 'Unknown',
    potential_harm: 'Automated KZA incident created for security review.',
    techniques_used: threatEvent.threat_type ? threatEvent.threat_type.split(',') : [],
    actions_taken: threatEvent.automated_action_taken ? [threatEvent.automated_action_taken] : [],
    linked_accounts: linkedAccounts ?? [],
    network_intel: {
      ip: threatEvent.ip_address,
      country: threatEvent.payload_snapshot?.country ?? 'UNKNOWN',
      isp: null,
      is_vpn: false,
      is_tor: false,
      is_datacenter: false,
      ip_reputation_score: 0,
    },
  }

  const { data: existingIncident } = await supabase
    .from('kza_admin_incidents')
    .select('id,status')
    .eq('threat_event_id', threatEventId)
    .maybeSingle()

  if (existingIncident?.id) {
    await supabase
      .from('kza_admin_incidents')
      .update(incidentCard)
      .eq('id', existingIncident.id)
  } else {
    await supabase.from('kza_admin_incidents').insert({
      threat_event_id: threatEventId,
      ...incidentCard,
    })
  }

  const channel = supabase.channel('kza-incidents')
  await channel.send({
    type: 'broadcast',
    event: 'incident',
    payload: { ...incidentCard, id: existingIncident?.id ?? threatEventId },
  })
  await channel.unsubscribe()

  if ((threatTier ?? threatEvent.threat_tier) === 'BLACK' || coordinated) {
    await sendAdminEmail(
      ADMIN_EMAIL,
      `KZA ${threatTier ?? threatEvent.threat_tier} incident`,
      `Incident ${incidentCard.incident_title} from ${threatEvent.ip_address}.`
    )

    if (!reminder) {
      await supabase.from('kza_threat_events').insert({
        threat_tier: threatTier ?? threatEvent.threat_tier,
        threat_type: 'KZA_PING_SCHEDULED',
        description: 'Scheduled admin reminder ping',
        payload_snapshot: {
          incident_id: existingIncident?.id ?? threatEventId,
          next_ping_at: new Date(Date.now() + PING_INTERVAL_MINUTES * 60 * 1000).toISOString(),
        },
        endpoint_hit: 'KZA_VERDICT',
        method: 'PING',
        automated_action_taken: 'ADMIN_PING_SCHEDULED',
      })
    } else if (existingIncident?.status === 'PENDING') {
      await supabase.from('kza_threat_events').insert({
        threat_tier: threatTier ?? threatEvent.threat_tier,
        threat_type: 'KZA_PING_REMINDER',
        description: 'Reminder ping sent',
        payload_snapshot: { incident_id: existingIncident?.id ?? threatEventId },
        endpoint_hit: 'KZA_VERDICT',
        method: 'PING',
        automated_action_taken: 'ADMIN_PING_REMINDER',
      })
    }
  }

  return jsonResponse({ ok: true })
})
