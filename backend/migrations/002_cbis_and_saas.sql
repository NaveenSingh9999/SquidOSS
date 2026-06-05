-- SquidOSS Additions: CBIS keys, DB SaaS instances, user sessions
SET statement_timeout = 0;
SET search_path = 'public, auth';

-- CBIS Keys for admin auth
CREATE TABLE IF NOT EXISTS cbis_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    public_key text NOT NULL UNIQUE,
    key_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone,
    CONSTRAINT cbis_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cbis_keys_user_id ON cbis_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_cbis_keys_key_hash ON cbis_keys(key_hash);

-- DB SaaS instances
CREATE TABLE IF NOT EXISTS db_saas_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    port integer NOT NULL,
    status text DEFAULT 'booting'::text NOT NULL,
    db_name text NOT NULL,
    db_user text NOT NULL,
    db_password_encrypted text,
    created_at timestamp with time zone DEFAULT now(),
    last_active_at timestamp with time zone,
    connection_url text,
    CONSTRAINT db_saas_instances_status_check CHECK (status = ANY (ARRAY['booting'::text, 'running'::text, 'stopping'::text, 'stopped'::text, 'error'::text]))
);

CREATE INDEX IF NOT EXISTS idx_db_saas_instances_user_id ON db_saas_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_db_saas_instances_port ON db_saas_instances(port);

-- User sessions for live supervision
CREATE TABLE IF NOT EXISTS user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash text NOT NULL,
    ip_address text,
    user_agent text,
    current_route text,
    is_active boolean DEFAULT true,
    last_active_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);

-- FLS realtime channels
CREATE TABLE IF NOT EXISTS fls_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL UNIQUE,
    instance_id uuid REFERENCES db_saas_instances(id) ON DELETE CASCADE,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fls_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid REFERENCES fls_channels(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fls_events_channel ON fls_events(channel_id);

-- GitHub repos for storage
CREATE TABLE IF NOT EXISTS github_repos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    repo_name text NOT NULL,
    repo_full_name text NOT NULL,
    repo_url text NOT NULL,
    clone_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Edge functions
CREATE TABLE IF NOT EXISTS edge_functions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    runtime text DEFAULT 'nodejs18'::text,
    status text DEFAULT 'active'::text,
    version integer DEFAULT 1,
    timeout_seconds integer DEFAULT 30,
    memory_mb integer DEFAULT 256,
    source text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
