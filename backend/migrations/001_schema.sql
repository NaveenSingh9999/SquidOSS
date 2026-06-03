-- SquidOSS Database Schema v1.0
-- Exact replica of live Supabase project schema (2026-06-03)
-- Includes auth.users for self-hosted compatibility

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public, auth, extensions', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS extensions;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS auth;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

-- ============================================================
-- AUTH SCHEMA (replaces Supabase Auth)
-- ============================================================

CREATE TABLE IF NOT EXISTS auth.users (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    email text NOT NULL,
    encrypted_password text NOT NULL,
    role text DEFAULT 'user'::text,
    is_restricted boolean DEFAULT false,
    banned_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE auth.users ADD PRIMARY KEY (id);
ALTER TABLE auth.users ADD CONSTRAINT users_email_key UNIQUE (email);

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: workspace_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_role AS ENUM (
    'viewer',
    'editor',
    'admin',
    'owner'
);


--
-- Name: accept_workspace_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_workspace_invite(p_token text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_hash TEXT;
  v_invite RECORD;
  v_email TEXT;
  v_member_limit INTEGER;
  v_member_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_invite
  FROM public.workspace_invites
  WHERE token_hash = v_hash
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
  FOR UPDATE;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite token';
  END IF;

  v_email := lower(trim(auth.email()));
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email not available from auth';
  END IF;
  IF v_invite.invitee_email <> v_email THEN
    RAISE EXCEPTION 'Invite is for a different email address';
  END IF;

  SELECT member_limit INTO v_member_limit
  FROM public.workspaces
  WHERE id = v_invite.workspace_id;

  IF v_member_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_member_count
    FROM public.workspace_members
    WHERE workspace_id = v_invite.workspace_id;

    IF v_member_count >= v_member_limit THEN
      RAISE EXCEPTION 'Workspace member limit reached';
    END IF;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_invite.workspace_id, auth.uid(), v_invite.role);

  UPDATE public.workspace_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invite.id;

  RETURN v_invite.workspace_id;
END;
$$;


--
-- Name: add_file_to_collection(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_file_to_collection(collection_id_param uuid, file_id_param uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Verify collection belongs to user
  IF NOT EXISTS (
    SELECT 1 FROM collections 
    WHERE id = collection_id_param AND user_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'Collection not found or access denied';
  END IF;
  
  -- Verify file belongs to user
  IF NOT EXISTS (
    SELECT 1 FROM files 
    WHERE id = file_id_param AND user_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'File not found or access denied';
  END IF;
  
  -- Add file to collection (ignore if already exists)
  INSERT INTO collections_files (user_id, collection_id, file_id)
  VALUES (current_user_id, collection_id_param, file_id_param)
  ON CONFLICT (user_id, collection_id, file_id) DO NOTHING;
  
  RETURN TRUE;
END;
$$;


--
-- Name: assert_pin_authorized_operation(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_pin_authorized_operation(operation_type text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_user_id UUID := auth.uid();
  required_auth BOOLEAN := FALSE;
  consumed_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT public.requires_pin_auth(current_user_id, operation_type) INTO required_auth;

  IF COALESCE(required_auth, TRUE) = FALSE THEN
    RETURN TRUE;
  END IF;

  SELECT id INTO consumed_id
  FROM public.pin_operation_authorizations
  WHERE user_id = current_user_id
    AND operation_type = assert_pin_authorized_operation.operation_type
    AND authorized_until > NOW()
  ORDER BY authorized_until DESC
  LIMIT 1;

  IF consumed_id IS NULL THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.pin_operation_authorizations WHERE id = consumed_id;
  RETURN TRUE;
END;
$$;


--
-- Name: assign_workspace_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_workspace_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  IF NEW.workspace_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.workspace_id := public.get_or_create_default_workspace(NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: cleanup_expired_pdf_urls(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_pdf_urls() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    DELETE FROM pdf_secure_urls 
    WHERE expires_at < now();
END;
$$;


--
-- Name: cleanup_old_processing_jobs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_processing_jobs(days_to_keep integer DEFAULT 30) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM video_processing_queue 
    WHERE status IN ('completed', 'failed', 'cancelled')
      AND completed_at < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Also clean up old transcode jobs
    DELETE FROM transcode_jobs
    WHERE status IN ('completed', 'failed')
      AND completed_at < NOW() - INTERVAL '1 day' * days_to_keep;
    
    RETURN deleted_count;
END;
$$;


--
-- Name: cleanup_old_video_logs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_video_logs(days_to_keep integer DEFAULT 90) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Clean up old playback logs
    DELETE FROM media_playback_logs 
    WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up old quality metrics
    DELETE FROM video_quality_metrics 
    WHERE timestamp < NOW() - INTERVAL '1 day' * days_to_keep;
    
    -- Clean up old stream sessions
    DELETE FROM video_stream_sessions 
    WHERE created_at < NOW() - INTERVAL '1 day' * days_to_keep;
    
    RETURN deleted_count;
END;
$$;


--
-- Name: cleanup_trashed_files(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_trashed_files() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    DELETE FROM public.files 
    WHERE is_deleted = true 
    AND deleted_at < NOW() - INTERVAL '30 days';
END;
$$;


--
-- Name: complete_processing_job(uuid, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_processing_job(p_job_id uuid, p_status character varying, p_error_message text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    UPDATE video_processing_queue
    SET status = p_status,
        completed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE NULL END,
        error_message = p_error_message,
        updated_at = NOW()
    WHERE id = p_job_id;
END;
$$;


--
-- Name: create_collection(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_collection(collection_name text, collection_color text DEFAULT NULL::text, collection_icon text DEFAULT NULL::text, collection_description text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_collection_id UUID;
  current_user_id UUID;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Validate input
  IF collection_name IS NULL OR LENGTH(TRIM(collection_name)) = 0 THEN
    RAISE EXCEPTION 'Collection name is required';
  END IF;
  
  IF LENGTH(collection_name) > 100 THEN
    RAISE EXCEPTION 'Collection name cannot exceed 100 characters';
  END IF;
  
  -- Check for duplicate collection name
  IF EXISTS (
    SELECT 1 FROM collections 
    WHERE user_id = current_user_id AND LOWER(name) = LOWER(TRIM(collection_name))
  ) THEN
    RAISE EXCEPTION 'Collection with this name already exists';
  END IF;
  
  -- Create the collection
  INSERT INTO collections (user_id, name, color, icon, description)
  VALUES (current_user_id, TRIM(collection_name), collection_color, collection_icon, collection_description)
  RETURNING id INTO new_collection_id;
  
  RETURN new_collection_id;
END;
$$;


--
-- Name: create_default_workspace_for_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_workspace_for_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.get_or_create_default_workspace(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: create_file_record(text, text, bigint, text, uuid, boolean, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_file_record(p_name text, p_type text, p_size bigint, p_storage_path text, p_user_id uuid, p_encrypted boolean DEFAULT false, p_encryption_key text DEFAULT NULL::text, p_metadata text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
DECLARE
  result_id UUID;
  result_record JSON;
BEGIN
  -- Generate new UUID
  result_id := gen_random_uuid();
  
  -- Insert basic file record
  INSERT INTO files (
    id, 
    name, 
    type, 
    size, 
    storage_path, 
    user_id, 
    encrypted, 
    encryption_key,
    created_at, 
    updated_at
  ) VALUES (
    result_id,
    p_name,
    p_type,
    p_size,
    p_storage_path,
    p_user_id,
    COALESCE(p_encrypted, false),
    p_encryption_key,
    NOW(),
    NOW()
  );
  
  -- Update with metadata if provided
  IF p_metadata IS NOT NULL THEN
    UPDATE files 
    SET tags = ARRAY[p_metadata]
    WHERE id = result_id;
  END IF;
  
  -- Return the created record
  SELECT json_build_object(
    'id', id,
    'name', name,
    'type', type,
    'size', size,
    'user_id', user_id,
    'created_at', created_at
  ) INTO result_record
  FROM files 
  WHERE id = result_id;
  
  RETURN result_record;
END;
$$;


--
-- Name: create_file_record(text, text, bigint, text, uuid, boolean, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_file_record(p_name text, p_type text, p_size bigint, p_storage_path text, p_user_id uuid, p_encrypted boolean DEFAULT false, p_encryption_key text DEFAULT NULL::text, p_metadata text DEFAULT NULL::text, p_workspace_id uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_workspace_id UUID;
  v_file public.files%ROWTYPE;
  v_is_service_role BOOLEAN;
BEGIN
  v_workspace_id := COALESCE(
    p_workspace_id,
    public.get_or_create_default_workspace(p_user_id)
  );

  v_is_service_role := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';

  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

    IF NOT public.has_workspace_role(v_workspace_id, p_user_id, 'editor') THEN
      RAISE EXCEPTION 'Insufficient workspace role';
    END IF;
  END IF;

  INSERT INTO public.files (
    name,
    type,
    size,
    storage_path,
    user_id,
    encrypted,
    shared,
    encryption_key,
    tags,
    workspace_id
  )
  VALUES (
    p_name,
    p_type,
    p_size,
    p_storage_path,
    p_user_id,
    p_encrypted,
    false,
    p_encryption_key,
    CASE WHEN p_metadata IS NULL THEN NULL ELSE ARRAY[p_metadata]::TEXT[] END,
    v_workspace_id
  )
  RETURNING * INTO v_file;

  RETURN to_json(v_file);
END;
$$;


--
-- Name: create_file_request(uuid, text, text, text, integer, bigint, text[], timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_file_request(p_user_id uuid, p_title text, p_description text DEFAULT ''::text, p_folder_path text DEFAULT ''::text, p_max_files integer DEFAULT 0, p_max_size_per_file bigint DEFAULT 0, p_allowed_types text[] DEFAULT NULL::text[], p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
DECLARE
  v_slug text;
  result jsonb;
BEGIN
  v_slug := lower(
             regexp_replace(
               regexp_replace(p_title, '[^a-zA-Z0-9]+', '-', 'g'),
               '^-+|-+$',
               '',
               'g'
             )
           ) || '-' || substr(md5(random()::text), 1, 6);

  INSERT INTO public.file_requests AS fr (
    user_id,
    title,
    description,
    folder_path,
    slug,
    max_files,
    max_size_per_file,
    allowed_types,
    expires_at
  ) VALUES (
    p_user_id,
    p_title,
    p_description,
    p_folder_path,
    v_slug,
    p_max_files,
    p_max_size_per_file,
    p_allowed_types,
    p_expires_at
  )
  RETURNING jsonb_build_object(
    'id', fr.id,
    'slug', fr.slug,
    'title', fr.title,
    'folder_path', fr.folder_path,
    'created_at', fr.created_at
  ) INTO result;

  RETURN result;
END;
$_$;


--
-- Name: create_file_share(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_file_share(file_id_param uuid) RETURNS TABLE(share_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
$$;


--
-- Name: create_workspace_invite(uuid, text, public.workspace_role, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_workspace_invite(p_workspace_id uuid, p_invitee_email text, p_role public.workspace_role DEFAULT 'viewer'::public.workspace_role, p_expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval)) RETURNS TABLE(invite_id uuid, invite_token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_token TEXT;
  v_hash TEXT;
  v_invitee_email TEXT;
BEGIN
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot invite with owner role';
  END IF;

  IF NOT public.has_workspace_role(p_workspace_id, auth.uid(), 'admin')
     AND NOT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_invitee_email := lower(trim(p_invitee_email));
  v_token := encode(gen_random_bytes(24), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.workspace_invites (
    workspace_id,
    invitee_email,
    invited_by,
    role,
    token_hash,
    expires_at
  ) VALUES (
    p_workspace_id,
    v_invitee_email,
    auth.uid(),
    p_role,
    v_hash,
    p_expires_at
  )
  RETURNING id INTO invite_id;

  invite_token := v_token;
  RETURN NEXT;
END;
$$;


--
-- Name: create_workspace_owner_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_workspace_owner_member() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, joined_at)
  VALUES (NEW.id, NEW.user_id, 'owner', NEW.user_id, NEW.created_at)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: decrypt_keyring_secret(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrypt_keyring_secret(p_key_name text, p_ciphertext text, p_nonce text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_key_id UUID;
  v_plain  BYTEA;
BEGIN
  SELECT key_id INTO v_key_id FROM public.security_keyring WHERE name = p_key_name;
  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Missing keyring entry for %', p_key_name;
  END IF;

  v_plain := pgsodium.crypto_secretbox_open(
    decode(p_ciphertext, 'base64'),
    decode(p_nonce, 'base64'),
    v_key_id
  );

  RETURN convert_from(v_plain, 'utf8');
END;
$$;


--
-- Name: delete_file_secure(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_file_secure(file_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_user_id UUID := auth.uid();
  is_authorized BOOLEAN := FALSE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT public.assert_pin_authorized_operation('delete_files') INTO is_authorized;
  IF COALESCE(is_authorized, FALSE) = FALSE THEN
    RAISE EXCEPTION 'PIN authentication required';
  END IF;

  DELETE FROM public.files
  WHERE id = file_uuid
    AND user_id = current_user_id;

  RETURN FOUND;
END;
$$;


--
-- Name: delete_folder_secure(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_folder_secure(folder_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_user_id UUID := auth.uid();
  is_authorized BOOLEAN := FALSE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT public.assert_pin_authorized_operation('delete_files') INTO is_authorized;
  IF COALESCE(is_authorized, FALSE) = FALSE THEN
    RAISE EXCEPTION 'PIN authentication required';
  END IF;

  DELETE FROM public.files
  WHERE parent_folder = folder_uuid::text
    AND user_id = current_user_id;

  DELETE FROM public.folders
  WHERE id = folder_uuid
    AND user_id = current_user_id;

  RETURN FOUND;
END;
$$;


--
-- Name: encrypt_keyring_secret(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encrypt_keyring_secret(p_key_name text, p_plaintext text) RETURNS TABLE(ciphertext text, nonce text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_key_id UUID;
  v_nonce  BYTEA := gen_random_bytes(24);
BEGIN
  SELECT key_id INTO v_key_id FROM public.security_keyring WHERE name = p_key_name;
  IF v_key_id IS NULL THEN
    RAISE EXCEPTION 'Missing keyring entry for %', p_key_name;
  END IF;

  RETURN QUERY
  SELECT
    encode(
      pgsodium.crypto_secretbox(convert_to(p_plaintext, 'utf8'), v_nonce, v_key_id),
      'base64'
    ),
    encode(v_nonce, 'base64');
END;
$$;


--
-- Name: exec_sql(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.exec_sql(sql text, params jsonb DEFAULT '[]'::jsonb) RETURNS json[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
DECLARE
  result JSON[];
  query_text TEXT;
BEGIN
  -- Only allow INSERT, UPDATE, SELECT on files table for security
  IF NOT (sql ILIKE '%INSERT INTO files%' OR 
          sql ILIKE '%UPDATE files%' OR 
          sql ILIKE '%SELECT%FROM files%') THEN
    RAISE EXCEPTION 'Only file table operations are allowed';
  END IF;
  
  -- This is a simplified version - in production you'd want proper parameter binding
  -- For now, we'll just return an empty array and let the other methods handle it
  RETURN ARRAY[]::JSON[];
END;
$$;


--
-- Name: gen_random_bytes(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gen_random_bytes(len integer) RETURNS bytea
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$ SELECT extensions.gen_random_bytes(len) $$;


--
-- Name: generate_api_key(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_api_key() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  key_string TEXT;
BEGIN
  -- Generate a secure random key with cb_ prefix
  -- Using gen_random_bytes from pgcrypto extension
  key_string := 'cb_' || encode(gen_random_bytes(32), 'hex');
  RETURN key_string;
END;
$$;


--
-- Name: generate_share_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_share_id() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  -- Generate a random 12-character alphanumeric string
  RETURN encode(gen_random_bytes(9), 'base64')::text;
END;
$$;


--
-- Name: get_best_account_for_upload(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_best_account_for_upload(p_user_id uuid, p_min_health_score integer DEFAULT 70) RETURNS TABLE(account_id uuid, github_username text, github_token text, health_score integer, current_repositories integer, rate_limit_remaining integer)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ga.id,
        ga.github_username,
        ga.github_token,
        ga.health_score,
        ga.current_repositories,
        ga.rate_limit_remaining
    FROM github_accounts ga
    WHERE 
        ga.user_id = p_user_id
        AND ga.is_active = true
        AND ga.health_score >= p_min_health_score
        AND ga.current_repositories < ga.max_repositories
        AND (ga.rate_limit_remaining > 100 OR ga.rate_limit_reset < NOW())
    ORDER BY 
        ga.health_score DESC,
        ga.rate_limit_remaining DESC,
        ga.current_repositories ASC
    LIMIT 1;
END;
$$;


--
-- Name: get_collection_files(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_collection_files(collection_id_param uuid) RETURNS TABLE(id uuid, name text, type text, size bigint, created_at timestamp with time zone, updated_at timestamp with time zone, encrypted boolean, shared boolean, storage_path text, tags text[], parent_folder text, added_to_collection_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Verify collection belongs to user
  IF NOT EXISTS (
    SELECT 1 FROM collections 
    WHERE collections.id = collection_id_param AND user_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'Collection not found or access denied';
  END IF;
  
  RETURN QUERY
  SELECT 
    f.id,
    f.name,
    f.type,
    f.size,
    f.created_at,
    f.updated_at,
    f.encrypted,
    f.shared,
    f.storage_path,
    f.tags,
    f.parent_folder,
    cf.added_at as added_to_collection_at
  FROM files f
  JOIN collections_files cf ON f.id = cf.file_id
  WHERE cf.collection_id = collection_id_param 
    AND cf.user_id = current_user_id
    AND f.user_id = current_user_id
  ORDER BY cf.added_at DESC;
END;
$$;


--
-- Name: get_file_request_by_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_file_request_by_slug(request_slug text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', fr.id,
    'title', fr.title,
    'description', fr.description,
    'slug', fr.slug,
    'max_files', fr.max_files,
    'max_size_per_file', fr.max_size_per_file,
    'allowed_types', fr.allowed_types,
    'expires_at', fr.expires_at,
    'is_active', fr.is_active,
    'folder_path', fr.folder_path,
    'submission_count', (
      SELECT COUNT(*) FROM public.file_request_submissions fs
      WHERE fs.file_request_id = fr.id
    )
  )
  INTO result
  FROM public.file_requests fr
  WHERE fr.slug = request_slug
    AND fr.is_active = true
    AND (fr.expires_at IS NULL OR fr.expires_at > now());

  IF result IS NULL THEN
    RAISE EXCEPTION 'File request not found or expired';
  END IF;

  RETURN result;
END;
$$;


--
-- Name: get_file_share_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_file_share_id(file_id_param uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result_share_id text;
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT share_id::text
  INTO result_share_id
  FROM public.shares
  WHERE file_id = file_id_param
    AND user_id = current_user_id
    AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN result_share_id;
END;
$$;


--
-- Name: get_hls_files(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_hls_files(p_file_id uuid) RETURNS TABLE(quality character varying, manifest_path text, file_size bigint, duration numeric, bandwidth integer, resolution character varying, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hf.quality,
        hf.manifest_path,
        hf.file_size,
        hf.duration,
        hf.bandwidth,
        hf.resolution,
        hf.created_at
    FROM hls_files hf
    WHERE hf.file_id = p_file_id 
      AND hf.user_id = auth.uid()
    ORDER BY hf.bandwidth DESC;
END;
$$;


--
-- Name: get_next_processing_job(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_processing_job(p_worker_id character varying) RETURNS TABLE(job_id uuid, job_type character varying, file_id uuid, user_id uuid, parameters jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
DECLARE
    selected_job_id UUID;
BEGIN
    -- Select and lock next job
    SELECT id INTO selected_job_id
    FROM video_processing_queue
    WHERE status = 'pending'
      AND scheduled_for <= NOW()
      AND attempts < max_attempts
    ORDER BY priority ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    
    IF selected_job_id IS NULL THEN
        RETURN;
    END IF;
    
    -- Update job status
    UPDATE video_processing_queue
    SET status = 'processing',
        worker_id = p_worker_id,
        started_at = NOW(),
        attempts = attempts + 1,
        updated_at = NOW()
    WHERE id = selected_job_id;
    
    -- Return job details
    RETURN QUERY
    SELECT 
        vpq.id,
        vpq.job_type,
        vpq.file_id,
        vpq.user_id,
        vpq.parameters
    FROM video_processing_queue vpq
    WHERE vpq.id = selected_job_id;
END;
$$;


--
-- Name: get_optimal_node(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_optimal_node(p_user_id uuid, p_file_size integer DEFAULT 1) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
DECLARE
  optimal_node_id UUID;
BEGIN
  -- Find the node with lowest utilization that has capacity
  SELECT n.id INTO optimal_node_id
  FROM nodes n
  JOIN supernodes s ON n.supernode_id = s.id
  WHERE n.is_active = true 
    AND s.is_active = true
    AND n.current_files < n.max_capacity
    AND s.health_score > 50
  ORDER BY 
    (n.current_files::float / n.max_capacity::float), -- Utilization ratio
    n.last_used ASC -- Prefer less recently used
  LIMIT 1;
  
  RETURN optimal_node_id;
END;
$$;


--
-- Name: get_or_create_default_workspace(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_or_create_default_workspace(p_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_workspace_id UUID;
  v_workspace_name TEXT;
BEGIN
  SELECT w.id
  INTO v_workspace_id
  FROM public.workspaces w
  WHERE w.user_id = p_user_id
    AND w.is_default = true
  ORDER BY w.created_at ASC
  LIMIT 1;

  IF v_workspace_id IS NOT NULL THEN
    RETURN v_workspace_id;
  END IF;

  SELECT COALESCE(
    NULLIF(trim(p.username), ''),
    NULLIF(trim(p.display_name), ''),
    NULLIF(trim(p.full_name), ''),
    NULLIF(trim(split_part(u.email, '@', 1)), ''),
    'My Workspace'
  )
  INTO v_workspace_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = p_user_id;

  v_workspace_name := LEFT(v_workspace_name, 80);

  INSERT INTO public.workspaces (user_id, name, is_default)
  VALUES (p_user_id, v_workspace_name, true)
  ON CONFLICT (user_id, name)
  DO UPDATE
    SET is_default = true,
        updated_at = now()
  RETURNING id INTO v_workspace_id;

  RETURN v_workspace_id;
END;
$$;


--
-- Name: get_playback_resume(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_playback_resume(p_file_id uuid) RETURNS TABLE("position" numeric, duration numeric, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT pr."position", pr.duration, pr.updated_at
    FROM playback_resume pr
    WHERE pr.user_id = auth.uid() AND pr.file_id = p_file_id;
END;
$$;


--
-- Name: get_public_file_info(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_file_info(file_uuid uuid) RETURNS TABLE(file_id uuid, file_name text, file_type text, file_size bigint, is_public boolean, shared boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.id as file_id,
    f.name as file_name,
    f.type as file_type,
    f.size as file_size,
    f.is_public,
    f.shared
  FROM files f
  WHERE f.id = file_uuid 
    AND (f.is_public = true OR f.shared = true);
END;
$$;


--
-- Name: get_public_folder_contents(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_folder_contents(folder_uuid uuid) RETURNS TABLE(item_id uuid, item_name text, item_type text, item_size bigint, is_folder boolean, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Return files in the folder
  RETURN QUERY
  SELECT 
    f.id as item_id,
    f.name as item_name,
    f.type as item_type,
    f.size as item_size,
    false as is_folder,
    f.created_at
  FROM files f
  JOIN folders folder ON folder.path = f.parent_folder
  WHERE folder.id = folder_uuid 
    AND folder.is_public = true;
    
  -- Return subfolders
  RETURN QUERY  
  SELECT
    sf.id as item_id,
    sf.name as item_name,
    'folder' as item_type,
    0::bigint as item_size,
    true as is_folder,
    sf.created_at
  FROM folders sf
  JOIN folders parent ON parent.path = sf.parent_folder
  WHERE parent.id = folder_uuid
    AND parent.is_public = true;
END;
$$;


--
-- Name: get_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_secret(secret_name text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
DECLARE secret_value text;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets WHERE name = secret_name;
  RETURN secret_value;
END;
$$;


--
-- Name: get_shared_file_info(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shared_file_info(share_id_param text) RETURNS TABLE(file_id uuid, file_name text, file_type text, file_size bigint, file_created_at timestamp with time zone, file_updated_at timestamp with time zone, is_encrypted boolean, storage_path text, owner_id uuid, share_created_at timestamp with time zone, share_expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
    f.user_id::uuid,
    s.created_at,
    s.expires_at
  FROM public.shares s
  JOIN public.files f ON s.file_id = f.id
  WHERE s.share_id = share_id_param
    AND (s.expires_at IS NULL OR s.expires_at > NOW());
END;
$$;


--
-- Name: get_transcode_job_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_transcode_job_status(p_file_id uuid) RETURNS TABLE(job_id uuid, status character varying, progress integer, output_qualities text[], error text, estimated_time integer, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tj.id,
        tj.status,
        tj.progress,
        tj.output_qualities,
        tj.error,
        tj.estimated_time,
        tj.created_at,
        tj.updated_at
    FROM transcode_jobs tj
    WHERE tj.file_id = p_file_id 
      AND tj.user_id = auth.uid()
    ORDER BY tj.created_at DESC
    LIMIT 1;
END;
$$;


--
-- Name: get_user_collections(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_collections() RETURNS TABLE(id uuid, name text, color text, icon text, description text, created_at timestamp with time zone, updated_at timestamp with time zone, file_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.color,
    c.icon,
    c.description,
    c.created_at,
    c.updated_at,
    COALESCE(cf.file_count, 0) as file_count
  FROM collections c
  LEFT JOIN (
    SELECT 
      collection_id,
      COUNT(*) as file_count
    FROM collections_files
    WHERE user_id = current_user_id
    GROUP BY collection_id
  ) cf ON c.id = cf.collection_id
  WHERE c.user_id = current_user_id
  ORDER BY c.name;
END;
$$;


--
-- Name: get_workspace_role(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_workspace_role(p_workspace_id uuid, p_user_id uuid) RETURNS public.workspace_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN w.user_id = p_user_id THEN 'owner'::public.workspace_role
    ELSE wm.role
  END
  FROM public.workspaces w
  LEFT JOIN public.workspace_members wm
    ON wm.workspace_id = w.id
    AND wm.user_id = p_user_id
  WHERE w.id = p_workspace_id;
$$;


--
-- Name: grant_pin_operation_authorization(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_pin_operation_authorization(operation_type text, ttl_seconds integer DEFAULT 120) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.pin_operation_authorizations (user_id, operation_type, authorized_until)
  VALUES (current_user_id, operation_type, NOW() + make_interval(secs => GREATEST(1, ttl_seconds)));

  RETURN TRUE;
END;
$$;


--
-- Name: handle_extension_approval_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_extension_approval_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  -- Only track if approval status changed
  IF OLD.approval IS DISTINCT FROM NEW.approval THEN
    INSERT INTO extension_approval_history (
      extension_id,
      admin_id,
      previous_status,
      new_status,
      notes
    ) VALUES (
      NEW.id,
      auth.uid(),
      OLD.approval,
      NEW.approval,
      NEW.approval_notes
    );
    
    -- Set approved_at timestamp if approved
    IF NEW.approval = 'approved' AND OLD.approval != 'approved' THEN
      NEW.approved_at = NOW();
      NEW.approved_by = auth.uid();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    full_name, 
    avatar_url,
    username,
    display_name,
    mfa_enabled
  )
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'display_name',
    FALSE
  );
  RETURN new;
END;
$$;


--
-- Name: has_workspace_role(uuid, uuid, public.workspace_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_workspace_role(p_workspace_id uuid, p_user_id uuid, p_min_role public.workspace_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = p_workspace_id
        AND wm.user_id = p_user_id
        AND public.workspace_role_rank(wm.role) >= public.workspace_role_rank(p_min_role)
    ) THEN true
    WHEN EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = p_workspace_id
        AND w.user_id = p_user_id
    ) THEN true
    ELSE false
  END;
$$;


--
-- Name: hash_file_encryption_key(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hash_file_encryption_key() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  -- If encryption_key is provided in plaintext, replace it with salted SHA-256 hash and store salt
  IF NEW.encryption_key IS NOT NULL AND length(trim(NEW.encryption_key)) > 0 THEN
    -- If it already looks hashed (prefixed), skip re-hashing
    IF position('sha256:' in NEW.encryption_key) = 1 THEN
      RETURN NEW;
    END IF;

    -- Generate salt using pgcrypto (extensions schema)
    NEW.encryption_key_salt := encode(extensions.gen_random_bytes(16), 'hex');

    -- Hash = sha256(encryption_key || salt), converting text to bytea via convert_to
    NEW.encryption_key := 'sha256:' || encode(
      extensions.digest(
        convert_to(NEW.encryption_key || NEW.encryption_key_salt, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

    NEW.encrypted := COALESCE(NEW.encrypted, true);
  ELSE
    -- Ensure no stray cleartext value remains
    NEW.encryption_key := NULL;
    NEW.encryption_key_salt := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION hash_file_encryption_key(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.hash_file_encryption_key() IS 'Hashes files.encryption_key with a per-row salt before write to avoid storing plaintext keys.';


--
-- Name: increment_pin_attempts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_pin_attempts(user_id_param uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
DECLARE
  new_attempts INTEGER;
BEGIN
  UPDATE user_security_settings
  SET pin_attempts = pin_attempts + 1
  WHERE user_id = user_id_param
  RETURNING pin_attempts INTO new_attempts;
  
  RETURN COALESCE(new_attempts, 0);
END;
$$;


--
-- Name: increment_share_download(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_share_download(p_share_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  UPDATE shares SET download_count = COALESCE(download_count, 0) + 1 WHERE share_id = p_share_id;
  PERFORM public.log_share_event(p_share_id, 'download');
END;
$$;


--
-- Name: increment_share_view(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_share_view(p_share_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  UPDATE shares SET share_views = COALESCE(share_views, 0) + 1 WHERE share_id = p_share_id;
  PERFORM public.log_share_event(p_share_id, 'view');
END;
$$;


--
-- Name: is_archive_file(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_archive_file(file_name text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $_$
BEGIN
  RETURN file_name ~* '\.(zip|rar|7z|tar|gz|tgz|bz2|tar\.gz|tar\.bz2)$';
END;
$_$;


--
-- Name: FUNCTION is_archive_file(file_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_archive_file(file_name text) IS 'Checks if a filename is an archive based on extension';


--
-- Name: kza_block_admin_ban(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kza_block_admin_ban() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.is_active = true AND NEW.user_id IS NOT NULL THEN
    IF public.kza_is_admin_user(NEW.user_id) THEN
      RAISE NOTICE 'KZA: Blocked auto-ban attempt on admin user %', NEW.user_id;
      RETURN NULL; -- Cancel the insert/update silently
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: kza_is_admin_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kza_is_admin_user(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = p_user_id LIMIT 1),
    false
  );
$$;


--
-- Name: lock_pin(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lock_pin(user_id_param uuid, lock_duration_minutes integer DEFAULT 5) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  UPDATE user_security_settings
  SET pin_locked_until = NOW() + (lock_duration_minutes || ' minutes')::INTERVAL,
      pin_attempts = 3
  WHERE user_id = user_id_param;
END;
$$;


--
-- Name: log_extension_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_extension_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO extension_analytics (extension_id, user_id, event_type, event_data)
    VALUES (NEW.extension_id, NEW.user_id, 'install', jsonb_build_object('installed_at', NEW.installed_at));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO extension_analytics (extension_id, user_id, event_type, event_data)
    VALUES (OLD.extension_id, OLD.user_id, 'uninstall', jsonb_build_object('uninstalled_at', NOW()));
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: log_key_access(text, text, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_key_access(p_key_type text, p_key_id text, p_action text, p_success boolean DEFAULT true, p_error_message text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.key_access_logs (
    user_id,
    key_type,
    key_id,
    action,
    success,
    error_message
  ) VALUES (
    auth.uid(),
    p_key_type,
    p_key_id,
    p_action,
    p_success,
    p_error_message
  );
END;
$$;


--
-- Name: log_playback_event(uuid, uuid, character varying, numeric, jsonb, inet, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_playback_event(p_file_id uuid, p_session_id uuid, p_event_type character varying, p_position numeric DEFAULT NULL::numeric, p_metadata jsonb DEFAULT NULL::jsonb, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    INSERT INTO media_playback_logs (
        user_id, file_id, session_id, event_type, "position", 
        metadata, ip_address, user_agent
    )
    VALUES (
        auth.uid(), p_file_id, p_session_id, p_event_type, p_position,
        p_metadata, p_ip_address, p_user_agent
    );
END;
$$;


--
-- Name: log_share_event(text, text, inet, text, text, text, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_share_event(p_share_id text, p_event_type text, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_geo_country text DEFAULT NULL::text, p_geo_city text DEFAULT NULL::text, p_referrer text DEFAULT NULL::text, p_success boolean DEFAULT true, p_error_message text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO share_audit_logs(
    share_id, event_type, ip_address, user_agent, geo_country, geo_city, referrer, success, error_message
  ) VALUES (
    p_share_id, p_event_type, p_ip, p_user_agent, p_geo_country, p_geo_city, p_referrer, p_success, p_error_message
  );
END;
$$;


--
-- Name: log_upload_stats(uuid, uuid, uuid, bigint, integer, integer, boolean, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_upload_stats(p_account_id uuid, p_repository_id uuid, p_user_id uuid, p_file_size bigint, p_upload_duration_ms integer, p_chunks_uploaded integer DEFAULT 1, p_success boolean DEFAULT true, p_error_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    INSERT INTO upload_stats (
        account_id,
        repository_id,
        user_id,
        file_size,
        upload_duration_ms,
        chunks_uploaded,
        success,
        error_message,
        upload_metadata
    ) VALUES (
        p_account_id,
        p_repository_id,
        p_user_id,
        p_file_size,
        p_upload_duration_ms,
        p_chunks_uploaded,
        p_success,
        p_error_message,
        p_metadata
    );
END;
$$;


--
-- Name: mark_app_startup_auth(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_app_startup_auth(user_id_param uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  UPDATE user_security_settings
  SET last_pin_auth = NOW()
  WHERE user_id = user_id_param;
END;
$$;


--
-- Name: FUNCTION mark_app_startup_auth(user_id_param uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mark_app_startup_auth(user_id_param uuid) IS 'Updates last_pin_auth timestamp only for app_startup operation to enable session timeout';


--
-- Name: move_to_trash(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_to_trash(file_uuid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.files 
    SET 
        is_deleted = true,
        deleted_at = NOW(),
        original_parent_folder = parent_folder,
        parent_folder = 'trash'
    WHERE id = file_uuid 
    AND user_id = auth.uid();
END;
$$;


--
-- Name: move_to_trash_secure(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_to_trash_secure(file_uuid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_user_id UUID := auth.uid();
  is_authorized BOOLEAN := FALSE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT public.assert_pin_authorized_operation('delete_files') INTO is_authorized;
  IF COALESCE(is_authorized, FALSE) = FALSE THEN
    RAISE EXCEPTION 'PIN authentication required';
  END IF;

  UPDATE public.files 
  SET 
    is_deleted = true,
    deleted_at = NOW(),
    original_parent_folder = parent_folder,
    parent_folder = 'trash'
  WHERE id = file_uuid 
    AND user_id = current_user_id;
END;
$$;


--
-- Name: notify_playback_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_playback_event() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    PERFORM pg_notify('playback_event', json_build_object(
        'user_id', NEW.user_id,
        'file_id', NEW.file_id,
        'event_type', NEW.event_type,
        'position', NEW."position"
    )::text);
    RETURN NEW;
END;
$$;


--
-- Name: notify_transcode_progress(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_transcode_progress() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    PERFORM pg_notify('transcode_progress', json_build_object(
        'job_id', NEW.id,
        'file_id', NEW.file_id,
        'user_id', NEW.user_id,
        'status', NEW.status,
        'progress', NEW.progress
    )::text);
    RETURN NEW;
END;
$$;


--
-- Name: queue_transcode_job(uuid, text[], character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.queue_transcode_job(p_file_id uuid, p_output_qualities text[], p_priority character varying DEFAULT 'normal'::character varying) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
DECLARE
    job_id UUID;
    file_size BIGINT;
BEGIN
    -- Get file size for estimation
    SELECT size INTO file_size
    FROM files
    WHERE id = p_file_id AND user_id = auth.uid();
    
    IF file_size IS NULL THEN
        RAISE EXCEPTION 'File not found or access denied';
    END IF;
    
    -- Create transcode job
    INSERT INTO transcode_jobs (
        file_id,
        user_id,
        output_qualities,
        priority,
        estimated_time
    )
    VALUES (
        p_file_id,
        auth.uid(),
        p_output_qualities,
        p_priority,
        GREATEST(1, CEIL((file_size / 1073741824.0) * array_length(p_output_qualities, 1))) -- 1 min per GB per quality
    )
    RETURNING id INTO job_id;
    
    -- Queue processing job
    INSERT INTO video_processing_queue (
        job_type,
        file_id,
        user_id,
        priority,
        parameters
    )
    VALUES (
        'transcode',
        p_file_id,
        auth.uid(),
        CASE p_priority
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 5
            WHEN 'low' THEN 8
            ELSE 5
        END,
        json_build_object(
            'transcode_job_id', job_id,
            'output_qualities', p_output_qualities
        )
    );
    
    RETURN job_id;
END;
$$;


--
-- Name: remove_file_from_collection(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_file_from_collection(collection_id_param uuid, file_id_param uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_user_id UUID;
  deleted_count INTEGER;
BEGIN
  -- Get the current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Remove the file from collection
  DELETE FROM collections_files 
  WHERE user_id = current_user_id 
    AND collection_id = collection_id_param 
    AND file_id = file_id_param;
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count > 0;
END;
$$;


--
-- Name: requires_pin_auth(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.requires_pin_auth(user_id_param uuid, operation_type text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  settings RECORD;
  time_since_auth INTERVAL;
  requires_auth BOOLEAN := false;
BEGIN
  SELECT * INTO settings
  FROM user_security_settings
  WHERE user_id = user_id_param;
  
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  
  IF NOT settings.pin_enabled THEN
    RETURN false;
  END IF;
  
  IF settings.pin_locked_until IS NOT NULL AND settings.pin_locked_until > NOW() THEN
    RETURN true;
  END IF;
  
  IF settings.last_pin_auth IS NOT NULL THEN
    time_since_auth := NOW() - settings.last_pin_auth;
  ELSE
    time_since_auth := INTERVAL '999 hours';
  END IF;
  
  CASE operation_type
    WHEN 'open_vault' THEN
      requires_auth := settings.require_pin_for_vault;
    WHEN 'create_share' THEN
      requires_auth := settings.require_pin_for_shares;
    WHEN 'revoke_share' THEN
      requires_auth := settings.require_pin_for_shares;
    WHEN 'view_security_settings' THEN
      requires_auth := settings.require_pin_for_settings;
    WHEN 'delete_files' THEN
      requires_auth := settings.require_pin_for_vault;
    WHEN 'export_data' THEN
      requires_auth := settings.require_pin_for_vault;
    WHEN 'app_startup' THEN
      requires_auth := settings.require_pin_on_startup;
      IF requires_auth AND time_since_auth <= make_interval(mins => GREATEST(COALESCE(settings.pin_timeout, 0), 0)) THEN
        requires_auth := false;
      END IF;
    ELSE
      requires_auth := true;
  END CASE;
  
  RETURN requires_auth;
END;
$$;


--
-- Name: reset_pin_attempts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_pin_attempts(user_id_param uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  UPDATE user_security_settings
  SET pin_attempts = 0,
      pin_locked_until = NULL
      -- REMOVED: last_pin_auth = NOW()
      -- This was causing PIN to be "remembered" after successful auth
  WHERE user_id = user_id_param;
END;
$$;


--
-- Name: FUNCTION reset_pin_attempts(user_id_param uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reset_pin_attempts(user_id_param uuid) IS 'Resets PIN attempts after successful verification - does NOT update last_pin_auth to prevent caching';


--
-- Name: restore_from_trash(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_from_trash(file_uuid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.files 
    SET 
        is_deleted = false,
        deleted_at = NULL,
        parent_folder = original_parent_folder
    WHERE id = file_uuid 
    AND user_id = auth.uid()
    AND is_deleted = true;
END;
$$;


--
-- Name: revoke_file_share(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_file_share(file_id_param uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
$$;


--
-- Name: rotate_master_key(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rotate_master_key(p_old_wrapped_key text, p_new_wrapped_key text, p_new_salt text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  current_version INTEGER;
BEGIN
  -- Get current key version
  SELECT COALESCE(MAX(key_version), 0) INTO current_version
  FROM public.master_keys
  WHERE user_id = auth.uid();
  
  -- Insert new version
  INSERT INTO public.master_keys (
    user_id,
    encrypted_master_key,
    kdf_salt,
    key_version,
    last_rotated
  ) VALUES (
    auth.uid(),
    p_new_wrapped_key,
    p_new_salt,
    current_version + 1,
    NOW()
  );
  
  -- Log the rotation
  PERFORM public.log_key_access(
    'master_key',
    auth.uid()::TEXT,
    'rotate',
    true
  );
  
  RETURN TRUE;
END;
$$;


--
-- Name: submit_file_request(uuid, uuid, text, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_file_request(p_file_request_id uuid, p_file_id uuid, p_file_name text, p_file_size bigint, p_uploader_name text DEFAULT ''::text, p_uploader_email text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  current_count int;
  max_allowed int;
  fr_record record;
  result jsonb;
BEGIN
  SELECT * INTO fr_record
  FROM public.file_requests
  WHERE id = p_file_request_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  FOR UPDATE;

  IF fr_record.id IS NULL THEN
    RAISE EXCEPTION 'File request not found or no longer accepting submissions';
  END IF;

  IF fr_record.max_files > 0 THEN
    SELECT COUNT(*) INTO current_count
    FROM public.file_request_submissions
    WHERE file_request_id = p_file_request_id;

    IF current_count >= fr_record.max_files THEN
      RAISE EXCEPTION 'Maximum number of submissions reached';
    END IF;
  END IF;

  INSERT INTO public.file_request_submissions (
    file_request_id, uploader_name, uploader_email,
    file_id, file_name, file_size
  ) VALUES (
    p_file_request_id, p_uploader_name, p_uploader_email,
    p_file_id, p_file_name, p_file_size
  )
  RETURNING jsonb_build_object(
    'id', id, 'created_at', created_at
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: update_account_health(uuid, integer, integer, integer, timestamp with time zone, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_account_health(p_account_id uuid, p_health_score integer, p_response_time_ms integer DEFAULT NULL::integer, p_rate_limit_remaining integer DEFAULT NULL::integer, p_rate_limit_reset timestamp with time zone DEFAULT NULL::timestamp with time zone, p_errors jsonb DEFAULT '[]'::jsonb, p_warnings jsonb DEFAULT '[]'::jsonb, p_metrics jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
DECLARE
    health_status_text TEXT;
BEGIN
    -- Determine health status based on score
    IF p_health_score >= 80 THEN
        health_status_text := 'healthy';
    ELSIF p_health_score >= 60 THEN
        health_status_text := 'warning';
    ELSE
        health_status_text := 'error';
    END IF;
    
    -- Update account health
    UPDATE github_accounts 
    SET 
        health_score = p_health_score,
        health_status = health_status_text,
        last_health_check = NOW(),
        rate_limit_remaining = COALESCE(p_rate_limit_remaining, rate_limit_remaining),
        rate_limit_reset = COALESCE(p_rate_limit_reset, rate_limit_reset),
        updated_at = NOW()
    WHERE id = p_account_id;
    
    -- Log the health check
    INSERT INTO account_health_logs (
        account_id,
        health_score,
        response_time_ms,
        rate_limit_remaining,
        rate_limit_reset,
        errors_encountered,
        warnings_encountered,
        additional_metrics
    ) VALUES (
        p_account_id,
        p_health_score,
        p_response_time_ms,
        p_rate_limit_remaining,
        p_rate_limit_reset,
        p_errors,
        p_warnings,
        p_metrics
    );
END;
$$;


--
-- Name: update_extension_rating(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_extension_rating() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  UPDATE extensions
  SET 
    rating = (
      SELECT AVG(rating)::DECIMAL(3,2)
      FROM extension_ratings
      WHERE extension_id = NEW.extension_id
    ),
    total_ratings = (
      SELECT COUNT(*)
      FROM extension_ratings
      WHERE extension_id = NEW.extension_id
    )
  WHERE id = NEW.extension_id;
  
  RETURN NEW;
END;
$$;


--
-- Name: update_maintenance_schedules_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_maintenance_schedules_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_master_keys_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_master_keys_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_migration_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_migration_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_passkey_last_used(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_passkey_last_used() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  NEW.last_used_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_playback_resume(uuid, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_playback_resume(p_file_id uuid, p_position numeric, p_duration numeric DEFAULT NULL::numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    INSERT INTO playback_resume (user_id, file_id, "position", duration)
    VALUES (auth.uid(), p_file_id, p_position, p_duration)
    ON CONFLICT (user_id, file_id)
    DO UPDATE SET
        "position" = EXCLUDED."position",
        duration = COALESCE(EXCLUDED.duration, playback_resume.duration),
        updated_at = NOW();
END;
$$;


--
-- Name: update_repository_usage(uuid, bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_repository_usage(p_repository_id uuid, p_file_size_delta bigint DEFAULT 0, p_file_count_delta integer DEFAULT 0) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    UPDATE repositories 
    SET 
        repository_size = GREATEST(0, repository_size + p_file_size_delta),
        file_count = GREATEST(0, file_count + p_file_count_delta),
        last_used = NOW()
    WHERE id = p_repository_id;
END;
$$;


--
-- Name: update_squid_vault_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_squid_vault_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_supernode_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_supernode_stats() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE supernodes 
    SET current_repos = current_repos + 1,
        updated_at = NOW()
    WHERE id = NEW.supernode_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE supernodes 
    SET current_repos = current_repos - 1,
        updated_at = NOW()
    WHERE id = OLD.supernode_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_system_settings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_system_settings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: upsert_stream_session(uuid, uuid, character varying, bigint, numeric, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_stream_session(p_session_id uuid, p_file_id uuid, p_quality character varying DEFAULT NULL::character varying, p_bandwidth_used bigint DEFAULT 0, p_stream_duration numeric DEFAULT 0, p_errors_count integer DEFAULT 0, p_completed boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
    INSERT INTO video_stream_sessions (
        session_id, user_id, file_id, quality, bandwidth_used, 
        stream_duration, errors_count, completed, last_activity
    )
    VALUES (
        p_session_id, auth.uid(), p_file_id, p_quality, p_bandwidth_used,
        p_stream_duration, p_errors_count, p_completed, NOW()
    )
    ON CONFLICT (session_id)
    DO UPDATE SET
        quality = COALESCE(EXCLUDED.quality, video_stream_sessions.quality),
        bandwidth_used = video_stream_sessions.bandwidth_used + EXCLUDED.bandwidth_used,
        stream_duration = GREATEST(video_stream_sessions.stream_duration, EXCLUDED.stream_duration),
        errors_count = video_stream_sessions.errors_count + EXCLUDED.errors_count,
        completed = EXCLUDED.completed,
        last_activity = NOW();
END;
$$;


--
-- Name: upsert_workspace_presence(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_workspace_presence(p_workspace_id uuid, p_current_file_id uuid DEFAULT NULL::uuid, p_socket_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_workspace_role(p_workspace_id, auth.uid(), 'viewer') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.workspace_presence (
    workspace_id,
    user_id,
    current_file_id,
    socket_id,
    last_heartbeat
  ) VALUES (
    p_workspace_id,
    auth.uid(),
    p_current_file_id,
    p_socket_id,
    now()
  )
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET
    current_file_id = EXCLUDED.current_file_id,
    socket_id = EXCLUDED.socket_id,
    last_heartbeat = now(),
    updated_at = now();
END;
$$;


--
-- Name: user_has_vault(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_has_vault(p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.vaults
    WHERE user_id = p_user_id
  );
END;
$$;


--
-- Name: verify_user_pin(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_user_pin(p_user_id uuid, p_pin text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_pin_hash TEXT;
  v_pin_salt TEXT;
BEGIN
  SELECT pin_hash, pin_salt INTO v_pin_hash, v_pin_salt
  FROM profiles
  WHERE id = p_user_id AND pin_enabled = true;
  
  IF v_pin_hash IS NULL THEN
    RETURN false;
  END IF;
  
  -- Hash the provided PIN with salt and compare
  RETURN v_pin_hash = encode(extensions.digest(convert_to(p_pin || v_pin_salt, 'UTF8'), 'sha256'), 'hex');
END;
$$;


--
-- Name: verify_vault_password(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_vault_password(p_user_id uuid, p_vault_name text, p_password text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_password_hash TEXT;
BEGIN
  SELECT password_hash INTO v_password_hash
  FROM public.vaults
  WHERE user_id = p_user_id AND name = p_vault_name;
  
  IF v_password_hash IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN v_password_hash = extensions.crypt(p_password, v_password_hash);
END;
$$;


--
-- Name: workspace_role_rank(public.workspace_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workspace_role_rank(p_role public.workspace_role) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE p_role
    WHEN 'viewer' THEN 1
    WHEN 'editor' THEN 2
    WHEN 'admin' THEN 3
    WHEN 'owner' THEN 4
    ELSE 0
  END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    description text,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    applies_to text DEFAULT 'all'::text,
    target_users text[],
    target_groups text[],
    priority integer DEFAULT 1,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT access_policies_applies_to_check CHECK ((applies_to = ANY (ARRAY['all'::text, 'specific_users'::text, 'user_groups'::text])))
);


--
-- Name: account_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    change_type text NOT NULL,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: account_health_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_health_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid,
    check_timestamp timestamp with time zone DEFAULT now(),
    health_score integer,
    response_time_ms integer,
    rate_limit_remaining integer,
    rate_limit_reset timestamp with time zone,
    errors_encountered jsonb DEFAULT '[]'::jsonb,
    warnings_encountered jsonb DEFAULT '[]'::jsonb,
    additional_metrics jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT account_health_logs_health_score_check CHECK (((health_score >= 0) AND (health_score <= 100)))
);


--
-- Name: admin_access_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_access_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    access_timestamp timestamp with time zone DEFAULT now() NOT NULL,
    ip_address inet,
    user_agent text,
    access_purpose text NOT NULL,
    step_completed integer DEFAULT 4 NOT NULL,
    session_id text
);


--
-- Name: analytics_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    "timestamp" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    session_id text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    scopes text[] DEFAULT ARRAY['read'::text, 'write'::text, 'delete'::text],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    key_salt text
);


--
-- Name: api_request_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_request_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    api_key_id uuid NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    method text NOT NULL,
    ip_address inet,
    user_agent text,
    status_code integer NOT NULL,
    response_time_ms integer,
    file_name text,
    file_size bigint,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: archive_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archive_extractions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_file_id uuid NOT NULL,
    source_file_name text NOT NULL,
    destination_folder text,
    status text DEFAULT 'pending'::text NOT NULL,
    progress integer DEFAULT 0,
    total_files integer DEFAULT 0,
    extracted_files integer DEFAULT 0,
    extracted_file_ids uuid[],
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT archive_extractions_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT archive_extractions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'extracting'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: TABLE archive_extractions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.archive_extractions IS 'Tracks archive file extraction jobs and their progress';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    resource text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    ip_address text,
    details jsonb DEFAULT '{}'::jsonb,
    compliance_tags text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: downloads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.downloads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    progress numeric(5,2) DEFAULT 0.00 NOT NULL,
    download_speed bigint DEFAULT 0,
    bytes_downloaded bigint DEFAULT 0,
    total_bytes bigint NOT NULL,
    estimated_time integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: encrypted_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encrypted_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    user_id uuid NOT NULL,
    wrapped_key text NOT NULL,
    key_iv text NOT NULL,
    key_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE encrypted_keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.encrypted_keys IS 'Stores file encryption keys wrapped with user master keys for zero-knowledge encryption';


--
-- Name: COLUMN encrypted_keys.wrapped_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.encrypted_keys.wrapped_key IS 'File encryption key encrypted with user master key using AES-256-GCM';


--
-- Name: COLUMN encrypted_keys.key_iv; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.encrypted_keys.key_iv IS 'Initialization vector for key wrapping operation';


--
-- Name: extension_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    extension_id uuid NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: extension_approval_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_approval_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    extension_id uuid NOT NULL,
    admin_id uuid NOT NULL,
    previous_status text,
    new_status text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: extension_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    extension_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rating integer NOT NULL,
    review text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT extension_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: extensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    version text DEFAULT '1.0.0'::text NOT NULL,
    author text NOT NULL,
    author_id uuid NOT NULL,
    icon_url text,
    category text DEFAULT 'utility'::text NOT NULL,
    downloads integer DEFAULT 0,
    rating numeric(3,2) DEFAULT 0,
    total_ratings integer DEFAULT 0,
    is_verified boolean DEFAULT false,
    is_active boolean DEFAULT true,
    manifest_url text NOT NULL,
    repository_url text,
    permissions text[] DEFAULT '{}'::text[],
    screenshots text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    approval text DEFAULT 'pending'::text NOT NULL,
    approval_notes text,
    approved_at timestamp with time zone,
    approved_by uuid,
    CONSTRAINT extensions_approval_check CHECK ((approval = ANY (ARRAY['pending'::text, 'on_review'::text, 'approved'::text])))
);


--
-- Name: file_request_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_request_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_request_id uuid NOT NULL,
    uploader_name text DEFAULT ''::text,
    uploader_email text DEFAULT ''::text,
    file_id uuid NOT NULL,
    file_name text NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: file_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    folder_path text DEFAULT ''::text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text,
    slug text NOT NULL,
    max_files integer DEFAULT 0,
    max_size_per_file bigint DEFAULT 0,
    allowed_types text[],
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    size bigint NOT NULL,
    encrypted boolean DEFAULT true,
    storage_path text NOT NULL,
    encryption_key text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    shared boolean DEFAULT false,
    tags text[],
    parent_folder text,
    is_public boolean DEFAULT false,
    deleted_at timestamp with time zone,
    is_deleted boolean DEFAULT false NOT NULL,
    original_parent_folder text,
    in_vault boolean DEFAULT false,
    vault_previous_folder text,
    encryption_key_salt text,
    workspace_id uuid NOT NULL,
    storage_provider_id uuid,
    external_object_key text,
    encrypted_key text,
    encrypted_key_nonce text,
    encryption_key_version integer DEFAULT 1
);


--
-- Name: COLUMN files.encryption_key_salt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.encryption_key_salt IS 'Per-row salt used to hash the (client) encryption_key. Plaintext keys are never stored.';


--
-- Name: folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    path text NOT NULL,
    parent_folder text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_public boolean DEFAULT false,
    workspace_id uuid NOT NULL,
    storage_provider_id uuid
);


--
-- Name: installed_extensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installed_extensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    extension_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_enabled boolean DEFAULT true,
    settings jsonb DEFAULT '{}'::jsonb,
    installed_at timestamp with time zone DEFAULT now()
);


--
-- Name: key_access_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_access_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    key_type text NOT NULL,
    key_id text NOT NULL,
    action text NOT NULL,
    ip_address inet,
    user_agent text,
    success boolean DEFAULT true NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE key_access_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.key_access_logs IS 'Audit trail for all cryptographic key access operations';


--
-- Name: kza_admin_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kza_admin_incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    threat_event_id uuid,
    incident_title text,
    threat_tier text,
    attacker_profile jsonb,
    attack_timeline jsonb,
    what_was_targeted text,
    potential_harm text,
    techniques_used text[],
    actions_taken text[],
    linked_accounts jsonb,
    network_intel jsonb,
    status text DEFAULT 'PENDING'::text,
    resolved_by text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT kza_admin_incidents_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACKNOWLEDGED'::text, 'RESOLVED'::text, 'FALSE_POSITIVE'::text])))
);


--
-- Name: kza_banned_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kza_banned_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    ip_address text,
    ban_type text,
    ban_reason text,
    ban_tier text,
    attack_summary text,
    banned_until timestamp with time zone,
    banned_by text DEFAULT 'KZA_AUTO'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT kza_banned_entities_type_check CHECK (((ban_type IS NULL) OR (ban_type = ANY (ARRAY['TEMP'::text, 'PERMANENT'::text]))))
);


--
-- Name: kza_honeypot_hits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kza_honeypot_hits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trap_name text,
    trap_type text,
    user_id uuid,
    ip_address text,
    request_details jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT kza_honeypot_hits_type_check CHECK (((trap_type IS NULL) OR (trap_type = ANY (ARRAY['GHOST_ENDPOINT'::text, 'CANARY_TOKEN'::text, 'HONEYPOT_FILE'::text, 'FAKE_CREDENTIALS'::text, 'INVISIBLE_FIELD'::text]))))
);


--
-- Name: kza_linked_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kza_linked_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    primary_user_id uuid,
    linked_user_id uuid,
    link_reason text,
    confidence_score integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: kza_phantom_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kza_phantom_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_name text,
    asset_type text,
    asset_value text,
    is_active boolean DEFAULT true,
    hit_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT kza_phantom_assets_type_check CHECK (((asset_type IS NULL) OR (asset_type = ANY (ARRAY['GHOST_ENDPOINT'::text, 'CANARY_TOKEN'::text, 'HONEYPOT_FILE'::text, 'FAKE_CREDENTIALS'::text, 'INVISIBLE_FIELD'::text]))))
);


--
-- Name: kza_threat_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kza_threat_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    session_id text,
    ip_address text,
    threat_tier text,
    threat_type text,
    description text,
    payload_snapshot jsonb,
    endpoint_hit text,
    method text,
    automated_action_taken text,
    acknowledged boolean DEFAULT false,
    acknowledged_by text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT kza_threat_events_tier_check CHECK (((threat_tier IS NULL) OR (threat_tier = ANY (ARRAY['YELLOW'::text, 'ORANGE'::text, 'RED'::text, 'BLACK'::text]))))
);


--
-- Name: kza_user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kza_user_profiles (
    user_id uuid NOT NULL,
    typical_endpoints text[] DEFAULT '{}'::text[],
    typical_countries text[] DEFAULT '{}'::text[],
    typical_devices jsonb DEFAULT '[]'::jsonb,
    avg_request_interval_ms integer,
    typical_active_hours integer[] DEFAULT '{}'::integer[],
    total_requests bigint DEFAULT 0,
    last_seen_at timestamp with time zone,
    threat_score integer DEFAULT 0,
    is_watchlisted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: login_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ip_address inet,
    user_agent text,
    device_name text,
    remember_device boolean DEFAULT false,
    last_active timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: maintenance_mode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_mode (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_enabled boolean DEFAULT false,
    maintenance_type text DEFAULT 'general'::text,
    message text DEFAULT 'System is under maintenance'::text,
    estimated_duration integer,
    services_status jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: maintenance_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_active boolean DEFAULT false,
    maintenance_type text NOT NULL,
    affected_services text[] DEFAULT '{}'::text[],
    reason text NOT NULL,
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    scheduled_for timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT maintenance_schedules_maintenance_type_check CHECK ((maintenance_type = ANY (ARRAY['full'::text, 'partial'::text])))
);


--
-- Name: TABLE maintenance_schedules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.maintenance_schedules IS 'System maintenance scheduling and management';


--
-- Name: master_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    encrypted_master_key text NOT NULL,
    kdf_salt text NOT NULL,
    kdf_iterations integer DEFAULT 100000 NOT NULL,
    key_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_rotated timestamp with time zone
);


--
-- Name: TABLE master_keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.master_keys IS 'Stores encrypted user master keys derived from passwords using PBKDF2';


--
-- Name: COLUMN master_keys.encrypted_master_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.master_keys.encrypted_master_key IS 'Master key encrypted with password-derived key (PBKDF2)';


--
-- Name: COLUMN master_keys.kdf_salt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.master_keys.kdf_salt IS 'Random salt used for PBKDF2 key derivation';


--
-- Name: COLUMN master_keys.kdf_iterations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.master_keys.kdf_iterations IS 'Number of PBKDF2 iterations (100,000+)';


--
-- Name: media_playback_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_playback_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    session_id uuid NOT NULL,
    event_type character varying(50) NOT NULL,
    "position" numeric(10,3),
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_playback_logs_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['play'::character varying, 'pause'::character varying, 'seek'::character varying, 'quality_change'::character varying, 'speed_change'::character varying, 'buffer_start'::character varying, 'buffer_end'::character varying, 'complete'::character varying, 'error'::character varying])::text[])))
);


--
-- Name: TABLE media_playback_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.media_playback_logs IS 'Stores detailed playback events for video analytics';


--
-- Name: migration_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_platform text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total_files integer DEFAULT 0,
    processed_files integer DEFAULT 0,
    failed_files integer DEFAULT 0,
    settings jsonb DEFAULT '{}'::jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT migration_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: migration_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    migration_job_id uuid NOT NULL,
    user_id uuid NOT NULL,
    level text DEFAULT 'info'::text NOT NULL,
    message text NOT NULL,
    file_name text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT migration_logs_level_check CHECK ((level = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'success'::text])))
);


--
-- Name: partner_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    duration_months integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    is_used boolean DEFAULT false,
    used_by uuid,
    used_at timestamp with time zone
);


--
-- Name: pdf_secure_urls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pdf_secure_urls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    user_id uuid NOT NULL,
    secure_url text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pin_attempt_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pin_attempt_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    attempt_type text NOT NULL,
    ip_address text,
    user_agent text,
    location jsonb,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pin_attempt_logs_attempt_type_check CHECK ((attempt_type = ANY (ARRAY['success'::text, 'failed'::text, 'locked'::text])))
);


--
-- Name: TABLE pin_attempt_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pin_attempt_logs IS 'Audit log for PIN authentication attempts';


--
-- Name: pin_operation_authorizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pin_operation_authorizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    operation_type text NOT NULL,
    authorized_until timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pin_operation_authorizations_operation_type_check CHECK ((operation_type = ANY (ARRAY['create_share'::text, 'revoke_share'::text, 'delete_files'::text, 'open_vault'::text, 'view_security_settings'::text, 'export_data'::text, 'app_startup'::text])))
);


--
-- Name: playback_resume; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playback_resume (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    "position" numeric(10,3) DEFAULT 0 NOT NULL,
    duration numeric(10,3),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE playback_resume; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.playback_resume IS 'Stores user resume positions for videos';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    avatar_url text,
    storage_used bigint DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    onboarding_complete boolean DEFAULT false NOT NULL,
    repo_count smallint DEFAULT '0'::smallint NOT NULL,
    is_premium boolean DEFAULT false,
    is_admin boolean DEFAULT false,
    mfa_enabled boolean DEFAULT false,
    mfa_secret text,
    username text,
    display_name text,
    encrypted_mfa_secret text,
    mfa_secret_iv text,
    pin_hash text,
    pin_enabled boolean DEFAULT false,
    pin_salt text
);


--
-- Name: COLUMN profiles.encrypted_mfa_secret; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.encrypted_mfa_secret IS 'MFA secret encrypted with user master key';


--
-- Name: COLUMN profiles.mfa_secret_iv; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.mfa_secret_iv IS 'IV for MFA secret encryption';


--
-- Name: repositories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repositories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    repo_name text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status jsonb,
    account_id uuid,
    last_health_check timestamp with time zone,
    health_status text DEFAULT 'unknown'::text,
    repository_size bigint DEFAULT 0,
    file_count integer DEFAULT 0,
    last_used timestamp with time zone DEFAULT now(),
    CONSTRAINT repositories_health_status_check CHECK ((health_status = ANY (ARRAY['healthy'::text, 'warning'::text, 'error'::text, 'unknown'::text])))
);


--
-- Name: security_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    ip_address text,
    user_agent text,
    metadata jsonb DEFAULT '{}'::jsonb,
    risk_level text DEFAULT 'low'::text,
    status text DEFAULT 'success'::text,
    "timestamp" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT security_events_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT security_events_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text, 'blocked'::text])))
);


--
-- Name: security_keyring; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_keyring (
    name text NOT NULL,
    key_id uuid NOT NULL
);


--
-- Name: share_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    share_id text,
    event_type text NOT NULL,
    ip_address inet,
    user_agent text,
    geo_country text,
    geo_city text,
    referrer text,
    success boolean DEFAULT true,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: share_collection_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_collection_files (
    collection_id uuid NOT NULL,
    file_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: share_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    share_id text NOT NULL,
    user_id uuid,
    collection_name text NOT NULL,
    description text,
    access_code text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    user_id uuid NOT NULL,
    access_code text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    share_views integer DEFAULT 0,
    download_count integer DEFAULT 0,
    download_limit integer,
    view_only boolean DEFAULT false,
    require_email boolean DEFAULT false,
    allowed_ips text[],
    custom_message text,
    is_active boolean DEFAULT true,
    share_id text,
    allowed_users text[],
    share_type text DEFAULT 'public'::text
);


--
-- Name: squid_vaults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squid_vaults (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    vault_name text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: storage_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider_type text NOT NULL,
    encrypted_credentials text NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT storage_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['squidcloud'::text, 'r2'::text, 'tebi'::text, 's3'::text, 'gcp'::text])))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    original_price integer NOT NULL,
    discounted_price integer,
    discount_active boolean DEFAULT false,
    features text[] DEFAULT '{}'::text[],
    storage_limit bigint,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    message text NOT NULL,
    sender_id uuid NOT NULL,
    sender_type text NOT NULL,
    attachments text[],
    is_internal boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT support_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['user'::text, 'admin'::text])))
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    priority text DEFAULT 'medium'::text,
    status text DEFAULT 'open'::text,
    user_id uuid NOT NULL,
    assigned_to uuid,
    rating integer,
    attachments text[],
    tags text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT support_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT support_tickets_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])))
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key text NOT NULL,
    setting_value jsonb NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: threat_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.threat_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    severity text DEFAULT 'medium'::text,
    title text NOT NULL,
    description text,
    "timestamp" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    status text DEFAULT 'active'::text,
    actions_taken jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT threat_alerts_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT threat_alerts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'investigating'::text, 'resolved'::text, 'false_positive'::text])))
);


--
-- Name: transcode_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcode_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status character varying(20) DEFAULT 'queued'::character varying NOT NULL,
    output_qualities text[] DEFAULT '{}'::text[] NOT NULL,
    priority character varying(10) DEFAULT 'normal'::character varying NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    error text,
    output_files jsonb,
    estimated_time integer,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transcode_jobs_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying])::text[]))),
    CONSTRAINT transcode_jobs_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT transcode_jobs_status_check CHECK (((status)::text = ANY ((ARRAY['queued'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: TABLE transcode_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transcode_jobs IS 'Tracks video transcoding jobs and their progress';


--
-- Name: upload_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid,
    repository_id uuid,
    user_id uuid,
    upload_timestamp timestamp with time zone DEFAULT now(),
    file_size bigint,
    upload_duration_ms integer,
    chunks_uploaded integer DEFAULT 1,
    success boolean DEFAULT true,
    error_message text,
    upload_metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: user_encryption_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_encryption_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: user_passkeys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_passkeys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    credential_id text NOT NULL,
    public_key text,
    created_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    code_editor text DEFAULT 'vscode'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_security_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_security_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pin_hash text NOT NULL,
    pin_enabled boolean DEFAULT true,
    pin_attempts integer DEFAULT 0,
    pin_locked_until timestamp with time zone,
    biometric_enabled boolean DEFAULT false,
    require_pin_on_startup boolean DEFAULT false,
    require_pin_for_shares boolean DEFAULT true,
    require_pin_for_settings boolean DEFAULT true,
    require_pin_for_vault boolean DEFAULT true,
    pin_timeout integer DEFAULT 5,
    last_pin_auth timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE user_security_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_security_settings IS 'Stores user PIN authentication settings and preferences';


--
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    start_date timestamp with time zone DEFAULT now(),
    end_date timestamp with time zone,
    payment_status text DEFAULT 'pending'::text,
    payment_id text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_terms_acceptance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_terms_acceptance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    terms_version text NOT NULL,
    privacy_version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vault_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vault_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vault_id uuid NOT NULL,
    file_id uuid NOT NULL,
    user_id uuid NOT NULL,
    original_parent_folder text,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: vaults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vaults (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_fingerprint_enabled boolean DEFAULT false,
    passkey_credential_id text
);


--
-- Name: video_stream_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_stream_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    quality character varying(20),
    bandwidth_used bigint DEFAULT 0,
    stream_duration numeric(10,3) DEFAULT 0,
    errors_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity timestamp with time zone DEFAULT now() NOT NULL,
    completed boolean DEFAULT false
);


--
-- Name: TABLE video_stream_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.video_stream_sessions IS 'Tracks video streaming sessions and bandwidth usage';


--
-- Name: video_analytics_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.video_analytics_summary WITH (security_invoker='true') AS
 SELECT f.id AS file_id,
    f.name AS file_name,
    f.type AS file_type,
    f.size AS file_size,
    count(DISTINCT mpl.session_id) AS total_sessions,
    count(DISTINCT mpl.user_id) AS unique_viewers,
    avg(vss.stream_duration) AS avg_watch_time,
    sum(vss.bandwidth_used) AS total_bandwidth,
    count(
        CASE
            WHEN ((mpl.event_type)::text = 'complete'::text) THEN 1
            ELSE NULL::integer
        END) AS completion_count,
    count(
        CASE
            WHEN ((mpl.event_type)::text = 'error'::text) THEN 1
            ELSE NULL::integer
        END) AS error_count,
    max(mpl."timestamp") AS last_viewed,
    avg(
        CASE
            WHEN ((mpl.event_type)::text = 'complete'::text) THEN mpl."position"
            ELSE NULL::numeric
        END) AS avg_completion_time
   FROM ((public.files f
     LEFT JOIN public.media_playback_logs mpl ON ((f.id = mpl.file_id)))
     LEFT JOIN public.video_stream_sessions vss ON ((mpl.session_id = vss.session_id)))
  WHERE (f.type ~~ 'video/%'::text)
  GROUP BY f.id, f.name, f.type, f.size;


--
-- Name: VIEW video_analytics_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.video_analytics_summary IS 'Aggregated analytics view for video files';


--
-- Name: video_processing_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_processing_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_type character varying(50) NOT NULL,
    file_id uuid NOT NULL,
    user_id uuid NOT NULL,
    priority integer DEFAULT 5 NOT NULL,
    parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    worker_id character varying(100),
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    error_message text,
    scheduled_for timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_processing_queue_job_type_check CHECK (((job_type)::text = ANY ((ARRAY['transcode'::character varying, 'thumbnail'::character varying, 'metadata'::character varying, 'analyze'::character varying])::text[]))),
    CONSTRAINT video_processing_queue_priority_check CHECK (((priority >= 1) AND (priority <= 10))),
    CONSTRAINT video_processing_queue_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: TABLE video_processing_queue; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.video_processing_queue IS 'Queue system for background video processing jobs';


--
-- Name: video_quality_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_quality_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    quality character varying(20) NOT NULL,
    bandwidth integer,
    buffer_level numeric(5,2),
    dropped_frames integer DEFAULT 0,
    rebuffer_count integer DEFAULT 0,
    startup_time numeric(6,3)
);


--
-- Name: TABLE video_quality_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.video_quality_metrics IS 'Stores detailed quality and performance metrics';


--
-- Name: workspace_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    invitee_email text NOT NULL,
    invitee_user_id uuid,
    invited_by uuid NOT NULL,
    role public.workspace_role DEFAULT 'viewer'::public.workspace_role NOT NULL,
    token_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_invites_email_not_blank CHECK ((char_length(TRIM(BOTH FROM invitee_email)) > 0)),
    CONSTRAINT workspace_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.workspace_role DEFAULT 'viewer'::public.workspace_role NOT NULL,
    invited_by uuid,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_presence (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    current_file_id uuid,
    socket_id text,
    last_heartbeat timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    storage_backend text DEFAULT 'managed'::text NOT NULL,
    member_limit integer,
    CONSTRAINT workspaces_member_limit_check CHECK (((member_limit IS NULL) OR (member_limit > 0))),
    CONSTRAINT workspaces_name_not_blank CHECK ((char_length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT workspaces_storage_backend_check CHECK ((storage_backend = ANY (ARRAY['managed'::text, 'custom'::text])))
);


--
-- Name: access_policies access_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_policies
    ADD CONSTRAINT access_policies_pkey PRIMARY KEY (id);


--
-- Name: account_changes account_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_changes
    ADD CONSTRAINT account_changes_pkey PRIMARY KEY (id);


--
-- Name: account_health_logs account_health_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_health_logs
    ADD CONSTRAINT account_health_logs_pkey PRIMARY KEY (id);


--
-- Name: admin_access_logs admin_access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_access_logs
    ADD CONSTRAINT admin_access_logs_pkey PRIMARY KEY (id);


--
-- Name: analytics_events analytics_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: api_request_logs api_request_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_request_logs
    ADD CONSTRAINT api_request_logs_pkey PRIMARY KEY (id);


--
-- Name: archive_extractions archive_extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_extractions
    ADD CONSTRAINT archive_extractions_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: downloads downloads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.downloads
    ADD CONSTRAINT downloads_pkey PRIMARY KEY (id);


--
-- Name: encrypted_keys encrypted_keys_file_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encrypted_keys
    ADD CONSTRAINT encrypted_keys_file_id_user_id_key UNIQUE (file_id, user_id);


--
-- Name: encrypted_keys encrypted_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encrypted_keys
    ADD CONSTRAINT encrypted_keys_pkey PRIMARY KEY (id);


--
-- Name: extension_analytics extension_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_analytics
    ADD CONSTRAINT extension_analytics_pkey PRIMARY KEY (id);


--
-- Name: extension_approval_history extension_approval_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_approval_history
    ADD CONSTRAINT extension_approval_history_pkey PRIMARY KEY (id);


--
-- Name: extension_ratings extension_ratings_extension_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_ratings
    ADD CONSTRAINT extension_ratings_extension_id_user_id_key UNIQUE (extension_id, user_id);


--
-- Name: extension_ratings extension_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_ratings
    ADD CONSTRAINT extension_ratings_pkey PRIMARY KEY (id);


--
-- Name: extensions extensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extensions
    ADD CONSTRAINT extensions_pkey PRIMARY KEY (id);


--
-- Name: file_request_submissions file_request_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_request_submissions
    ADD CONSTRAINT file_request_submissions_pkey PRIMARY KEY (id);


--
-- Name: file_requests file_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_requests
    ADD CONSTRAINT file_requests_pkey PRIMARY KEY (id);


--
-- Name: file_requests file_requests_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_requests
    ADD CONSTRAINT file_requests_slug_key UNIQUE (slug);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: installed_extensions installed_extensions_extension_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_extensions
    ADD CONSTRAINT installed_extensions_extension_id_user_id_key UNIQUE (extension_id, user_id);


--
-- Name: installed_extensions installed_extensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_extensions
    ADD CONSTRAINT installed_extensions_pkey PRIMARY KEY (id);


--
-- Name: key_access_logs key_access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_access_logs
    ADD CONSTRAINT key_access_logs_pkey PRIMARY KEY (id);


--
-- Name: kza_admin_incidents kza_admin_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kza_admin_incidents
    ADD CONSTRAINT kza_admin_incidents_pkey PRIMARY KEY (id);


--
-- Name: kza_banned_entities kza_banned_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kza_banned_entities
    ADD CONSTRAINT kza_banned_entities_pkey PRIMARY KEY (id);


--
-- Name: kza_honeypot_hits kza_honeypot_hits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kza_honeypot_hits
    ADD CONSTRAINT kza_honeypot_hits_pkey PRIMARY KEY (id);


--
-- Name: kza_linked_accounts kza_linked_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kza_linked_accounts
    ADD CONSTRAINT kza_linked_accounts_pkey PRIMARY KEY (id);


--
-- Name: kza_phantom_assets kza_phantom_assets_asset_name_asset_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kza_phantom_assets
    ADD CONSTRAINT kza_phantom_assets_asset_name_asset_type_key UNIQUE (asset_name, asset_type);


--
-- Name: kza_phantom_assets kza_phantom_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kza_phantom_assets
    ADD CONSTRAINT kza_phantom_assets_pkey PRIMARY KEY (id);


--
-- Name: kza_threat_events kza_threat_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kza_threat_events
    ADD CONSTRAINT kza_threat_events_pkey PRIMARY KEY (id);


--
-- Name: kza_user_profiles kza_user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kza_user_profiles
    ADD CONSTRAINT kza_user_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: login_sessions login_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_sessions
    ADD CONSTRAINT login_sessions_pkey PRIMARY KEY (id);


--
-- Name: maintenance_mode maintenance_mode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_mode
    ADD CONSTRAINT maintenance_mode_pkey PRIMARY KEY (id);


--
-- Name: maintenance_schedules maintenance_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_schedules
    ADD CONSTRAINT maintenance_schedules_pkey PRIMARY KEY (id);


--
-- Name: master_keys master_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_keys
    ADD CONSTRAINT master_keys_pkey PRIMARY KEY (id);


--
-- Name: master_keys master_keys_user_id_key_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_keys
    ADD CONSTRAINT master_keys_user_id_key_version_key UNIQUE (user_id, key_version);


--
-- Name: media_playback_logs media_playback_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_logs
    ADD CONSTRAINT media_playback_logs_pkey PRIMARY KEY (id);


--
-- Name: migration_jobs migration_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_jobs
    ADD CONSTRAINT migration_jobs_pkey PRIMARY KEY (id);


--
-- Name: migration_logs migration_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_logs
    ADD CONSTRAINT migration_logs_pkey PRIMARY KEY (id);


--
-- Name: partner_codes partner_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_codes
    ADD CONSTRAINT partner_codes_code_key UNIQUE (code);


--
-- Name: partner_codes partner_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_codes
    ADD CONSTRAINT partner_codes_pkey PRIMARY KEY (id);


--
-- Name: pdf_secure_urls pdf_secure_urls_file_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_secure_urls
    ADD CONSTRAINT pdf_secure_urls_file_id_user_id_key UNIQUE (file_id, user_id);


--
-- Name: pdf_secure_urls pdf_secure_urls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_secure_urls
    ADD CONSTRAINT pdf_secure_urls_pkey PRIMARY KEY (id);


--
-- Name: pin_attempt_logs pin_attempt_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pin_attempt_logs
    ADD CONSTRAINT pin_attempt_logs_pkey PRIMARY KEY (id);


--
-- Name: pin_operation_authorizations pin_operation_authorizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pin_operation_authorizations
    ADD CONSTRAINT pin_operation_authorizations_pkey PRIMARY KEY (id);


--
-- Name: playback_resume playback_resume_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playback_resume
    ADD CONSTRAINT playback_resume_pkey PRIMARY KEY (id);


--
-- Name: playback_resume playback_resume_user_id_file_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playback_resume
    ADD CONSTRAINT playback_resume_user_id_file_id_key UNIQUE (user_id, file_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: repositories repositories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT repositories_pkey PRIMARY KEY (id);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);


--
-- Name: security_keyring security_keyring_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_keyring
    ADD CONSTRAINT security_keyring_pkey PRIMARY KEY (name);


--
-- Name: share_audit_logs share_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_audit_logs
    ADD CONSTRAINT share_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: share_collection_files share_collection_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_collection_files
    ADD CONSTRAINT share_collection_files_pkey PRIMARY KEY (collection_id, file_id);


--
-- Name: share_collections share_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_collections
    ADD CONSTRAINT share_collections_pkey PRIMARY KEY (id);


--
-- Name: share_collections share_collections_share_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_collections
    ADD CONSTRAINT share_collections_share_id_key UNIQUE (share_id);


--
-- Name: shares shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_pkey PRIMARY KEY (id);


--
-- Name: shares shares_share_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_share_id_unique UNIQUE (share_id);


--
-- Name: squid_vaults squid_vaults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squid_vaults
    ADD CONSTRAINT squid_vaults_pkey PRIMARY KEY (id);


--
-- Name: squid_vaults squid_vaults_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squid_vaults
    ADD CONSTRAINT squid_vaults_user_id_key UNIQUE (user_id);


--
-- Name: storage_providers storage_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_providers
    ADD CONSTRAINT storage_providers_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: threat_alerts threat_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threat_alerts
    ADD CONSTRAINT threat_alerts_pkey PRIMARY KEY (id);


--
-- Name: transcode_jobs transcode_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcode_jobs
    ADD CONSTRAINT transcode_jobs_pkey PRIMARY KEY (id);


--
-- Name: upload_stats upload_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_stats
    ADD CONSTRAINT upload_stats_pkey PRIMARY KEY (id);


--
-- Name: user_encryption_settings user_encryption_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_encryption_settings
    ADD CONSTRAINT user_encryption_settings_pkey PRIMARY KEY (id);


--
-- Name: user_encryption_settings user_encryption_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_encryption_settings
    ADD CONSTRAINT user_encryption_settings_user_id_key UNIQUE (user_id);


--
-- Name: user_passkeys user_passkeys_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_passkeys
    ADD CONSTRAINT user_passkeys_email_key UNIQUE (email);


--
-- Name: user_passkeys user_passkeys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_passkeys
    ADD CONSTRAINT user_passkeys_pkey PRIMARY KEY (id);


--
-- Name: user_passkeys user_passkeys_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_passkeys
    ADD CONSTRAINT user_passkeys_user_id_key UNIQUE (user_id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);


--
-- Name: user_security_settings user_security_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_security_settings
    ADD CONSTRAINT user_security_settings_pkey PRIMARY KEY (id);


--
-- Name: user_security_settings user_security_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_security_settings
    ADD CONSTRAINT user_security_settings_user_id_key UNIQUE (user_id);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: user_terms_acceptance user_terms_acceptance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_terms_acceptance
    ADD CONSTRAINT user_terms_acceptance_pkey PRIMARY KEY (id);


--
-- Name: vault_files vault_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_files
    ADD CONSTRAINT vault_files_pkey PRIMARY KEY (id);


--
-- Name: vault_files vault_files_vault_id_file_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_files
    ADD CONSTRAINT vault_files_vault_id_file_id_key UNIQUE (vault_id, file_id);


--
-- Name: vaults vaults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vaults
    ADD CONSTRAINT vaults_pkey PRIMARY KEY (id);


--
-- Name: vaults vaults_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vaults
    ADD CONSTRAINT vaults_user_id_name_key UNIQUE (user_id, name);


--
-- Name: video_processing_queue video_processing_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_processing_queue
    ADD CONSTRAINT video_processing_queue_pkey PRIMARY KEY (id);


--
-- Name: video_quality_metrics video_quality_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_quality_metrics
    ADD CONSTRAINT video_quality_metrics_pkey PRIMARY KEY (id);


--
-- Name: video_stream_sessions video_stream_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_stream_sessions
    ADD CONSTRAINT video_stream_sessions_pkey PRIMARY KEY (id);


--
-- Name: video_stream_sessions video_stream_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_stream_sessions
    ADD CONSTRAINT video_stream_sessions_session_id_key UNIQUE (session_id);


--
-- Name: workspace_invites workspace_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id);


--
-- Name: workspace_presence workspace_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_presence
    ADD CONSTRAINT workspace_presence_pkey PRIMARY KEY (workspace_id, user_id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_user_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_user_name_unique UNIQUE (user_id, name);


--
-- Name: access_policies_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_policies_active_idx ON public.access_policies USING btree (active);


--
-- Name: access_policies_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_policies_user_id_idx ON public.access_policies USING btree (user_id);


--
-- Name: analytics_events_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_events_event_type_idx ON public.analytics_events USING btree (event_type);


--
-- Name: analytics_events_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_events_timestamp_idx ON public.analytics_events USING btree ("timestamp");


--
-- Name: analytics_events_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_events_user_id_idx ON public.analytics_events USING btree (user_id);


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);


--
-- Name: audit_logs_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_timestamp_idx ON public.audit_logs USING btree ("timestamp");


--
-- Name: audit_logs_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_user_id_idx ON public.audit_logs USING btree (user_id);


--
-- Name: files_parent_folder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX files_parent_folder_idx ON public.files USING btree (parent_folder);


--
-- Name: files_workspace_provider_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX files_workspace_provider_parent_idx ON public.files USING btree (workspace_id, storage_provider_id, parent_folder);


--
-- Name: folders_parent_folder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folders_parent_folder_idx ON public.folders USING btree (parent_folder);


--
-- Name: folders_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folders_path_idx ON public.folders USING btree (path);


--
-- Name: folders_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folders_user_id_idx ON public.folders USING btree (user_id);


--
-- Name: folders_workspace_provider_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folders_workspace_provider_parent_idx ON public.folders USING btree (workspace_id, storage_provider_id, parent_folder);


--
-- Name: idx_account_health_logs_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_health_logs_account_id ON public.account_health_logs USING btree (account_id);


--
-- Name: idx_account_health_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_health_logs_timestamp ON public.account_health_logs USING btree (check_timestamp);


--
-- Name: idx_api_keys_key_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_key_hash ON public.api_keys USING btree (key_hash);


--
-- Name: idx_api_keys_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_user_active ON public.api_keys USING btree (user_id, is_active) WHERE (is_active = true);


--
-- Name: idx_api_keys_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_user_id ON public.api_keys USING btree (user_id);


--
-- Name: idx_api_request_logs_api_key_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_request_logs_api_key_id ON public.api_request_logs USING btree (api_key_id);


--
-- Name: idx_api_request_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_request_logs_created_at ON public.api_request_logs USING btree (created_at);


--
-- Name: idx_archive_extractions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_archive_extractions_created_at ON public.archive_extractions USING btree (created_at DESC);


--
-- Name: idx_archive_extractions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_archive_extractions_status ON public.archive_extractions USING btree (status);


--
-- Name: idx_archive_extractions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_archive_extractions_user_id ON public.archive_extractions USING btree (user_id);


--
-- Name: idx_encrypted_keys_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encrypted_keys_file ON public.encrypted_keys USING btree (file_id);


--
-- Name: idx_encrypted_keys_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encrypted_keys_user ON public.encrypted_keys USING btree (user_id);


--
-- Name: idx_extension_analytics_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extension_analytics_created_at ON public.extension_analytics USING btree (created_at);


--
-- Name: idx_extension_analytics_extension_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extension_analytics_extension_id ON public.extension_analytics USING btree (extension_id);


--
-- Name: idx_extension_analytics_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extension_analytics_user_id ON public.extension_analytics USING btree (user_id);


--
-- Name: idx_extension_approval_history_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extension_approval_history_created ON public.extension_approval_history USING btree (created_at DESC);


--
-- Name: idx_extension_approval_history_extension; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extension_approval_history_extension ON public.extension_approval_history USING btree (extension_id);


--
-- Name: idx_extension_ratings_extension_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extension_ratings_extension_id ON public.extension_ratings USING btree (extension_id);


--
-- Name: idx_extensions_approval; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extensions_approval ON public.extensions USING btree (approval);


--
-- Name: idx_extensions_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extensions_author_id ON public.extensions USING btree (author_id);


--
-- Name: idx_extensions_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extensions_category ON public.extensions USING btree (category);


--
-- Name: idx_extensions_downloads; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extensions_downloads ON public.extensions USING btree (downloads DESC);


--
-- Name: idx_extensions_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extensions_is_active ON public.extensions USING btree (is_active);


--
-- Name: idx_extensions_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_extensions_rating ON public.extensions USING btree (rating DESC);


--
-- Name: idx_files_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_created_at ON public.files USING btree (created_at DESC);


--
-- Name: idx_files_in_vault; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_in_vault ON public.files USING btree (user_id, in_vault) WHERE (in_vault = true);


--
-- Name: idx_files_is_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_is_deleted ON public.files USING btree (is_deleted) WHERE (is_deleted = false);


--
-- Name: idx_files_parent_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_parent_folder ON public.files USING btree (parent_folder);


--
-- Name: idx_files_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_user_id ON public.files USING btree (user_id);


--
-- Name: idx_files_user_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_user_workspace ON public.files USING btree (user_id, workspace_id);


--
-- Name: idx_folders_user_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_folders_user_workspace ON public.folders USING btree (user_id, workspace_id);


--
-- Name: idx_folders_user_workspace_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_folders_user_workspace_provider ON public.folders USING btree (user_id, workspace_id, storage_provider_id);


--
-- Name: idx_installed_extensions_extension_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installed_extensions_extension_id ON public.installed_extensions USING btree (extension_id);


--
-- Name: idx_installed_extensions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installed_extensions_user_id ON public.installed_extensions USING btree (user_id);


--
-- Name: idx_key_access_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_key_access_logs_user_created ON public.key_access_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_kza_banned_entities_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kza_banned_entities_ip ON public.kza_banned_entities USING btree (ip_address);


--
-- Name: idx_kza_banned_entities_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kza_banned_entities_user_id ON public.kza_banned_entities USING btree (user_id);


--
-- Name: idx_kza_threat_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kza_threat_events_created_at ON public.kza_threat_events USING btree (created_at);


--
-- Name: idx_kza_threat_events_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kza_threat_events_ip ON public.kza_threat_events USING btree (ip_address);


--
-- Name: idx_kza_threat_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kza_threat_events_user_id ON public.kza_threat_events USING btree (user_id);


--
-- Name: idx_maintenance_schedules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maintenance_schedules_active ON public.maintenance_schedules USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_maintenance_schedules_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maintenance_schedules_created_by ON public.maintenance_schedules USING btree (created_by);


--
-- Name: idx_maintenance_schedules_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maintenance_schedules_scheduled ON public.maintenance_schedules USING btree (scheduled_for) WHERE (scheduled_for IS NOT NULL);


--
-- Name: idx_master_keys_user_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_master_keys_user_version ON public.master_keys USING btree (user_id, key_version DESC);


--
-- Name: idx_media_playback_logs_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_logs_event_type ON public.media_playback_logs USING btree (event_type);


--
-- Name: idx_media_playback_logs_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_logs_session ON public.media_playback_logs USING btree (session_id);


--
-- Name: idx_media_playback_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_logs_timestamp ON public.media_playback_logs USING btree ("timestamp");


--
-- Name: idx_media_playback_logs_user_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_playback_logs_user_file ON public.media_playback_logs USING btree (user_id, file_id);


--
-- Name: idx_pdf_secure_urls_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pdf_secure_urls_expires ON public.pdf_secure_urls USING btree (expires_at);


--
-- Name: idx_pdf_secure_urls_file_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pdf_secure_urls_file_user ON public.pdf_secure_urls USING btree (file_id, user_id);


--
-- Name: idx_pin_attempts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pin_attempts_created_at ON public.pin_attempt_logs USING btree (created_at DESC);


--
-- Name: idx_pin_attempts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pin_attempts_user_id ON public.pin_attempt_logs USING btree (user_id);


--
-- Name: idx_pin_operation_auth_user_operation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pin_operation_auth_user_operation ON public.pin_operation_authorizations USING btree (user_id, operation_type, authorized_until DESC);


--
-- Name: idx_playback_resume_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playback_resume_updated_at ON public.playback_resume USING btree (updated_at);


--
-- Name: idx_playback_resume_user_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playback_resume_user_file ON public.playback_resume USING btree (user_id, file_id);


--
-- Name: idx_repositories_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repositories_account_id ON public.repositories USING btree (account_id);


--
-- Name: idx_repositories_health; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repositories_health ON public.repositories USING btree (health_status, last_health_check);


--
-- Name: idx_repositories_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_repositories_usage ON public.repositories USING btree (last_used);


--
-- Name: idx_security_settings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_settings_user_id ON public.user_security_settings USING btree (user_id);


--
-- Name: idx_share_audit_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_audit_created_at ON public.share_audit_logs USING btree (created_at DESC);


--
-- Name: idx_share_audit_share_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_audit_share_id ON public.share_audit_logs USING btree (share_id);


--
-- Name: idx_support_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_created_at ON public.support_messages USING btree (created_at);


--
-- Name: idx_support_messages_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_ticket_id ON public.support_messages USING btree (ticket_id);


--
-- Name: idx_support_tickets_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_created_at ON public.support_tickets USING btree (created_at);


--
-- Name: idx_support_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);


--
-- Name: idx_support_tickets_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_user_id ON public.support_tickets USING btree (user_id);


--
-- Name: idx_transcode_jobs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transcode_jobs_created_at ON public.transcode_jobs USING btree (created_at);


--
-- Name: idx_transcode_jobs_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transcode_jobs_file_id ON public.transcode_jobs USING btree (file_id);


--
-- Name: idx_transcode_jobs_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transcode_jobs_priority ON public.transcode_jobs USING btree (priority);


--
-- Name: idx_transcode_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transcode_jobs_status ON public.transcode_jobs USING btree (status);


--
-- Name: idx_transcode_jobs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transcode_jobs_user_id ON public.transcode_jobs USING btree (user_id);


--
-- Name: idx_upload_stats_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_stats_account_id ON public.upload_stats USING btree (account_id);


--
-- Name: idx_upload_stats_success; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_stats_success ON public.upload_stats USING btree (success);


--
-- Name: idx_upload_stats_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_stats_timestamp ON public.upload_stats USING btree (upload_timestamp);


--
-- Name: idx_upload_stats_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_stats_user_id ON public.upload_stats USING btree (user_id);


--
-- Name: idx_user_passkeys_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_passkeys_email ON public.user_passkeys USING btree (email);


--
-- Name: idx_user_passkeys_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_passkeys_user_id ON public.user_passkeys USING btree (user_id);


--
-- Name: idx_user_terms_acceptance_user_versions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_terms_acceptance_user_versions ON public.user_terms_acceptance USING btree (user_id, terms_version, privacy_version);


--
-- Name: idx_vault_files_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vault_files_file_id ON public.vault_files USING btree (file_id);


--
-- Name: idx_vault_files_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vault_files_user_id ON public.vault_files USING btree (user_id);


--
-- Name: idx_vault_files_vault_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vault_files_vault_id ON public.vault_files USING btree (vault_id);


--
-- Name: idx_vaults_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vaults_user_id ON public.vaults USING btree (user_id);


--
-- Name: idx_video_processing_queue_job_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_processing_queue_job_type ON public.video_processing_queue USING btree (job_type);


--
-- Name: idx_video_processing_queue_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_processing_queue_priority ON public.video_processing_queue USING btree (priority);


--
-- Name: idx_video_processing_queue_scheduled_for; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_processing_queue_scheduled_for ON public.video_processing_queue USING btree (scheduled_for);


--
-- Name: idx_video_processing_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_processing_queue_status ON public.video_processing_queue USING btree (status);


--
-- Name: idx_video_quality_metrics_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_quality_metrics_session ON public.video_quality_metrics USING btree (session_id);


--
-- Name: idx_video_quality_metrics_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_quality_metrics_timestamp ON public.video_quality_metrics USING btree ("timestamp");


--
-- Name: idx_video_stream_sessions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_stream_sessions_created_at ON public.video_stream_sessions USING btree (created_at);


--
-- Name: idx_video_stream_sessions_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_stream_sessions_file ON public.video_stream_sessions USING btree (file_id);


--
-- Name: idx_video_stream_sessions_last_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_stream_sessions_last_activity ON public.video_stream_sessions USING btree (last_activity);


--
-- Name: idx_video_stream_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_stream_sessions_user ON public.video_stream_sessions USING btree (user_id);


--
-- Name: security_events_risk_level_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX security_events_risk_level_idx ON public.security_events USING btree (risk_level);


--
-- Name: security_events_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX security_events_timestamp_idx ON public.security_events USING btree ("timestamp");


--
-- Name: security_events_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX security_events_user_id_idx ON public.security_events USING btree (user_id);


--
-- Name: shares_share_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shares_share_id_idx ON public.shares USING btree (share_id);


--
-- Name: storage_providers_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_providers_user_id_idx ON public.storage_providers USING btree (user_id);


--
-- Name: storage_providers_user_provider_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX storage_providers_user_provider_type_idx ON public.storage_providers USING btree (user_id, provider_type);


--
-- Name: threat_alerts_severity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX threat_alerts_severity_idx ON public.threat_alerts USING btree (severity);


--
-- Name: threat_alerts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX threat_alerts_status_idx ON public.threat_alerts USING btree (status);


--
-- Name: threat_alerts_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX threat_alerts_user_id_idx ON public.threat_alerts USING btree (user_id);


--
-- Name: workspace_invites_invitee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_invites_invitee_idx ON public.workspace_invites USING btree (invitee_email);


--
-- Name: workspace_invites_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_invites_pending_idx ON public.workspace_invites USING btree (workspace_id, invitee_email) WHERE (status = 'pending'::text);


--
-- Name: workspace_invites_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_invites_token_hash_idx ON public.workspace_invites USING btree (token_hash);


--
-- Name: workspace_invites_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_invites_workspace_idx ON public.workspace_invites USING btree (workspace_id);


--
-- Name: workspace_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_members_user_idx ON public.workspace_members USING btree (user_id);


--
-- Name: workspace_members_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_members_workspace_idx ON public.workspace_members USING btree (workspace_id);


--
-- Name: workspace_members_workspace_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_members_workspace_role_idx ON public.workspace_members USING btree (workspace_id, role);


--
-- Name: workspace_presence_heartbeat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_presence_heartbeat_idx ON public.workspace_presence USING btree (workspace_id, last_heartbeat DESC);


--
-- Name: workspace_presence_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_presence_workspace_idx ON public.workspace_presence USING btree (workspace_id);


--
-- Name: workspaces_single_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspaces_single_default_idx ON public.workspaces USING btree (user_id) WHERE (is_default = true);


--
-- Name: workspaces_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspaces_user_id_idx ON public.workspaces USING btree (user_id);


--
-- Name: extensions extension_approval_change_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER extension_approval_change_trigger BEFORE UPDATE ON public.extensions FOR EACH ROW EXECUTE FUNCTION public.handle_extension_approval_change();


--
-- Name: files files_assign_workspace_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER files_assign_workspace_id BEFORE INSERT ON public.files FOR EACH ROW EXECUTE FUNCTION public.assign_workspace_id();


--
-- Name: folders folders_assign_workspace_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER folders_assign_workspace_id BEFORE INSERT ON public.folders FOR EACH ROW EXECUTE FUNCTION public.assign_workspace_id();


--
-- Name: kza_banned_entities kza_admin_ban_protection; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kza_admin_ban_protection BEFORE INSERT OR UPDATE ON public.kza_banned_entities FOR EACH ROW EXECUTE FUNCTION public.kza_block_admin_ban();


--
-- Name: installed_extensions log_extension_install_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_extension_install_trigger AFTER INSERT OR DELETE ON public.installed_extensions FOR EACH ROW EXECUTE FUNCTION public.log_extension_event();


--
-- Name: media_playback_logs playback_event_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER playback_event_notification AFTER INSERT ON public.media_playback_logs FOR EACH ROW EXECUTE FUNCTION public.notify_playback_event();


--
-- Name: profiles profiles_create_default_workspace; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_create_default_workspace AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_default_workspace_for_profile();


--
-- Name: system_settings system_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_system_settings_updated_at();


--
-- Name: transcode_jobs transcode_progress_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transcode_progress_notification AFTER UPDATE ON public.transcode_jobs FOR EACH ROW WHEN (((old.progress IS DISTINCT FROM new.progress) OR ((old.status)::text IS DISTINCT FROM (new.status)::text))) EXECUTE FUNCTION public.notify_transcode_progress();


--
-- Name: files trg_hash_file_encryption_key; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hash_file_encryption_key BEFORE INSERT OR UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.hash_file_encryption_key();


--
-- Name: master_keys trigger_update_master_keys_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_master_keys_updated_at BEFORE UPDATE ON public.master_keys FOR EACH ROW EXECUTE FUNCTION public.update_master_keys_updated_at();


--
-- Name: access_policies update_access_policies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_access_policies_updated_at BEFORE UPDATE ON public.access_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: archive_extractions update_archive_extractions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_archive_extractions_updated_at BEFORE UPDATE ON public.archive_extractions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: extension_ratings update_extension_rating_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_extension_rating_trigger AFTER INSERT OR DELETE OR UPDATE ON public.extension_ratings FOR EACH ROW EXECUTE FUNCTION public.update_extension_rating();


--
-- Name: files update_files_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: maintenance_mode update_maintenance_mode_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_maintenance_mode_updated_at BEFORE UPDATE ON public.maintenance_mode FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: maintenance_schedules update_maintenance_schedules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_maintenance_schedules_updated_at BEFORE UPDATE ON public.maintenance_schedules FOR EACH ROW EXECUTE FUNCTION public.update_maintenance_schedules_updated_at();


--
-- Name: migration_jobs update_migration_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_migration_jobs_updated_at BEFORE UPDATE ON public.migration_jobs FOR EACH ROW EXECUTE FUNCTION public.update_migration_updated_at_column();


--
-- Name: user_passkeys update_passkey_last_used_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_passkey_last_used_trigger BEFORE UPDATE ON public.user_passkeys FOR EACH ROW WHEN ((old.credential_id IS DISTINCT FROM new.credential_id)) EXECUTE FUNCTION public.update_passkey_last_used();


--
-- Name: squid_vaults update_squid_vault_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_squid_vault_timestamp BEFORE UPDATE ON public.squid_vaults FOR EACH ROW EXECUTE FUNCTION public.update_squid_vault_updated_at();


--
-- Name: support_tickets update_support_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transcode_jobs update_transcode_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_transcode_jobs_updated_at BEFORE UPDATE ON public.transcode_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_encryption_settings update_user_encryption_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_encryption_settings_updated_at BEFORE UPDATE ON public.user_encryption_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_security_settings update_user_security_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_security_settings_updated_at BEFORE UPDATE ON public.user_security_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: video_processing_queue update_video_processing_queue_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_video_processing_queue_updated_at BEFORE UPDATE ON public.video_processing_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: workspace_invites update_workspace_invites_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workspace_invites_updated_at BEFORE UPDATE ON public.workspace_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: workspace_members update_workspace_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workspace_members_updated_at BEFORE UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: workspace_presence update_workspace_presence_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workspace_presence_updated_at BEFORE UPDATE ON public.workspace_presence FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: workspaces workspaces_create_owner_member; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspaces_create_owner_member AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.create_workspace_owner_member();


--
-- Name: access_policies access_policies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_policies
    ADD CONSTRAINT access_policies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: account_changes account_changes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_changes
    ADD CONSTRAINT account_changes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admin_access_logs admin_access_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_access_logs
    ADD CONSTRAINT admin_access_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: analytics_events analytics_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: api_request_logs api_request_logs_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_request_logs
    ADD CONSTRAINT api_request_logs_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE CASCADE;


--
-- Name: api_request_logs api_request_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_request_logs
    ADD CONSTRAINT api_request_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: archive_extractions archive_extractions_source_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_extractions
    ADD CONSTRAINT archive_extractions_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: archive_extractions archive_extractions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_extractions
    ADD CONSTRAINT archive_extractions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: encrypted_keys encrypted_keys_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encrypted_keys
    ADD CONSTRAINT encrypted_keys_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: encrypted_keys encrypted_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encrypted_keys
    ADD CONSTRAINT encrypted_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: extension_analytics extension_analytics_extension_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_analytics
    ADD CONSTRAINT extension_analytics_extension_id_fkey FOREIGN KEY (extension_id) REFERENCES public.extensions(id) ON DELETE CASCADE;


--
-- Name: extension_analytics extension_analytics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_analytics
    ADD CONSTRAINT extension_analytics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: extension_approval_history extension_approval_history_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_approval_history
    ADD CONSTRAINT extension_approval_history_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id);


--
-- Name: extension_approval_history extension_approval_history_extension_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_approval_history
    ADD CONSTRAINT extension_approval_history_extension_id_fkey FOREIGN KEY (extension_id) REFERENCES public.extensions(id) ON DELETE CASCADE;


--
-- Name: extension_ratings extension_ratings_extension_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_ratings
    ADD CONSTRAINT extension_ratings_extension_id_fkey FOREIGN KEY (extension_id) REFERENCES public.extensions(id) ON DELETE CASCADE;


--
-- Name: extension_ratings extension_ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_ratings
    ADD CONSTRAINT extension_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: extensions extensions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extensions
    ADD CONSTRAINT extensions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- Name: extensions extensions_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extensions
    ADD CONSTRAINT extensions_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: file_request_submissions file_request_submissions_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_request_submissions
    ADD CONSTRAINT file_request_submissions_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: file_request_submissions file_request_submissions_file_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_request_submissions
    ADD CONSTRAINT file_request_submissions_file_request_id_fkey FOREIGN KEY (file_request_id) REFERENCES public.file_requests(id) ON DELETE CASCADE;


--
-- Name: file_requests file_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_requests
    ADD CONSTRAINT file_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: files files_storage_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_storage_provider_id_fkey FOREIGN KEY (storage_provider_id) REFERENCES public.storage_providers(id) ON DELETE SET NULL;


--
-- Name: files files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: files files_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: folders folders_storage_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_storage_provider_id_fkey FOREIGN KEY (storage_provider_id) REFERENCES public.storage_providers(id) ON DELETE SET NULL;


--
-- Name: folders folders_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: installed_extensions installed_extensions_extension_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_extensions
    ADD CONSTRAINT installed_extensions_extension_id_fkey FOREIGN KEY (extension_id) REFERENCES public.extensions(id) ON DELETE CASCADE;


--
-- Name: installed_extensions installed_extensions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installed_extensions
    ADD CONSTRAINT installed_extensions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: key_access_logs key_access_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_access_logs
    ADD CONSTRAINT key_access_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: kza_admin_incidents kza_admin_incidents_threat_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kza_admin_incidents
    ADD CONSTRAINT kza_admin_incidents_threat_event_id_fkey FOREIGN KEY (threat_event_id) REFERENCES public.kza_threat_events(id) ON DELETE SET NULL;


--
-- Name: login_sessions login_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_sessions
    ADD CONSTRAINT login_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: maintenance_schedules maintenance_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_schedules
    ADD CONSTRAINT maintenance_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: master_keys master_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_keys
    ADD CONSTRAINT master_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: media_playback_logs media_playback_logs_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_logs
    ADD CONSTRAINT media_playback_logs_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: media_playback_logs media_playback_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_playback_logs
    ADD CONSTRAINT media_playback_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: migration_logs migration_logs_migration_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_logs
    ADD CONSTRAINT migration_logs_migration_job_id_fkey FOREIGN KEY (migration_job_id) REFERENCES public.migration_jobs(id) ON DELETE CASCADE;


--
-- Name: partner_codes partner_codes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_codes
    ADD CONSTRAINT partner_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: partner_codes partner_codes_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_codes
    ADD CONSTRAINT partner_codes_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id);


--
-- Name: pdf_secure_urls pdf_secure_urls_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_secure_urls
    ADD CONSTRAINT pdf_secure_urls_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: pdf_secure_urls pdf_secure_urls_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_secure_urls
    ADD CONSTRAINT pdf_secure_urls_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pin_attempt_logs pin_attempt_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pin_attempt_logs
    ADD CONSTRAINT pin_attempt_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pin_operation_authorizations pin_operation_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pin_operation_authorizations
    ADD CONSTRAINT pin_operation_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: playback_resume playback_resume_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playback_resume
    ADD CONSTRAINT playback_resume_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: playback_resume playback_resume_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playback_resume
    ADD CONSTRAINT playback_resume_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: repositories repositories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT repositories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: security_events security_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: share_audit_logs share_audit_logs_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_audit_logs
    ADD CONSTRAINT share_audit_logs_share_id_fkey FOREIGN KEY (share_id) REFERENCES public.shares(share_id) ON DELETE CASCADE;


--
-- Name: share_collection_files share_collection_files_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_collection_files
    ADD CONSTRAINT share_collection_files_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.share_collections(id) ON DELETE CASCADE;


--
-- Name: share_collection_files share_collection_files_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_collection_files
    ADD CONSTRAINT share_collection_files_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: share_collections share_collections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_collections
    ADD CONSTRAINT share_collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: shares shares_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: shares shares_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shares
    ADD CONSTRAINT shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: squid_vaults squid_vaults_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squid_vaults
    ADD CONSTRAINT squid_vaults_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: storage_providers storage_providers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_providers
    ADD CONSTRAINT storage_providers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: support_messages support_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: threat_alerts threat_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.threat_alerts
    ADD CONSTRAINT threat_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: transcode_jobs transcode_jobs_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcode_jobs
    ADD CONSTRAINT transcode_jobs_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: transcode_jobs transcode_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcode_jobs
    ADD CONSTRAINT transcode_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: upload_stats upload_stats_repository_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_stats
    ADD CONSTRAINT upload_stats_repository_id_fkey FOREIGN KEY (repository_id) REFERENCES public.repositories(id) ON DELETE CASCADE;


--
-- Name: upload_stats upload_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_stats
    ADD CONSTRAINT upload_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_encryption_settings user_encryption_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_encryption_settings
    ADD CONSTRAINT user_encryption_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_passkeys user_passkeys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_passkeys
    ADD CONSTRAINT user_passkeys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_security_settings user_security_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_security_settings
    ADD CONSTRAINT user_security_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id);


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: user_terms_acceptance user_terms_acceptance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_terms_acceptance
    ADD CONSTRAINT user_terms_acceptance_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vault_files vault_files_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_files
    ADD CONSTRAINT vault_files_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: vault_files vault_files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_files
    ADD CONSTRAINT vault_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vault_files vault_files_vault_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_files
    ADD CONSTRAINT vault_files_vault_id_fkey FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE;


--
-- Name: vaults vaults_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vaults
    ADD CONSTRAINT vaults_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: video_processing_queue video_processing_queue_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_processing_queue
    ADD CONSTRAINT video_processing_queue_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: video_processing_queue video_processing_queue_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_processing_queue
    ADD CONSTRAINT video_processing_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: video_quality_metrics video_quality_metrics_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_quality_metrics
    ADD CONSTRAINT video_quality_metrics_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.video_stream_sessions(session_id) ON DELETE CASCADE;


--
-- Name: video_stream_sessions video_stream_sessions_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_stream_sessions
    ADD CONSTRAINT video_stream_sessions_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: video_stream_sessions video_stream_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_stream_sessions
    ADD CONSTRAINT video_stream_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workspace_invites workspace_invites_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: workspace_invites workspace_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workspace_invites workspace_invites_invitee_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_invitee_user_id_fkey FOREIGN KEY (invitee_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: workspace_invites workspace_invites_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: workspace_invites workspace_invites_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_presence workspace_presence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_presence
    ADD CONSTRAINT workspace_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workspace_presence workspace_presence_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_presence
    ADD CONSTRAINT workspace_presence_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspaces workspaces_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: extension_approval_history Admin can insert approval history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can insert approval history" ON public.extension_approval_history FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.api_keys
  WHERE ((api_keys.user_id = auth.uid()) AND (api_keys.key_prefix = 'cb_926d45e'::text) AND (api_keys.is_active = true)))));


--
-- Name: extensions Admin can update extension approval; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update extension approval" ON public.extensions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.api_keys
  WHERE ((api_keys.user_id = auth.uid()) AND (api_keys.key_prefix = 'cb_926d45e'::text) AND (api_keys.is_active = true)))));


--
-- Name: extension_approval_history Admin can view all approval history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can view all approval history" ON public.extension_approval_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.api_keys
  WHERE ((api_keys.user_id = auth.uid()) AND (api_keys.key_prefix = 'cb_926d45e'::text) AND (api_keys.is_active = true)))));


--
-- Name: maintenance_mode Admins can manage maintenance mode; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage maintenance mode" ON public.maintenance_mode USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));


--
-- Name: maintenance_schedules Admins can manage maintenance schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage maintenance schedules" ON public.maintenance_schedules USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));


--
-- Name: system_settings Admins can read system settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read system settings" ON public.system_settings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));


--
-- Name: system_settings Admins can update system settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update system settings" ON public.system_settings TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));


--
-- Name: files Allow public access to public files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public access to public files" ON public.files FOR SELECT USING ((is_public = true));


--
-- Name: folders Allow public access to public folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public access to public folders" ON public.folders FOR SELECT USING ((is_public = true));


--
-- Name: files Allow public access to shared files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public access to shared files" ON public.files FOR SELECT TO authenticated, anon USING (((EXISTS ( SELECT 1
   FROM public.shares
  WHERE ((shares.file_id = files.id) AND (shares.share_id IS NOT NULL) AND ((shares.expires_at IS NULL) OR (shares.expires_at > now())) AND (COALESCE(shares.is_active, true) = true)))) OR (auth.uid() = user_id)));


--
-- Name: shares Allow public access to shares by share_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public access to shares by share_id" ON public.shares FOR SELECT TO authenticated, anon USING (((share_id IS NOT NULL) AND ((expires_at IS NULL) OR (expires_at > now())) AND (COALESCE(is_active, true) = true) AND ((share_type = 'public'::text) OR ((auth.uid() IS NOT NULL) AND (share_type = 'user_specific'::text) AND ((auth.uid())::text = ANY (allowed_users))))));


--
-- Name: file_request_submissions Anyone can insert submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert submissions" ON public.file_request_submissions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.file_requests
  WHERE ((file_requests.id = file_request_submissions.file_request_id) AND (file_requests.is_active = true) AND ((file_requests.expires_at IS NULL) OR (file_requests.expires_at > now()))))));


--
-- Name: file_requests Anyone can read active file requests by slug; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active file requests by slug" ON public.file_requests FOR SELECT USING (((is_active = true) AND ((expires_at IS NULL) OR (expires_at > now()))));


--
-- Name: system_settings Anyone can read maintenance mode; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read maintenance mode" ON public.system_settings FOR SELECT TO authenticated, anon USING ((setting_key = 'maintenance_mode'::text));


--
-- Name: partner_codes Anyone can read partner codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read partner codes" ON public.partner_codes FOR SELECT USING (true);


--
-- Name: subscriptions Anyone can view subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view subscriptions" ON public.subscriptions FOR SELECT USING (true);


--
-- Name: partner_codes Authenticated users can create partner codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create partner codes" ON public.partner_codes FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));


--
-- Name: extension_analytics Extension authors can view analytics for their extensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Extension authors can view analytics for their extensions" ON public.extension_analytics FOR SELECT USING ((auth.uid() IN ( SELECT extensions.author_id
   FROM public.extensions
  WHERE (extensions.id = extension_analytics.extension_id))));


--
-- Name: extension_ratings Extension ratings are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Extension ratings are viewable by everyone" ON public.extension_ratings FOR SELECT USING (true);


--
-- Name: admin_access_logs No public access to admin logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No public access to admin logs" ON public.admin_access_logs USING (false) WITH CHECK (false);


--
-- Name: workspaces Owners can delete workspaces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete workspaces" ON public.workspaces FOR DELETE USING (((auth.uid() = user_id) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: workspaces Owners can update workspaces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can update workspaces" ON public.workspaces FOR UPDATE USING (((auth.uid() = user_id) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true))) WITH CHECK (((auth.uid() = user_id) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: share_audit_logs Owners can view own share audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can view own share audit logs" ON public.share_audit_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.shares s
  WHERE ((s.share_id = share_audit_logs.share_id) AND (s.user_id = auth.uid())))));


--
-- Name: share_audit_logs Public can insert share audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can insert share audit logs" ON public.share_audit_logs FOR INSERT TO authenticated, anon WITH CHECK ((EXISTS ( SELECT 1
   FROM public.shares s
  WHERE (s.share_id = share_audit_logs.share_id))));


--
-- Name: extensions Public extensions are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public extensions are viewable by everyone" ON public.extensions FOR SELECT USING ((((is_active = true) AND (approval = 'approved'::text)) OR (auth.uid() = author_id) OR (EXISTS ( SELECT 1
   FROM public.api_keys
  WHERE ((api_keys.user_id = auth.uid()) AND (api_keys.key_prefix = 'cb_926d45e'::text) AND (api_keys.is_active = true))))));


--
-- Name: kza_admin_incidents Service role only access to kza_admin_incidents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only access to kza_admin_incidents" ON public.kza_admin_incidents USING (false) WITH CHECK (false);


--
-- Name: kza_banned_entities Service role only access to kza_banned_entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only access to kza_banned_entities" ON public.kza_banned_entities USING (false) WITH CHECK (false);


--
-- Name: kza_honeypot_hits Service role only access to kza_honeypot_hits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only access to kza_honeypot_hits" ON public.kza_honeypot_hits USING (false) WITH CHECK (false);


--
-- Name: kza_linked_accounts Service role only access to kza_linked_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only access to kza_linked_accounts" ON public.kza_linked_accounts USING (false) WITH CHECK (false);


--
-- Name: kza_phantom_assets Service role only access to kza_phantom_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only access to kza_phantom_assets" ON public.kza_phantom_assets USING (false) WITH CHECK (false);


--
-- Name: kza_threat_events Service role only access to kza_threat_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only access to kza_threat_events" ON public.kza_threat_events USING (false) WITH CHECK (false);


--
-- Name: kza_user_profiles Service role only access to kza_user_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only access to kza_user_profiles" ON public.kza_user_profiles USING (false) WITH CHECK (false);


--
-- Name: video_quality_metrics Users can access own quality metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can access own quality metrics" ON public.video_quality_metrics FOR SELECT USING ((session_id IN ( SELECT video_stream_sessions.session_id
   FROM public.video_stream_sessions
  WHERE (video_stream_sessions.user_id = auth.uid()))));


--
-- Name: video_processing_queue Users can create own processing jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own processing jobs" ON public.video_processing_queue FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: storage_providers Users can create own storage providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own storage providers" ON public.storage_providers FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: transcode_jobs Users can create own transcode jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own transcode jobs" ON public.transcode_jobs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: shares Users can create shares for their files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create shares for their files" ON public.shares FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.files
  WHERE ((files.id = shares.file_id) AND (files.user_id = auth.uid()))))));


--
-- Name: api_keys Users can create their own API keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own API keys" ON public.api_keys FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: downloads Users can create their own downloads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own downloads" ON public.downloads FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: files Users can create their own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own files" ON public.files FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: migration_jobs Users can create their own migration jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own migration jobs" ON public.migration_jobs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: repositories Users can create their own repositories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own repositories" ON public.repositories FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: shares Users can create their own shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own shares" ON public.shares FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: squid_vaults Users can create their own vault; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own vault" ON public.squid_vaults FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: workspaces Users can create workspaces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create workspaces" ON public.workspaces FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: archive_extractions Users can delete own archive extractions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own archive extractions" ON public.archive_extractions FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: files Users can delete own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own files" ON public.files FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: pin_operation_authorizations Users can delete own pin operation authorizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own pin operation authorizations" ON public.pin_operation_authorizations FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: share_collection_files Users can delete own share collection files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own share collection files" ON public.share_collection_files FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.share_collections sc
  WHERE ((sc.id = share_collection_files.collection_id) AND (sc.user_id = auth.uid())))));


--
-- Name: share_collections Users can delete own share collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own share collections" ON public.share_collections FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: storage_providers Users can delete own storage providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own storage providers" ON public.storage_providers FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: api_keys Users can delete their own API keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own API keys" ON public.api_keys FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: downloads Users can delete their own downloads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own downloads" ON public.downloads FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: extensions Users can delete their own extensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own extensions" ON public.extensions FOR DELETE USING ((auth.uid() = author_id));


--
-- Name: login_sessions Users can delete their own login sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own login sessions" ON public.login_sessions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_passkeys Users can delete their own passkeys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own passkeys" ON public.user_passkeys FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: extension_ratings Users can delete their own ratings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own ratings" ON public.extension_ratings FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: shares Users can delete their own shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own shares" ON public.shares FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: squid_vaults Users can delete their own vault; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own vault" ON public.squid_vaults FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: support_messages Users can insert messages for their tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert messages for their tickets" ON public.support_messages FOR INSERT WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.support_tickets
  WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid()))))));


--
-- Name: pin_attempt_logs Users can insert own PIN attempt logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own PIN attempt logs" ON public.pin_attempt_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: account_health_logs Users can insert own account health logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own account health logs" ON public.account_health_logs FOR INSERT TO authenticated WITH CHECK ((account_id = auth.uid()));


--
-- Name: analytics_events Users can insert own analytics events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own analytics events" ON public.analytics_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: archive_extractions Users can insert own archive extractions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own archive extractions" ON public.archive_extractions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: audit_logs Users can insert own audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own audit logs" ON public.audit_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: files Users can insert own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own files" ON public.files FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: pin_operation_authorizations Users can insert own pin operation authorizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own pin operation authorizations" ON public.pin_operation_authorizations FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: media_playback_logs Users can insert own playback logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own playback logs" ON public.media_playback_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: video_quality_metrics Users can insert own quality metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own quality metrics" ON public.video_quality_metrics FOR INSERT WITH CHECK ((session_id IN ( SELECT video_stream_sessions.session_id
   FROM public.video_stream_sessions
  WHERE (video_stream_sessions.user_id = auth.uid()))));


--
-- Name: security_events Users can insert own security events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own security events" ON public.security_events FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_security_settings Users can insert own security settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own security settings" ON public.user_security_settings FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: share_collection_files Users can insert own share collection files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own share collection files" ON public.share_collection_files FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.share_collections sc
  WHERE ((sc.id = share_collection_files.collection_id) AND (sc.user_id = auth.uid())))));


--
-- Name: share_collections Users can insert own share collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own share collections" ON public.share_collections FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: api_request_logs Users can insert their own API request logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own API request logs" ON public.api_request_logs FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: account_changes Users can insert their own account changes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own account changes" ON public.account_changes FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: extension_analytics Users can insert their own extension analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own extension analytics" ON public.extension_analytics FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: extensions Users can insert their own extensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own extensions" ON public.extensions FOR INSERT WITH CHECK ((auth.uid() = author_id));


--
-- Name: key_access_logs Users can insert their own key access logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own key access logs" ON public.key_access_logs FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: login_sessions Users can insert their own login sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own login sessions" ON public.login_sessions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: migration_logs Users can insert their own migration logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own migration logs" ON public.migration_logs FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_passkeys Users can insert their own passkeys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own passkeys" ON public.user_passkeys FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: extension_ratings Users can insert their own ratings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own ratings" ON public.extension_ratings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_terms_acceptance Users can insert their own terms acceptance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own terms acceptance" ON public.user_terms_acceptance FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: threat_alerts Users can insert their own threat alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own threat alerts" ON public.threat_alerts FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: support_tickets Users can insert their own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own tickets" ON public.support_tickets FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: installed_extensions Users can install extensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can install extensions" ON public.installed_extensions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: access_policies Users can manage own access policies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own access policies" ON public.access_policies USING ((auth.uid() = user_id));


--
-- Name: encrypted_keys Users can manage own encrypted keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own encrypted keys" ON public.encrypted_keys USING ((auth.uid() = user_id));


--
-- Name: user_encryption_settings Users can manage own encryption settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own encryption settings" ON public.user_encryption_settings USING ((auth.uid() = user_id));


--
-- Name: file_requests Users can manage own file requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own file requests" ON public.file_requests USING ((user_id = auth.uid()));


--
-- Name: master_keys Users can manage own master keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own master keys" ON public.master_keys USING ((auth.uid() = user_id));


--
-- Name: playback_resume Users can manage own resume positions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own resume positions" ON public.playback_resume USING ((auth.uid() = user_id));


--
-- Name: video_stream_sessions Users can manage own stream sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own stream sessions" ON public.video_stream_sessions USING ((auth.uid() = user_id));


--
-- Name: vault_files Users can manage own vault files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own vault files" ON public.vault_files USING ((auth.uid() = user_id));


--
-- Name: vaults Users can manage own vaults; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own vaults" ON public.vaults USING ((auth.uid() = user_id));


--
-- Name: pdf_secure_urls Users can manage their own PDF secure URLs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own PDF secure URLs" ON public.pdf_secure_urls USING ((auth.uid() = user_id));


--
-- Name: storage_providers Users can manage their own storage providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own storage providers" ON public.storage_providers USING ((auth.uid() = user_id));


--
-- Name: files Users can read own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own files" ON public.files FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can read own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: shares Users can read their own shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own shares" ON public.shares FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: installed_extensions Users can uninstall their extensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can uninstall their extensions" ON public.installed_extensions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: archive_extractions Users can update own archive extractions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own archive extractions" ON public.archive_extractions FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: files Users can update own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own files" ON public.files FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile (restricted); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile (restricted)" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK (((auth.uid() = id) AND (is_admin = ( SELECT profiles_1.is_admin
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid()))) AND (is_premium = ( SELECT profiles_1.is_premium
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid())))));


--
-- Name: user_security_settings Users can update own security settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own security settings" ON public.user_security_settings FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: share_collections Users can update own share collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own share collections" ON public.share_collections FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: storage_providers Users can update own storage providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own storage providers" ON public.storage_providers FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: transcode_jobs Users can update own transcode jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own transcode jobs" ON public.transcode_jobs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: installed_extensions Users can update their installed extensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their installed extensions" ON public.installed_extensions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: api_keys Users can update their own API keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own API keys" ON public.api_keys FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: downloads Users can update their own downloads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own downloads" ON public.downloads FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: extensions Users can update their own extensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own extensions" ON public.extensions FOR UPDATE USING ((auth.uid() = author_id));


--
-- Name: login_sessions Users can update their own login sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own login sessions" ON public.login_sessions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: migration_jobs Users can update their own migration jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own migration jobs" ON public.migration_jobs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_passkeys Users can update their own passkeys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own passkeys" ON public.user_passkeys FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: extension_ratings Users can update their own ratings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own ratings" ON public.extension_ratings FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: shares Users can update their own shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own shares" ON public.shares FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_terms_acceptance Users can update their own terms acceptance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own terms acceptance" ON public.user_terms_acceptance FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: support_tickets Users can update their own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own tickets" ON public.support_tickets FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: squid_vaults Users can update their own vault; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own vault" ON public.squid_vaults FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: support_messages Users can view messages for their tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages for their tickets" ON public.support_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.support_tickets
  WHERE ((support_tickets.id = support_messages.ticket_id) AND (support_tickets.user_id = auth.uid())))));


--
-- Name: pin_attempt_logs Users can view own PIN attempt logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own PIN attempt logs" ON public.pin_attempt_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: account_health_logs Users can view own account health logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own account health logs" ON public.account_health_logs FOR SELECT TO authenticated USING ((account_id = auth.uid()));


--
-- Name: analytics_events Users can view own analytics events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own analytics events" ON public.analytics_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: archive_extractions Users can view own archive extractions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own archive extractions" ON public.archive_extractions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: audit_logs Users can view own audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own audit logs" ON public.audit_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: key_access_logs Users can view own key access logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own key access logs" ON public.key_access_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: pin_operation_authorizations Users can view own pin operation authorizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own pin operation authorizations" ON public.pin_operation_authorizations FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: media_playback_logs Users can view own playback logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own playback logs" ON public.media_playback_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: video_processing_queue Users can view own processing jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own processing jobs" ON public.video_processing_queue FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: security_events Users can view own security events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own security events" ON public.security_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_security_settings Users can view own security settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own security settings" ON public.user_security_settings FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: share_collection_files Users can view own share collection files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own share collection files" ON public.share_collection_files FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.share_collections sc
  WHERE ((sc.id = share_collection_files.collection_id) AND (sc.user_id = auth.uid())))));


--
-- Name: share_collections Users can view own share collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own share collections" ON public.share_collections FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: storage_providers Users can view own storage providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own storage providers" ON public.storage_providers FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: transcode_jobs Users can view own transcode jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own transcode jobs" ON public.transcode_jobs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: file_request_submissions Users can view submissions for own file requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view submissions for own file requests" ON public.file_request_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.file_requests
  WHERE ((file_requests.id = file_request_submissions.file_request_id) AND (file_requests.user_id = auth.uid())))));


--
-- Name: installed_extensions Users can view their installed extensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their installed extensions" ON public.installed_extensions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: api_keys Users can view their own API keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own API keys" ON public.api_keys FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: api_request_logs Users can view their own API request logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own API request logs" ON public.api_request_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: account_changes Users can view their own account changes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own account changes" ON public.account_changes FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: downloads Users can view their own downloads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own downloads" ON public.downloads FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: login_sessions Users can view their own login sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own login sessions" ON public.login_sessions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: migration_jobs Users can view their own migration jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own migration jobs" ON public.migration_jobs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: migration_logs Users can view their own migration logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own migration logs" ON public.migration_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_passkeys Users can view their own passkeys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own passkeys" ON public.user_passkeys FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: repositories Users can view their own repositories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own repositories" ON public.repositories FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: shares Users can view their own shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own shares" ON public.shares FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_terms_acceptance Users can view their own terms acceptance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own terms acceptance" ON public.user_terms_acceptance FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: support_tickets Users can view their own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own tickets" ON public.support_tickets FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: upload_stats Users can view their own upload stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own upload stats" ON public.upload_stats FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: squid_vaults Users can view their own vault; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own vault" ON public.squid_vaults FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_subscriptions Users can view their subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their subscriptions" ON public.user_subscriptions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: threat_alerts Users can view threat alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view threat alerts" ON public.threat_alerts FOR SELECT USING (((auth.uid() = user_id) OR (user_id IS NULL)));


--
-- Name: user_preferences Users manage own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own preferences" ON public.user_preferences USING ((auth.uid() = user_id));


--
-- Name: workspace_members Workspace admins can insert members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace admins can insert members" ON public.workspace_members FOR INSERT WITH CHECK ((public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: workspace_invites Workspace admins can manage invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace admins can manage invites" ON public.workspace_invites USING ((public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true))) WITH CHECK ((public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: workspace_members Workspace admins can update members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace admins can update members" ON public.workspace_members FOR UPDATE USING ((public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true))) WITH CHECK ((public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: files Workspace members can delete files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can delete files" ON public.files FOR DELETE USING ((public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (public.has_workspace_role(workspace_id, auth.uid(), 'editor'::public.workspace_role) AND (auth.uid() = user_id)) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: folders Workspace members can delete folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can delete folders" ON public.folders FOR DELETE USING ((public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (public.has_workspace_role(workspace_id, auth.uid(), 'editor'::public.workspace_role) AND (auth.uid() = user_id)) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: workspace_members Workspace members can delete membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can delete membership" ON public.workspace_members FOR DELETE USING (((auth.uid() = user_id) OR public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: workspace_presence Workspace members can delete presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can delete presence" ON public.workspace_presence FOR DELETE USING (((auth.uid() = user_id) OR public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: files Workspace members can insert files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can insert files" ON public.files FOR INSERT WITH CHECK ((((auth.uid() = user_id) AND public.has_workspace_role(workspace_id, auth.uid(), 'editor'::public.workspace_role)) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: folders Workspace members can insert folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can insert folders" ON public.folders FOR INSERT WITH CHECK ((((auth.uid() = user_id) AND public.has_workspace_role(workspace_id, auth.uid(), 'editor'::public.workspace_role)) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: workspace_presence Workspace members can insert presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can insert presence" ON public.workspace_presence FOR INSERT WITH CHECK (((auth.uid() = user_id) AND public.has_workspace_role(workspace_id, auth.uid(), 'viewer'::public.workspace_role)));


--
-- Name: files Workspace members can update files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can update files" ON public.files FOR UPDATE USING ((public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (public.has_workspace_role(workspace_id, auth.uid(), 'editor'::public.workspace_role) AND (auth.uid() = user_id)) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true))) WITH CHECK ((public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (public.has_workspace_role(workspace_id, auth.uid(), 'editor'::public.workspace_role) AND (auth.uid() = user_id)) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: folders Workspace members can update folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can update folders" ON public.folders FOR UPDATE USING ((public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (public.has_workspace_role(workspace_id, auth.uid(), 'editor'::public.workspace_role) AND (auth.uid() = user_id)) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true))) WITH CHECK ((public.has_workspace_role(workspace_id, auth.uid(), 'admin'::public.workspace_role) OR (public.has_workspace_role(workspace_id, auth.uid(), 'editor'::public.workspace_role) AND (auth.uid() = user_id)) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: workspace_presence Workspace members can update presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can update presence" ON public.workspace_presence FOR UPDATE USING (((auth.uid() = user_id) AND public.has_workspace_role(workspace_id, auth.uid(), 'viewer'::public.workspace_role))) WITH CHECK (((auth.uid() = user_id) AND public.has_workspace_role(workspace_id, auth.uid(), 'viewer'::public.workspace_role)));


--
-- Name: files Workspace members can view files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can view files" ON public.files FOR SELECT USING ((public.has_workspace_role(workspace_id, auth.uid(), 'viewer'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: folders Workspace members can view folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can view folders" ON public.folders FOR SELECT USING ((public.has_workspace_role(workspace_id, auth.uid(), 'viewer'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: workspace_members Workspace members can view membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can view membership" ON public.workspace_members FOR SELECT USING ((public.has_workspace_role(workspace_id, auth.uid(), 'viewer'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: workspace_presence Workspace members can view presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can view presence" ON public.workspace_presence FOR SELECT USING ((public.has_workspace_role(workspace_id, auth.uid(), 'viewer'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: workspaces Workspace members can view workspaces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workspace members can view workspaces" ON public.workspaces FOR SELECT USING (((auth.uid() = user_id) OR public.has_workspace_role(id, auth.uid(), 'viewer'::public.workspace_role) OR (COALESCE(( SELECT profiles.is_admin
   FROM public.profiles
  WHERE (profiles.id = auth.uid())), false) = true)));


--
-- Name: access_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: account_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: account_health_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_health_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_access_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_access_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: api_request_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: archive_extractions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.archive_extractions ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: downloads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;

--
-- Name: encrypted_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.encrypted_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: extension_analytics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: extension_approval_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_approval_history ENABLE ROW LEVEL SECURITY;

--
-- Name: extension_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: extensions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extensions ENABLE ROW LEVEL SECURITY;

--
-- Name: file_request_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.file_request_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: file_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.file_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

--
-- Name: files files_select_shared; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY files_select_shared ON public.files FOR SELECT USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.shares s
  WHERE ((s.file_id = files.id) AND (s.share_type = 'public'::text) AND ((s.expires_at IS NULL) OR (s.expires_at > now()))))) OR ((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.shares s
  WHERE ((s.file_id = files.id) AND (s.share_type = 'user_specific'::text) AND ((s.expires_at IS NULL) OR (s.expires_at > now())) AND ((auth.uid())::text = ANY (s.allowed_users))))))));


--
-- Name: folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

--
-- Name: installed_extensions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.installed_extensions ENABLE ROW LEVEL SECURITY;

--
-- Name: key_access_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.key_access_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: kza_admin_incidents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kza_admin_incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: kza_banned_entities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kza_banned_entities ENABLE ROW LEVEL SECURITY;

--
-- Name: kza_honeypot_hits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kza_honeypot_hits ENABLE ROW LEVEL SECURITY;

--
-- Name: kza_linked_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kza_linked_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: kza_phantom_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kza_phantom_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: kza_threat_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kza_threat_events ENABLE ROW LEVEL SECURITY;

--
-- Name: kza_user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kza_user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: login_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: maintenance_mode; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.maintenance_mode ENABLE ROW LEVEL SECURITY;

--
-- Name: maintenance_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: master_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.master_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: media_playback_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_playback_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: migration_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.migration_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: migration_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.migration_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: pdf_secure_urls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pdf_secure_urls ENABLE ROW LEVEL SECURITY;

--
-- Name: pin_attempt_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pin_attempt_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: pin_operation_authorizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pin_operation_authorizations ENABLE ROW LEVEL SECURITY;

--
-- Name: playback_resume; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.playback_resume ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: repositories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;

--
-- Name: security_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

--
-- Name: security_keyring; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.security_keyring ENABLE ROW LEVEL SECURITY;

--
-- Name: share_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: share_collection_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_collection_files ENABLE ROW LEVEL SECURITY;

--
-- Name: share_collections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_collections ENABLE ROW LEVEL SECURITY;

--
-- Name: shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

--
-- Name: shares shares_select_user_specific; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shares_select_user_specific ON public.shares FOR SELECT USING (((share_type = 'user_specific'::text) AND ((expires_at IS NULL) OR (expires_at > now())) AND (auth.uid() IS NOT NULL) AND ((auth.uid())::text = ANY (allowed_users))));


--
-- Name: squid_vaults; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.squid_vaults ENABLE ROW LEVEL SECURITY;

--
-- Name: storage_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storage_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: support_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: threat_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.threat_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: transcode_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transcode_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: upload_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.upload_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: user_encryption_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_encryption_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_passkeys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_security_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_security_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_terms_acceptance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_terms_acceptance ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vault_files ENABLE ROW LEVEL SECURITY;

--
-- Name: vaults; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;

--
-- Name: video_processing_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_processing_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: video_quality_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_quality_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: video_stream_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_stream_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_presence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 40o5gAZ9u66l9Km4j5Qr904Qba8q3W7IKScDI2ebeqeHlgi36fVUK88QM0JNyJp

