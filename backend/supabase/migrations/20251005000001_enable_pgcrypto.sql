-- Enable pgcrypto extension for secure random generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Recreate generate_api_key function to ensure it works
CREATE OR REPLACE FUNCTION public.generate_api_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.generate_api_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_api_key() TO service_role;
