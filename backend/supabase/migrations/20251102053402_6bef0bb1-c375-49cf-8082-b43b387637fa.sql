-- Add PIN authentication support to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_salt TEXT;

-- Add user-based sharing support to shares table
ALTER TABLE shares ADD COLUMN IF NOT EXISTS allowed_users TEXT[]; -- Array of user emails/IDs
ALTER TABLE shares ADD COLUMN IF NOT EXISTS share_type TEXT DEFAULT 'public'; -- 'public', 'private', 'user_specific'

-- Create PIN verification function
CREATE OR REPLACE FUNCTION verify_user_pin(p_user_id UUID, p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- Update share access policies to support user-specific sharing
DROP POLICY IF EXISTS "Allow public access to shares by share_id" ON shares;

CREATE POLICY "Allow public access to shares by share_id" ON shares
  FOR SELECT
  TO anon, authenticated
  USING (
    share_id IS NOT NULL 
    AND (expires_at IS NULL OR expires_at > NOW())
    AND COALESCE(is_active, true) = true
    AND (
      share_type = 'public'
      OR (share_type = 'user_specific' AND auth.uid()::text = ANY(allowed_users))
      OR (share_type = 'user_specific' AND (SELECT email FROM auth.users WHERE id = auth.uid()) = ANY(allowed_users))
    )
  );