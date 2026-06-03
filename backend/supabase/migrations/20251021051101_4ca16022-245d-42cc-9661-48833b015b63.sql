-- Add salt column for hashing file encryption keys
ALTER TABLE public.files
ADD COLUMN IF NOT EXISTS encryption_key_salt text;

-- Create trigger function to hash or nullify encryption_key on insert/update
CREATE OR REPLACE FUNCTION public.hash_file_encryption_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If encryption_key is provided in plaintext, replace it with salted SHA-256 hash and store salt
  IF NEW.encryption_key IS NOT NULL AND length(trim(NEW.encryption_key)) > 0 THEN
    -- If it already looks hashed (prefixed), skip re-hashing
    IF position('sha256:' in NEW.encryption_key) = 1 THEN
      RETURN NEW;
    END IF;

    -- Generate salt
    NEW.encryption_key_salt := encode(gen_random_bytes(16), 'hex');
    -- Hash = sha256(encryption_key || salt)
    NEW.encryption_key := 'sha256:' || encode(digest(NEW.encryption_key || NEW.encryption_key_salt, 'sha256'), 'hex');
    NEW.encrypted := COALESCE(NEW.encrypted, true);
  ELSE
    -- Ensure no stray cleartext value remains
    NEW.encryption_key := NULL;
    NEW.encryption_key_salt := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to files table
DROP TRIGGER IF EXISTS trg_hash_file_encryption_key ON public.files;
CREATE TRIGGER trg_hash_file_encryption_key
BEFORE INSERT OR UPDATE ON public.files
FOR EACH ROW
EXECUTE FUNCTION public.hash_file_encryption_key();

-- Optional: add comment for documentation
COMMENT ON FUNCTION public.hash_file_encryption_key() IS 'Hashes files.encryption_key with a per-row salt before write to avoid storing plaintext keys.';
COMMENT ON COLUMN public.files.encryption_key_salt IS 'Per-row salt used to hash the (client) encryption_key. Plaintext keys are never stored.';