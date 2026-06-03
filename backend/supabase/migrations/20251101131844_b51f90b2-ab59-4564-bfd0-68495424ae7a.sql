-- 1) Ensure pgcrypto is installed in the extensions schema (Supabase default)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2) Provide/refresh a safe wrapper for gen_random_bytes in public
CREATE OR REPLACE FUNCTION public.gen_random_bytes(len integer)
RETURNS bytea
LANGUAGE sql
STABLE
AS $$ SELECT extensions.gen_random_bytes(len) $$;

-- 3) Fix the hashing trigger to reliably find pgcrypto functions
--    Use explicit search_path = public, extensions and proper text->bytea conversion
CREATE OR REPLACE FUNCTION public.hash_file_encryption_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
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
$function$;

-- 4) Ensure the trigger exists and points to the updated function
DROP TRIGGER IF EXISTS trg_hash_file_encryption_key ON public.files;
CREATE TRIGGER trg_hash_file_encryption_key
BEFORE INSERT OR UPDATE ON public.files
FOR EACH ROW
EXECUTE FUNCTION public.hash_file_encryption_key();

-- 5) Also fix any other functions using pgcrypto (e.g., crypt) by setting search_path
CREATE OR REPLACE FUNCTION public.verify_vault_password(p_user_id uuid, p_vault_name text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
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
$function$;