-- PIN Authentication System Migration
-- Created: 2025-11-03
-- Description: Adds PIN authentication for sensitive operations

-- Create user_security_settings table
CREATE TABLE IF NOT EXISTS user_security_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  pin_enabled BOOLEAN DEFAULT true,
  pin_attempts INTEGER DEFAULT 0,
  pin_locked_until TIMESTAMPTZ,
  biometric_enabled BOOLEAN DEFAULT false,
  require_pin_on_startup BOOLEAN DEFAULT false,
  require_pin_for_shares BOOLEAN DEFAULT true,
  require_pin_for_settings BOOLEAN DEFAULT true,
  require_pin_for_vault BOOLEAN DEFAULT true,
  pin_timeout INTEGER DEFAULT 5, -- minutes before re-auth required
  last_pin_auth TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create PIN attempt logs table
CREATE TABLE IF NOT EXISTS pin_attempt_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('success', 'failed', 'locked')),
  ip_address TEXT,
  user_agent TEXT,
  location JSONB, -- {country, city, lat, lon}
  metadata JSONB, -- Additional context
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pin_attempts_user_id ON pin_attempt_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pin_attempts_created_at ON pin_attempt_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_settings_user_id ON user_security_settings(user_id);

-- Enable RLS
ALTER TABLE user_security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_attempt_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_security_settings
CREATE POLICY "Users can view own security settings"
  ON user_security_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own security settings"
  ON user_security_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own security settings"
  ON user_security_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for pin_attempt_logs
CREATE POLICY "Users can view own PIN attempt logs"
  ON pin_attempt_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own PIN attempt logs"
  ON pin_attempt_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_security_settings
CREATE TRIGGER update_user_security_settings_updated_at
  BEFORE UPDATE ON user_security_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to increment PIN attempts
CREATE OR REPLACE FUNCTION increment_pin_attempts(user_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
  new_attempts INTEGER;
BEGIN
  UPDATE user_security_settings
  SET pin_attempts = pin_attempts + 1
  WHERE user_id = user_id_param
  RETURNING pin_attempts INTO new_attempts;
  
  RETURN COALESCE(new_attempts, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset PIN attempts
CREATE OR REPLACE FUNCTION reset_pin_attempts(user_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE user_security_settings
  SET pin_attempts = 0,
      pin_locked_until = NULL,
      last_pin_auth = NOW()
  WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to lock PIN
CREATE OR REPLACE FUNCTION lock_pin(user_id_param UUID, lock_duration_minutes INTEGER DEFAULT 5)
RETURNS VOID AS $$
BEGIN
  UPDATE user_security_settings
  SET pin_locked_until = NOW() + (lock_duration_minutes || ' minutes')::INTERVAL,
      pin_attempts = 3
  WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if PIN is required
CREATE OR REPLACE FUNCTION requires_pin_auth(
  user_id_param UUID,
  operation_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  settings RECORD;
  time_since_auth INTERVAL;
  requires_auth BOOLEAN := false;
BEGIN
  -- Get user settings
  SELECT * INTO settings
  FROM user_security_settings
  WHERE user_id = user_id_param;
  
  -- If no settings exist, assume PIN required
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  
  -- If PIN not enabled, return false
  IF NOT settings.pin_enabled THEN
    RETURN false;
  END IF;
  
  -- Check if locked
  IF settings.pin_locked_until IS NOT NULL AND settings.pin_locked_until > NOW() THEN
    RETURN true;
  END IF;
  
  -- Calculate time since last auth (only used for app_startup)
  IF settings.last_pin_auth IS NOT NULL THEN
    time_since_auth := NOW() - settings.last_pin_auth;
  ELSE
    time_since_auth := INTERVAL '999 hours'; -- Force auth if never authenticated
  END IF;
  
  -- Check operation-specific requirements
  CASE operation_type
    WHEN 'open_vault' THEN
      -- Always require PIN for vault operations (no timeout caching)
      requires_auth := settings.require_pin_for_vault;
    WHEN 'create_share' THEN
      -- Always require PIN for share operations (no timeout caching)
      requires_auth := settings.require_pin_for_shares;
    WHEN 'view_security_settings' THEN
      -- Always require PIN for security settings (no timeout caching)
      requires_auth := settings.require_pin_for_settings;
    WHEN 'app_startup' THEN
      -- Only for app_startup, check timeout to avoid asking on every page load
      requires_auth := settings.require_pin_on_startup;
      IF requires_auth AND time_since_auth <= (settings.pin_timeout || ' minutes')::INTERVAL THEN
        requires_auth := false; -- Already authenticated within timeout
      END IF;
    ELSE
      requires_auth := true; -- Default to requiring PIN for unknown operations
  END CASE;
  
  RETURN requires_auth;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION increment_pin_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION reset_pin_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION lock_pin TO authenticated;
GRANT EXECUTE ON FUNCTION requires_pin_auth TO authenticated;

-- Add comment
COMMENT ON TABLE user_security_settings IS 'Stores user PIN authentication settings and preferences';
COMMENT ON TABLE pin_attempt_logs IS 'Audit log for PIN authentication attempts';
