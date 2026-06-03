-- Migration: Add sharing analytics, audit logs, collections and helper RPCs
-- Date: 2025-11-01
-- Adds columns to shares, creates share_audit_logs, share_collections,
-- share_collection_files, and helper functions to log events and bump counters.

BEGIN;

-- 1) First ensure share_id column exists (from 20250914 migration dependency)
ALTER TABLE IF EXISTS shares
  ADD COLUMN IF NOT EXISTS share_id text;

-- Add index for fast lookups by share_id if not exists
CREATE INDEX IF NOT EXISTS shares_share_id_idx ON shares(share_id);

-- 2) Add new columns to shares table for analytics and controls
-- Note: Some of these may already exist from table creation, using IF NOT EXISTS
ALTER TABLE IF EXISTS shares
  ADD COLUMN IF NOT EXISTS share_views integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS download_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS download_limit integer,
  ADD COLUMN IF NOT EXISTS view_only boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_ips text[],
  ADD COLUMN IF NOT EXISTS custom_message text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- 3) Ensure share_id column has unique constraint (required for foreign key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'shares_share_id_unique'
  ) THEN
    ALTER TABLE shares ADD CONSTRAINT shares_share_id_unique UNIQUE (share_id);
  END IF;
END $$;

-- 4) Create audit log table for shares
CREATE TABLE IF NOT EXISTS share_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id text NOT NULL,
  event_type text NOT NULL,
  ip_address inet,
  user_agent text,
  geo_country text,
  geo_city text,
  referrer text,
  success boolean DEFAULT true,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraint after table creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'share_audit_logs_share_id_fkey'
  ) THEN
    ALTER TABLE share_audit_logs 
    ADD CONSTRAINT share_audit_logs_share_id_fkey 
    FOREIGN KEY (share_id) 
    REFERENCES shares(share_id) 
    ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_share_audit_share_id ON share_audit_logs(share_id);
CREATE INDEX IF NOT EXISTS idx_share_audit_created_at ON share_audit_logs(created_at DESC);

-- 5) Create share collections to support multi-file shares
CREATE TABLE IF NOT EXISTS share_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id text UNIQUE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_name text NOT NULL,
  description text,
  access_code text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS share_collection_files (
  collection_id uuid REFERENCES share_collections(id) ON DELETE CASCADE,
  file_id uuid REFERENCES files(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (collection_id, file_id)
);

-- 6) Helper RPC: log_share_event
-- Inserts an audit record. SECURITY DEFINER so edge functions can call it.
CREATE OR REPLACE FUNCTION public.log_share_event(
  p_share_id text,
  p_event_type text,
  p_ip inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_geo_country text DEFAULT NULL,
  p_geo_city text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_success boolean DEFAULT true,
  p_error_message text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO share_audit_logs(
    share_id, event_type, ip_address, user_agent, geo_country, geo_city, referrer, success, error_message
  ) VALUES (
    p_share_id, p_event_type, p_ip, p_user_agent, p_geo_country, p_geo_city, p_referrer, p_success, p_error_message
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.log_share_event(text,text,inet,text,text,text,text,boolean,text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_share_event(text,text,inet,text,text,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_share_event(text,text,inet,text,text,text,text,boolean,text) TO anon;

-- 7) Helper RPCs: increment counters
CREATE OR REPLACE FUNCTION public.increment_share_view(p_share_id text) RETURNS void AS $$
BEGIN
  UPDATE shares SET share_views = COALESCE(share_views, 0) + 1 WHERE share_id = p_share_id;
  PERFORM public.log_share_event(p_share_id, 'view');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_share_download(p_share_id text) RETURNS void AS $$
BEGIN
  UPDATE shares SET download_count = COALESCE(download_count, 0) + 1 WHERE share_id = p_share_id;
  PERFORM public.log_share_event(p_share_id, 'download');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_share_view(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.increment_share_download(text) TO authenticated, anon;

COMMIT;
