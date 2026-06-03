-- Create user_passkeys table for WebAuthn passkey authentication
CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  public_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id),
  UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own passkeys"
  ON public.user_passkeys
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own passkeys"
  ON public.user_passkeys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own passkeys"
  ON public.user_passkeys
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own passkeys"
  ON public.user_passkeys
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON public.user_passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_email ON public.user_passkeys(email);

-- Function to update last_used_at on successful authentication
CREATE OR REPLACE FUNCTION public.update_passkey_last_used()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_used_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update last_used_at
CREATE TRIGGER update_passkey_last_used_trigger
  BEFORE UPDATE ON public.user_passkeys
  FOR EACH ROW
  WHEN (OLD.credential_id IS DISTINCT FROM NEW.credential_id)
  EXECUTE FUNCTION public.update_passkey_last_used();
