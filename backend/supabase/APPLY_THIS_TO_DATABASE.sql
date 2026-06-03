-- =====================================================
-- COMBINED SHARING SYSTEM MIGRATION
-- Run this entire script in your Supabase SQL Editor
-- =====================================================

-- Part 1: Base sharing functions (from 20250914)
-- =====================================================

-- First, let's add a unique share_id column that will be used in URLs
ALTER TABLE shares ADD COLUMN IF NOT EXISTS share_id text;

-- Add an index for fast lookups by share_id
CREATE INDEX IF NOT EXISTS shares_share_id_idx ON shares(share_id);

-- Update the RLS policies for shares table to allow public access for valid shares
DROP POLICY IF EXISTS "Enable read access for users based on user_id" ON shares;
DROP POLICY IF EXISTS "Users can read their own shares" ON shares;
DROP POLICY IF EXISTS "Users can create their own shares" ON shares;
DROP POLICY IF EXISTS "Users can update their own shares" ON shares;
DROP POLICY IF EXISTS "Users can delete their own shares" ON shares;

-- Allow users to read their own shares
CREATE POLICY "Users can read their own shares" ON shares
  FOR SELECT USING (auth.uid() = user_id);

-- Allow users to insert their own shares
CREATE POLICY "Users can create their own shares" ON shares
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own shares
CREATE POLICY "Users can update their own shares" ON shares
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow users to delete their own shares
CREATE POLICY "Users can delete their own shares" ON shares
  FOR DELETE USING (auth.uid() = user_id);

-- Create a function to generate unique share IDs
CREATE OR REPLACE FUNCTION generate_share_id()
RETURNS TEXT AS $$
BEGIN
  -- Generate a random 12-character alphanumeric string
  RETURN encode(gen_random_bytes(9), 'base64')::text;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get shared file information (public access)
CREATE OR REPLACE FUNCTION get_shared_file_info(share_id_param text)
RETURNS TABLE(
  file_id uuid,
  file_name text,
  file_type text,
  file_size bigint,
  file_created_at timestamptz,
  file_updated_at timestamptz,
  is_encrypted boolean,
  storage_path text,
  encryption_key text,
  owner_id uuid,
  share_created_at timestamptz,
  share_expires_at timestamptz
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.id::uuid,
    f.name,
    f.type,
    f.size,
    f.created_at,
    f.updated_at,
    f.encrypted,
    f.storage_path,
    f.encryption_key,
    f.user_id::uuid,
    s.created_at,
    s.expires_at
  FROM shares s
  JOIN files f ON s.file_id = f.id
  WHERE s.share_id = share_id_param
    AND (s.expires_at IS NULL OR s.expires_at > NOW());
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the function to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION get_shared_file_info(text) TO authenticated, anon;

-- Create a function to create a new share
CREATE OR REPLACE FUNCTION create_file_share(file_id_param uuid)
RETURNS TABLE(share_id text)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_share_id text;
  current_user_id uuid;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Check if user owns the file
  IF NOT EXISTS (
    SELECT 1 FROM files 
    WHERE id = file_id_param AND user_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'File not found or access denied';
  END IF;
  
  -- Check if share already exists
  IF EXISTS (
    SELECT 1 FROM shares 
    WHERE file_id = file_id_param AND user_id = current_user_id
  ) THEN
    -- Return existing share_id
    SELECT s.share_id INTO new_share_id
    FROM shares s
    WHERE s.file_id = file_id_param AND s.user_id = current_user_id;
    
    RETURN QUERY SELECT new_share_id;
    RETURN;
  END IF;
  
  -- Generate unique share_id
  LOOP
    new_share_id := generate_share_id();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM shares WHERE shares.share_id = new_share_id);
  END LOOP;
  
  -- Create the share
  INSERT INTO shares (user_id, file_id, share_id, access_code, created_at)
  VALUES (current_user_id, file_id_param, new_share_id, new_share_id, NOW());
  
  RETURN QUERY SELECT new_share_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION create_file_share(uuid) TO authenticated;

-- Create a function to revoke a share
CREATE OR REPLACE FUNCTION revoke_file_share(file_id_param uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  deleted_count integer;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Delete the share if it exists and user owns it
  DELETE FROM shares 
  WHERE file_id = file_id_param 
    AND user_id = current_user_id;
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION revoke_file_share(uuid) TO authenticated;

-- Create a function to check if a file has an active share
CREATE OR REPLACE FUNCTION get_file_share_id(file_id_param uuid)
RETURNS text
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_share_id text;
  current_user_id uuid;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get the share_id if it exists
  SELECT share_id INTO result_share_id
  FROM shares 
  WHERE file_id = file_id_param 
    AND user_id = current_user_id
    AND (expires_at IS NULL OR expires_at > NOW());
  
  RETURN result_share_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION get_file_share_id(uuid) TO authenticated;


-- Part 2: Analytics and advanced features (from 20251101140001)
-- =====================================================

-- Add new columns to shares table for analytics and controls
-- Note: Some may already exist from table creation
ALTER TABLE shares
  ADD COLUMN IF NOT EXISTS share_views integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS download_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS download_limit integer,
  ADD COLUMN IF NOT EXISTS view_only boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_ips text[],
  ADD COLUMN IF NOT EXISTS custom_message text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Ensure share_id column has unique constraint (required for foreign key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'shares_share_id_unique'
  ) THEN
    ALTER TABLE shares ADD CONSTRAINT shares_share_id_unique UNIQUE (share_id);
  END IF;
END $$;

-- Create audit log table for shares
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

-- Create share collections to support multi-file shares
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

-- Helper RPC: log_share_event
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

-- Helper RPCs: increment counters
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

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
