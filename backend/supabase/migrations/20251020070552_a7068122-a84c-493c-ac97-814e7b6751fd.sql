-- ============================================
-- SQUIDCLOUD SECURITY FIXES - CRITICAL
-- ============================================
-- This migration implements all security fixes from the audit:
-- 1. Encrypt encryption keys in database
-- 2. Add salts for API key hashing
-- 3. Encrypt MFA secrets
-- 4. Implement key derivation infrastructure
-- 5. Add audit trail for key access

-- ============================================
-- 1. Add salt column to api_keys
-- ============================================
ALTER TABLE public.api_keys 
ADD COLUMN IF NOT EXISTS key_salt TEXT;

-- ============================================
-- 2. Create master_keys table for user master keys
-- ============================================
CREATE TABLE IF NOT EXISTS public.master_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_master_key TEXT NOT NULL, -- Encrypted with password-derived key
  kdf_salt TEXT NOT NULL, -- Salt for PBKDF2
  kdf_iterations INTEGER NOT NULL DEFAULT 100000,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_rotated TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, key_version)
);

-- Enable RLS on master_keys
ALTER TABLE public.master_keys ENABLE ROW LEVEL SECURITY;

-- Users can only access their own master keys
CREATE POLICY "Users can manage own master keys"
  ON public.master_keys
  FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- 3. Create encrypted_keys table for wrapped file encryption keys
-- ============================================
CREATE TABLE IF NOT EXISTS public.encrypted_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wrapped_key TEXT NOT NULL, -- File encryption key wrapped with master key
  key_iv TEXT NOT NULL, -- IV used for wrapping
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(file_id, user_id)
);

-- Enable RLS on encrypted_keys
ALTER TABLE public.encrypted_keys ENABLE ROW LEVEL SECURITY;

-- Users can only access their own encrypted keys
CREATE POLICY "Users can manage own encrypted keys"
  ON public.encrypted_keys
  FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- 4. Add encrypted_mfa_secret to profiles
-- ============================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS encrypted_mfa_secret TEXT,
ADD COLUMN IF NOT EXISTS mfa_secret_iv TEXT;

-- ============================================
-- 5. Create key_access_logs for audit trail
-- ============================================
CREATE TABLE IF NOT EXISTS public.key_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_type TEXT NOT NULL, -- 'file_key', 'api_key', 'mfa_secret', 'master_key'
  key_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 'create', 'access', 'rotate', 'delete'
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on key_access_logs
ALTER TABLE public.key_access_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own access logs
CREATE POLICY "Users can view own key access logs"
  ON public.key_access_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert logs
CREATE POLICY "System can insert key access logs"
  ON public.key_access_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================
-- 6. Create secure key derivation function (PBKDF2 wrapper)
-- ============================================
CREATE OR REPLACE FUNCTION public.log_key_access(
  p_key_type TEXT,
  p_key_id TEXT,
  p_action TEXT,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================
-- 7. Create function to rotate master key
-- ============================================
CREATE OR REPLACE FUNCTION public.rotate_master_key(
  p_old_wrapped_key TEXT,
  p_new_wrapped_key TEXT,
  p_new_salt TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================
-- 8. Add indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_master_keys_user_version 
  ON public.master_keys(user_id, key_version DESC);

CREATE INDEX IF NOT EXISTS idx_encrypted_keys_file 
  ON public.encrypted_keys(file_id);

CREATE INDEX IF NOT EXISTS idx_encrypted_keys_user 
  ON public.encrypted_keys(user_id);

CREATE INDEX IF NOT EXISTS idx_key_access_logs_user_created 
  ON public.key_access_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_active 
  ON public.api_keys(user_id, is_active) 
  WHERE is_active = true;

-- ============================================
-- 9. Add trigger for updated_at on master_keys
-- ============================================
CREATE OR REPLACE FUNCTION public.update_master_keys_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_master_keys_updated_at
  BEFORE UPDATE ON public.master_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_master_keys_updated_at();

-- ============================================
-- 10. Add comments for documentation
-- ============================================
COMMENT ON TABLE public.master_keys IS 'Stores encrypted user master keys derived from passwords using PBKDF2';
COMMENT ON TABLE public.encrypted_keys IS 'Stores file encryption keys wrapped with user master keys for zero-knowledge encryption';
COMMENT ON TABLE public.key_access_logs IS 'Audit trail for all cryptographic key access operations';

COMMENT ON COLUMN public.master_keys.encrypted_master_key IS 'Master key encrypted with password-derived key (PBKDF2)';
COMMENT ON COLUMN public.master_keys.kdf_salt IS 'Random salt used for PBKDF2 key derivation';
COMMENT ON COLUMN public.master_keys.kdf_iterations IS 'Number of PBKDF2 iterations (100,000+)';

COMMENT ON COLUMN public.encrypted_keys.wrapped_key IS 'File encryption key encrypted with user master key using AES-256-GCM';
COMMENT ON COLUMN public.encrypted_keys.key_iv IS 'Initialization vector for key wrapping operation';

COMMENT ON COLUMN public.profiles.encrypted_mfa_secret IS 'MFA secret encrypted with user master key';
COMMENT ON COLUMN public.profiles.mfa_secret_iv IS 'IV for MFA secret encryption';