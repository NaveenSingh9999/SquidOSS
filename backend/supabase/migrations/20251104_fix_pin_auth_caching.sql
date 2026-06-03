-- Fix PIN Authentication Caching Issue
-- Date: 2025-11-04
-- Issue: PIN auth was being cached after first verification
-- Solution: Remove last_pin_auth update from security operations, only update on app_startup

-- Update reset_pin_attempts to NOT update last_pin_auth
-- This prevents the function from "remembering" auth for security operations
CREATE OR REPLACE FUNCTION reset_pin_attempts(user_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE user_security_settings
  SET pin_attempts = 0,
      pin_locked_until = NULL
      -- REMOVED: last_pin_auth = NOW()
      -- This was causing PIN to be "remembered" after successful auth
  WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add new function to mark successful auth ONLY for app_startup
CREATE OR REPLACE FUNCTION mark_app_startup_auth(user_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE user_security_settings
  SET last_pin_auth = NOW()
  WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION mark_app_startup_auth TO authenticated;

-- Add comment
COMMENT ON FUNCTION mark_app_startup_auth IS 'Updates last_pin_auth timestamp only for app_startup operation to enable session timeout';
COMMENT ON FUNCTION reset_pin_attempts IS 'Resets PIN attempts after successful verification - does NOT update last_pin_auth to prevent caching';
