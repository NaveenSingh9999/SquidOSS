-- Create squid_vaults table for secure vault storage
CREATE TABLE IF NOT EXISTS squid_vaults (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  passkey_credential_id TEXT, -- Store WebAuthn credential ID for biometric auth
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),    
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id) -- Each user can only have one vault
);

-- Add vault-related columns to files table
ALTER TABLE files 
  ADD COLUMN IF NOT EXISTS in_vault BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vault_previous_folder TEXT;

-- Create index for faster vault queries
CREATE INDEX IF NOT EXISTS idx_files_in_vault ON files(user_id, in_vault) WHERE in_vault = TRUE;

-- Add RLS policies for squid_vaults
ALTER TABLE squid_vaults ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own vault
CREATE POLICY "Users can view their own vault"
  ON squid_vaults
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own vault
CREATE POLICY "Users can create their own vault"
  ON squid_vaults
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own vault
CREATE POLICY "Users can update their own vault"
  ON squid_vaults
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own vault
CREATE POLICY "Users can delete their own vault"
  ON squid_vaults
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_squid_vault_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_squid_vault_timestamp
  BEFORE UPDATE ON squid_vaults
  FOR EACH ROW
  EXECUTE FUNCTION update_squid_vault_updated_at();
