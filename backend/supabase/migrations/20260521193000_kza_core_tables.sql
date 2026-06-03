-- KZA core tables with strict RLS (service_role only)

CREATE TABLE IF NOT EXISTS public.kza_threat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT,
  ip_address TEXT,
  threat_tier TEXT,
  threat_type TEXT,
  description TEXT,
  payload_snapshot JSONB,
  endpoint_hit TEXT,
  method TEXT,
  automated_action_taken TEXT,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.kza_threat_events
  ADD CONSTRAINT kza_threat_events_tier_check
  CHECK (threat_tier IS NULL OR threat_tier IN ('YELLOW', 'ORANGE', 'RED', 'BLACK'));

CREATE INDEX IF NOT EXISTS idx_kza_threat_events_user_id ON public.kza_threat_events (user_id);
CREATE INDEX IF NOT EXISTS idx_kza_threat_events_ip ON public.kza_threat_events (ip_address);
CREATE INDEX IF NOT EXISTS idx_kza_threat_events_created_at ON public.kza_threat_events (created_at);

CREATE TABLE IF NOT EXISTS public.kza_user_profiles (
  user_id UUID PRIMARY KEY,
  typical_endpoints TEXT[] DEFAULT '{}',
  typical_countries TEXT[] DEFAULT '{}',
  typical_devices JSONB DEFAULT '[]'::jsonb,
  avg_request_interval_ms INTEGER,
  typical_active_hours INT[] DEFAULT '{}',
  total_requests BIGINT DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  threat_score INTEGER DEFAULT 0,
  is_watchlisted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kza_banned_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  ip_address TEXT,
  ban_type TEXT,
  ban_reason TEXT,
  ban_tier TEXT,
  attack_summary TEXT,
  banned_until TIMESTAMPTZ,
  banned_by TEXT DEFAULT 'KZA_AUTO',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.kza_banned_entities
  ADD CONSTRAINT kza_banned_entities_type_check
  CHECK (ban_type IS NULL OR ban_type IN ('TEMP', 'PERMANENT'));

CREATE INDEX IF NOT EXISTS idx_kza_banned_entities_user_id ON public.kza_banned_entities (user_id);
CREATE INDEX IF NOT EXISTS idx_kza_banned_entities_ip ON public.kza_banned_entities (ip_address);

CREATE TABLE IF NOT EXISTS public.kza_honeypot_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trap_name TEXT,
  trap_type TEXT,
  user_id UUID,
  ip_address TEXT,
  request_details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.kza_honeypot_hits
  ADD CONSTRAINT kza_honeypot_hits_type_check
  CHECK (trap_type IS NULL OR trap_type IN (
    'GHOST_ENDPOINT',
    'CANARY_TOKEN',
    'HONEYPOT_FILE',
    'FAKE_CREDENTIALS',
    'INVISIBLE_FIELD'
  ));

CREATE TABLE IF NOT EXISTS public.kza_linked_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_user_id UUID,
  linked_user_id UUID,
  link_reason TEXT,
  confidence_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kza_admin_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_event_id UUID REFERENCES public.kza_threat_events(id) ON DELETE SET NULL,
  incident_title TEXT,
  threat_tier TEXT,
  attacker_profile JSONB,
  attack_timeline JSONB,
  what_was_targeted TEXT,
  potential_harm TEXT,
  techniques_used TEXT[],
  actions_taken TEXT[],
  linked_accounts JSONB,
  network_intel JSONB,
  status TEXT DEFAULT 'PENDING',
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.kza_admin_incidents
  ADD CONSTRAINT kza_admin_incidents_status_check
  CHECK (status IN ('PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE'));

CREATE TABLE IF NOT EXISTS public.kza_phantom_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name TEXT,
  asset_type TEXT,
  asset_value TEXT,
  is_active BOOLEAN DEFAULT true,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (asset_name, asset_type)
);

ALTER TABLE public.kza_phantom_assets
  ADD CONSTRAINT kza_phantom_assets_type_check
  CHECK (asset_type IS NULL OR asset_type IN (
    'GHOST_ENDPOINT',
    'CANARY_TOKEN',
    'HONEYPOT_FILE',
    'FAKE_CREDENTIALS',
    'INVISIBLE_FIELD'
  ));

ALTER TABLE public.kza_threat_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kza_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kza_banned_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kza_honeypot_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kza_linked_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kza_admin_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kza_phantom_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only access to kza_threat_events" ON public.kza_threat_events;
DROP POLICY IF EXISTS "Service role only access to kza_user_profiles" ON public.kza_user_profiles;
DROP POLICY IF EXISTS "Service role only access to kza_banned_entities" ON public.kza_banned_entities;
DROP POLICY IF EXISTS "Service role only access to kza_honeypot_hits" ON public.kza_honeypot_hits;
DROP POLICY IF EXISTS "Service role only access to kza_linked_accounts" ON public.kza_linked_accounts;
DROP POLICY IF EXISTS "Service role only access to kza_admin_incidents" ON public.kza_admin_incidents;
DROP POLICY IF EXISTS "Service role only access to kza_phantom_assets" ON public.kza_phantom_assets;

CREATE POLICY "Service role only access to kza_threat_events"
  ON public.kza_threat_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Service role only access to kza_user_profiles"
  ON public.kza_user_profiles
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Service role only access to kza_banned_entities"
  ON public.kza_banned_entities
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Service role only access to kza_honeypot_hits"
  ON public.kza_honeypot_hits
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Service role only access to kza_linked_accounts"
  ON public.kza_linked_accounts
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Service role only access to kza_admin_incidents"
  ON public.kza_admin_incidents
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Service role only access to kza_phantom_assets"
  ON public.kza_phantom_assets
  FOR ALL
  USING (false)
  WITH CHECK (false);

INSERT INTO public.kza_phantom_assets (asset_name, asset_type, asset_value)
VALUES
  ('/admin-old', 'GHOST_ENDPOINT', '/admin-old'),
  ('/admin-backup', 'GHOST_ENDPOINT', '/admin-backup'),
  ('/api/internal', 'GHOST_ENDPOINT', '/api/internal'),
  ('/api/v2/admin', 'GHOST_ENDPOINT', '/api/v2/admin'),
  ('/_admin', 'GHOST_ENDPOINT', '/_admin'),
  ('/debug', 'GHOST_ENDPOINT', '/debug'),
  ('/config.json', 'GHOST_ENDPOINT', '/config.json'),
  ('/.env', 'GHOST_ENDPOINT', '/.env'),
  ('/management', 'GHOST_ENDPOINT', '/management'),
  ('/wp-admin', 'GHOST_ENDPOINT', '/wp-admin'),
  ('/phpmyadmin', 'GHOST_ENDPOINT', '/phpmyadmin'),
  ('/api/users/export', 'GHOST_ENDPOINT', '/api/users/export'),
  ('/v1/admin', 'GHOST_ENDPOINT', '/v1/admin'),
  ('credentials.txt', 'HONEYPOT_FILE', 'credentials.txt'),
  ('admin-backup.pdf', 'HONEYPOT_FILE', 'admin-backup.pdf'),
  ('users-export.csv', 'HONEYPOT_FILE', 'users-export.csv'),
  ('database-dump.sql', 'HONEYPOT_FILE', 'database-dump.sql'),
  ('config-backup.json', 'HONEYPOT_FILE', 'config-backup.json'),
  ('secrets.env', 'HONEYPOT_FILE', 'secrets.env'),
  ('squidcloud_admin_backup', 'FAKE_CREDENTIALS', 'Sq!dCl0ud@dmin2024'),
  ('admin@squidcloud.app', 'FAKE_CREDENTIALS', 'SquidAdmin!2024')
ON CONFLICT DO NOTHING;

WITH canary_tokens AS (
  SELECT 'sqc_canary_' || encode(gen_random_bytes(16), 'hex') AS token
  FROM generate_series(1, 3)
)
INSERT INTO public.kza_phantom_assets (asset_name, asset_type, asset_value)
SELECT token, 'CANARY_TOKEN', token
FROM canary_tokens
ON CONFLICT DO NOTHING;
