-- Backend PIN authorization enforcement for sensitive operations

CREATE TABLE IF NOT EXISTS public.pin_operation_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('create_share', 'revoke_share', 'delete_files', 'open_vault', 'view_security_settings', 'export_data', 'app_startup')),
  authorized_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pin_operation_auth_user_operation
  ON public.pin_operation_authorizations(user_id, operation_type, authorized_until DESC);

ALTER TABLE public.pin_operation_authorizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own pin operation authorizations" ON public.pin_operation_authorizations;
CREATE POLICY "Users can view own pin operation authorizations"
  ON public.pin_operation_authorizations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own pin operation authorizations" ON public.pin_operation_authorizations;
CREATE POLICY "Users can insert own pin operation authorizations"
  ON public.pin_operation_authorizations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own pin operation authorizations" ON public.pin_operation_authorizations;
CREATE POLICY "Users can delete own pin operation authorizations"
  ON public.pin_operation_authorizations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.grant_pin_operation_authorization(
  operation_type TEXT,
  ttl_seconds INTEGER DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.assert_pin_authorized_operation(operation_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.grant_pin_operation_authorization(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_pin_authorized_operation(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.move_to_trash_secure(file_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.delete_file_secure(file_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.delete_folder_secure(folder_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.move_to_trash_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_file_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_folder_secure(UUID) TO authenticated;

-- Extend operation mapping for revoke share to follow share security setting
CREATE OR REPLACE FUNCTION public.requires_pin_auth(
  user_id_param UUID,
  operation_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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
