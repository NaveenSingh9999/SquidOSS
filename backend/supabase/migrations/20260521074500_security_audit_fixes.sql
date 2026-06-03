-- Security audit fixes: RLS hardening, encrypted secrets, and RPC permissions

-- Enable pgsodium for server-side key wrapping
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Keyring for server-managed secrets
CREATE TABLE IF NOT EXISTS public.security_keyring (
  name TEXT PRIMARY KEY,
  key_id UUID NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.security_keyring WHERE name = 'storage_provider_credentials'
  ) THEN
    INSERT INTO public.security_keyring (name, key_id)
    VALUES ('storage_provider_credentials', (SELECT (pgsodium.create_key()).key_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.security_keyring WHERE name = 'file_encryption_keys'
  ) THEN
    INSERT INTO public.security_keyring (name, key_id)
    VALUES ('file_encryption_keys', (SELECT (pgsodium.create_key()).key_id));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.encrypt_keyring_secret(
  p_key_name TEXT,
  p_plaintext TEXT
)
RETURNS TABLE(ciphertext TEXT, nonce TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_id UUID;
  v_nonce BYTEA := gen_random_bytes(24);
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

CREATE OR REPLACE FUNCTION public.decrypt_keyring_secret(
  p_key_name TEXT,
  p_ciphertext TEXT,
  p_nonce TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_id UUID;
  v_plain BYTEA;
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

REVOKE EXECUTE ON FUNCTION public.encrypt_keyring_secret(TEXT, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_keyring_secret(TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_keyring_secret(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_keyring_secret(TEXT, TEXT, TEXT) TO service_role;

-- Files table: ensure RLS with strict ownership
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own files" ON public.files;
DROP POLICY IF EXISTS "Users can insert their own files" ON public.files;
DROP POLICY IF EXISTS "Users can update their own files" ON public.files;
DROP POLICY IF EXISTS "Users can delete their own files" ON public.files;
DROP POLICY IF EXISTS "Users can read own files" ON public.files;
DROP POLICY IF EXISTS "Users can insert own files" ON public.files;
DROP POLICY IF EXISTS "Users can update own files" ON public.files;
DROP POLICY IF EXISTS "Users can delete own files" ON public.files;

CREATE POLICY "Users can read own files"
  ON public.files
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own files"
  ON public.files
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own files"
  ON public.files
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own files"
  ON public.files
  FOR DELETE
  USING (auth.uid() = user_id);

-- Store encrypted file keys separately (server-managed)
ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS encrypted_key TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_key_nonce TEXT,
  ADD COLUMN IF NOT EXISTS encryption_key_version INTEGER DEFAULT 1;

-- Profiles table: prevent self-escalation
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile (restricted)" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile (restricted)"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin = (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    AND is_premium = (SELECT is_premium FROM public.profiles WHERE id = auth.uid())
  );

-- Admin access logs: service role only
ALTER TABLE public.admin_access_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only admins can view admin access logs" ON public.admin_access_logs;
DROP POLICY IF EXISTS "No public access to admin logs" ON public.admin_access_logs;

CREATE POLICY "No public access to admin logs"
  ON public.admin_access_logs
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Restrict get_secret RPC to service_role only (if defined)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'get_secret'
      AND pg_function_is_visible(oid)
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.get_secret FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.get_secret FROM anon;
    GRANT EXECUTE ON FUNCTION public.get_secret TO service_role;
  END IF;
END $$;
