-- Create vaults table for secure file storage
CREATE TABLE IF NOT EXISTS public.vaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_fingerprint_enabled BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vaults
CREATE POLICY "Users can manage own vaults"
  ON public.vaults
  FOR ALL
  USING (auth.uid() = user_id);

-- Create vault_files table to track files in vaults
CREATE TABLE IF NOT EXISTS public.vault_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_parent_folder TEXT,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(vault_id, file_id)
);

-- Enable RLS for vault_files
ALTER TABLE public.vault_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vault_files
CREATE POLICY "Users can manage own vault files"
  ON public.vault_files
  FOR ALL
  USING (auth.uid() = user_id);

-- Create function to check if user has vault
CREATE OR REPLACE FUNCTION public.user_has_vault(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.vaults
    WHERE user_id = p_user_id
  );
END;
$$;

-- Create function to verify vault password
CREATE OR REPLACE FUNCTION public.verify_vault_password(
  p_user_id UUID,
  p_vault_name TEXT,
  p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_password_hash TEXT;
BEGIN
  SELECT password_hash INTO v_password_hash
  FROM public.vaults
  WHERE user_id = p_user_id AND name = p_vault_name;
  
  IF v_password_hash IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN v_password_hash = crypt(p_password, v_password_hash);
END;
$$;

-- Add indexes for better performance
CREATE INDEX idx_vaults_user_id ON public.vaults(user_id);
CREATE INDEX idx_vault_files_vault_id ON public.vault_files(vault_id);
CREATE INDEX idx_vault_files_file_id ON public.vault_files(file_id);
CREATE INDEX idx_vault_files_user_id ON public.vault_files(user_id);