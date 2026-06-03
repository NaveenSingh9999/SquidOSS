-- Workspace isolation for user-owned files/folders.
-- Adds workspace switching support with a per-user default workspace.

CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT workspaces_user_name_unique UNIQUE (user_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_single_default_idx
  ON public.workspaces(user_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS workspaces_user_id_idx
  ON public.workspaces(user_id);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can create their own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can update their own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can delete their own workspaces" ON public.workspaces;

CREATE POLICY "Users can view their own workspaces"
  ON public.workspaces
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own workspaces"
  ON public.workspaces
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workspaces"
  ON public.workspaces
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workspaces"
  ON public.workspaces
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_or_create_default_workspace(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_workspace_name TEXT;
BEGIN
  SELECT w.id
  INTO v_workspace_id
  FROM public.workspaces w
  WHERE w.user_id = p_user_id
    AND w.is_default = true
  ORDER BY w.created_at ASC
  LIMIT 1;

  IF v_workspace_id IS NOT NULL THEN
    RETURN v_workspace_id;
  END IF;

  SELECT COALESCE(
    NULLIF(trim(p.username), ''),
    NULLIF(trim(p.display_name), ''),
    NULLIF(trim(p.full_name), ''),
    NULLIF(trim(split_part(u.email, '@', 1)), ''),
    'My Workspace'
  )
  INTO v_workspace_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = p_user_id;

  v_workspace_name := LEFT(v_workspace_name, 80);

  INSERT INTO public.workspaces (user_id, name, is_default)
  VALUES (p_user_id, v_workspace_name, true)
  ON CONFLICT (user_id, name)
  DO UPDATE
    SET is_default = true,
        updated_at = now()
  RETURNING id INTO v_workspace_id;

  RETURN v_workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_default_workspace(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_default_workspace_for_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.get_or_create_default_workspace(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_create_default_workspace ON public.profiles;
CREATE TRIGGER profiles_create_default_workspace
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_workspace_for_profile();

ALTER TABLE public.files ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS workspace_id UUID;

DO $$
DECLARE
  v_profile RECORD;
BEGIN
  FOR v_profile IN SELECT id FROM public.profiles LOOP
    PERFORM public.get_or_create_default_workspace(v_profile.id);
  END LOOP;
END;
$$;

UPDATE public.files f
SET workspace_id = public.get_or_create_default_workspace(f.user_id)
WHERE f.workspace_id IS NULL;

UPDATE public.folders fo
SET workspace_id = public.get_or_create_default_workspace(fo.user_id)
WHERE fo.workspace_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'files_workspace_id_fkey'
  ) THEN
    ALTER TABLE public.files
      ADD CONSTRAINT files_workspace_id_fkey
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'folders_workspace_id_fkey'
  ) THEN
    ALTER TABLE public.folders
      ADD CONSTRAINT folders_workspace_id_fkey
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

ALTER TABLE public.files ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.folders ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_files_user_workspace
  ON public.files(user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_folders_user_workspace
  ON public.folders(user_id, workspace_id);

CREATE OR REPLACE FUNCTION public.assign_workspace_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  IF NEW.workspace_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.workspace_id := public.get_or_create_default_workspace(NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS files_assign_workspace_id ON public.files;
CREATE TRIGGER files_assign_workspace_id
  BEFORE INSERT ON public.files
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_workspace_id();

DROP TRIGGER IF EXISTS folders_assign_workspace_id ON public.folders;
CREATE TRIGGER folders_assign_workspace_id
  BEFORE INSERT ON public.folders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_workspace_id();

CREATE OR REPLACE FUNCTION public.create_file_record(
  p_name TEXT,
  p_type TEXT,
  p_size BIGINT,
  p_storage_path TEXT,
  p_user_id UUID,
  p_encrypted BOOLEAN DEFAULT false,
  p_encryption_key TEXT DEFAULT NULL,
  p_metadata TEXT DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_file public.files%ROWTYPE;
BEGIN
  v_workspace_id := COALESCE(
    p_workspace_id,
    public.get_or_create_default_workspace(p_user_id)
  );

  INSERT INTO public.files (
    name,
    type,
    size,
    storage_path,
    user_id,
    encrypted,
    shared,
    encryption_key,
    tags,
    workspace_id
  )
  VALUES (
    p_name,
    p_type,
    p_size,
    p_storage_path,
    p_user_id,
    p_encrypted,
    false,
    p_encryption_key,
    CASE WHEN p_metadata IS NULL THEN NULL ELSE ARRAY[p_metadata]::TEXT[] END,
    v_workspace_id
  )
  RETURNING * INTO v_file;

  RETURN to_json(v_file);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_file_record(TEXT, TEXT, BIGINT, TEXT, UUID, BOOLEAN, TEXT, TEXT, UUID)
  TO authenticated, service_role;
