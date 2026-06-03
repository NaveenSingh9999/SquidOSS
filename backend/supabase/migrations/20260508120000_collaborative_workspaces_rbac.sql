-- Collaborative workspaces + RBAC support

DO $$
BEGIN
  CREATE TYPE public.workspace_role AS ENUM ('viewer', 'editor', 'admin', 'owner');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS storage_backend TEXT NOT NULL DEFAULT 'managed',
  ADD COLUMN IF NOT EXISTS member_limit INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_storage_backend_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_storage_backend_check
      CHECK (storage_backend IN ('managed', 'custom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_member_limit_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_member_limit_check
      CHECK (member_limit IS NULL OR member_limit > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_members_user_idx
  ON public.workspace_members(user_id);

CREATE INDEX IF NOT EXISTS workspace_members_workspace_idx
  ON public.workspace_members(workspace_id);

CREATE INDEX IF NOT EXISTS workspace_members_workspace_role_idx
  ON public.workspace_members(workspace_id, role);

CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  invitee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'viewer',
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_invites_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  CONSTRAINT workspace_invites_email_not_blank
    CHECK (char_length(trim(invitee_email)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_token_hash_idx
  ON public.workspace_invites(token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_pending_idx
  ON public.workspace_invites(workspace_id, invitee_email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS workspace_invites_workspace_idx
  ON public.workspace_invites(workspace_id);

CREATE INDEX IF NOT EXISTS workspace_invites_invitee_idx
  ON public.workspace_invites(invitee_email);

CREATE TABLE IF NOT EXISTS public.workspace_presence (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_file_id UUID,
  socket_id TEXT,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_presence_workspace_idx
  ON public.workspace_presence(workspace_id);

CREATE INDEX IF NOT EXISTS workspace_presence_heartbeat_idx
  ON public.workspace_presence(workspace_id, last_heartbeat DESC);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_presence ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.workspace_role_rank(p_role public.workspace_role)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_role
    WHEN 'viewer' THEN 1
    WHEN 'editor' THEN 2
    WHEN 'admin' THEN 3
    WHEN 'owner' THEN 4
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(
  p_workspace_id UUID,
  p_user_id UUID,
  p_min_role public.workspace_role
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = p_workspace_id
        AND wm.user_id = p_user_id
        AND public.workspace_role_rank(wm.role) >= public.workspace_role_rank(p_min_role)
    ) THEN true
    WHEN EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = p_workspace_id
        AND w.user_id = p_user_id
    ) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_role(
  p_workspace_id UUID,
  p_user_id UUID
)
RETURNS public.workspace_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN w.user_id = p_user_id THEN 'owner'::public.workspace_role
    ELSE wm.role
  END
  FROM public.workspaces w
  LEFT JOIN public.workspace_members wm
    ON wm.workspace_id = w.id
    AND wm.user_id = p_user_id
  WHERE w.id = p_workspace_id;
$$;

GRANT EXECUTE ON FUNCTION public.workspace_role_rank(public.workspace_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(UUID, UUID, public.workspace_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_role(UUID, UUID) TO authenticated, service_role;

-- Ensure workspace owners are also members with owner role.
CREATE OR REPLACE FUNCTION public.create_workspace_owner_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, joined_at)
  VALUES (NEW.id, NEW.user_id, 'owner', NEW.user_id, NEW.created_at)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_create_owner_member ON public.workspaces;
CREATE TRIGGER workspaces_create_owner_member
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.create_workspace_owner_member();

INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, joined_at)
SELECT w.id, w.user_id, 'owner', w.user_id, w.created_at
FROM public.workspaces w
ON CONFLICT (workspace_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_workspace_invite(
  p_workspace_id UUID,
  p_invitee_email TEXT,
  p_role public.workspace_role DEFAULT 'viewer',
  p_expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
)
RETURNS TABLE (invite_id UUID, invite_token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_hash TEXT;
  v_invitee_email TEXT;
BEGIN
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot invite with owner role';
  END IF;

  IF NOT public.has_workspace_role(p_workspace_id, auth.uid(), 'admin')
     AND NOT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_invitee_email := lower(trim(p_invitee_email));
  v_token := encode(gen_random_bytes(24), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.workspace_invites (
    workspace_id,
    invitee_email,
    invited_by,
    role,
    token_hash,
    expires_at
  ) VALUES (
    p_workspace_id,
    v_invitee_email,
    auth.uid(),
    p_role,
    v_hash,
    p_expires_at
  )
  RETURNING id INTO invite_id;

  invite_token := v_token;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_workspace_invite(
  p_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_invite RECORD;
  v_email TEXT;
  v_member_limit INTEGER;
  v_member_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_invite
  FROM public.workspace_invites
  WHERE token_hash = v_hash
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
  FOR UPDATE;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = auth.uid();

  IF v_invite.invitee_user_id IS NOT NULL AND v_invite.invitee_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Invite does not match this user';
  END IF;

  IF v_invite.invitee_user_id IS NULL AND v_email IS NOT NULL
     AND lower(v_email) <> lower(v_invite.invitee_email) THEN
    RAISE EXCEPTION 'Invite does not match this email';
  END IF;

  SELECT member_limit INTO v_member_limit
  FROM public.workspaces
  WHERE id = v_invite.workspace_id;

  IF v_member_limit IS NOT NULL THEN
    SELECT count(*) INTO v_member_count
    FROM public.workspace_members
    WHERE workspace_id = v_invite.workspace_id;

    IF v_member_count >= v_member_limit THEN
      RAISE EXCEPTION 'Workspace member limit reached';
    END IF;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, joined_at)
  VALUES (v_invite.workspace_id, auth.uid(), v_invite.role, v_invite.invited_by, now())
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invites
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by = auth.uid(),
      updated_at = now()
  WHERE id = v_invite.id;

  RETURN v_invite.workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_workspace_invite(UUID, TEXT, public.workspace_role, TIMESTAMPTZ)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_workspace_presence(
  p_workspace_id UUID,
  p_current_file_id UUID DEFAULT NULL,
  p_socket_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_workspace_role(p_workspace_id, auth.uid(), 'viewer') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.workspace_presence (
    workspace_id,
    user_id,
    current_file_id,
    socket_id,
    last_heartbeat
  ) VALUES (
    p_workspace_id,
    auth.uid(),
    p_current_file_id,
    p_socket_id,
    now()
  )
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET
    current_file_id = EXCLUDED.current_file_id,
    socket_id = EXCLUDED.socket_id,
    last_heartbeat = now(),
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_workspace_presence(UUID, UUID, TEXT)
  TO authenticated, service_role;

-- Update updated_at on change
DROP TRIGGER IF EXISTS update_workspace_members_updated_at ON public.workspace_members;
CREATE TRIGGER update_workspace_members_updated_at
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workspace_invites_updated_at ON public.workspace_invites;
CREATE TRIGGER update_workspace_invites_updated_at
  BEFORE UPDATE ON public.workspace_invites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workspace_presence_updated_at ON public.workspace_presence;
CREATE TRIGGER update_workspace_presence_updated_at
  BEFORE UPDATE ON public.workspace_presence
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Workspaces RLS
DROP POLICY IF EXISTS "Users can view their own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can create their own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can update their own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can delete their own workspaces" ON public.workspaces;

CREATE POLICY "Workspace members can view workspaces"
  ON public.workspaces
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_workspace_role(id, auth.uid(), 'viewer')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Users can create workspaces"
  ON public.workspaces
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update workspaces"
  ON public.workspaces
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  )
  WITH CHECK (
    auth.uid() = user_id
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Owners can delete workspaces"
  ON public.workspaces
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

-- Workspace members RLS
DROP POLICY IF EXISTS "Workspace members can view membership" ON public.workspace_members;
DROP POLICY IF EXISTS "Workspace admins can insert members" ON public.workspace_members;
DROP POLICY IF EXISTS "Workspace admins can update members" ON public.workspace_members;
DROP POLICY IF EXISTS "Workspace members can delete membership" ON public.workspace_members;

CREATE POLICY "Workspace members can view membership"
  ON public.workspace_members
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), 'viewer')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Workspace admins can insert members"
  ON public.workspace_members
  FOR INSERT
  WITH CHECK (
    public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Workspace admins can update members"
  ON public.workspace_members
  FOR UPDATE
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  )
  WITH CHECK (
    public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Workspace members can delete membership"
  ON public.workspace_members
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

-- Workspace invites RLS
DROP POLICY IF EXISTS "Workspace admins can manage invites" ON public.workspace_invites;

CREATE POLICY "Workspace admins can manage invites"
  ON public.workspace_invites
  FOR ALL
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  )
  WITH CHECK (
    public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

-- Workspace presence RLS
DROP POLICY IF EXISTS "Workspace members can view presence" ON public.workspace_presence;
DROP POLICY IF EXISTS "Workspace members can insert presence" ON public.workspace_presence;
DROP POLICY IF EXISTS "Workspace members can update presence" ON public.workspace_presence;
DROP POLICY IF EXISTS "Workspace members can delete presence" ON public.workspace_presence;

CREATE POLICY "Workspace members can view presence"
  ON public.workspace_presence
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), 'viewer')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Workspace members can insert presence"
  ON public.workspace_presence
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_workspace_role(workspace_id, auth.uid(), 'viewer')
  );

CREATE POLICY "Workspace members can update presence"
  ON public.workspace_presence
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND public.has_workspace_role(workspace_id, auth.uid(), 'viewer')
  )
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_workspace_role(workspace_id, auth.uid(), 'viewer')
  );

CREATE POLICY "Workspace members can delete presence"
  ON public.workspace_presence
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

-- Files RLS
DROP POLICY IF EXISTS "Users can view own files or admins can view all" ON public.files;
DROP POLICY IF EXISTS "Users can insert own files" ON public.files;
DROP POLICY IF EXISTS "Users can update own files or admins can update all" ON public.files;
DROP POLICY IF EXISTS "Users can delete own files or admins can delete all" ON public.files;
DROP POLICY IF EXISTS "Users can view their own files" ON public.files;
DROP POLICY IF EXISTS "Users can insert their own files" ON public.files;
DROP POLICY IF EXISTS "Users can update their own files" ON public.files;
DROP POLICY IF EXISTS "Users can delete their own files" ON public.files;

CREATE POLICY "Workspace members can view files"
  ON public.files
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), 'viewer')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Workspace members can insert files"
  ON public.files
  FOR INSERT
  WITH CHECK (
    (
      auth.uid() = user_id
      AND public.has_workspace_role(workspace_id, auth.uid(), 'editor')
    )
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Workspace members can update files"
  ON public.files
  FOR UPDATE
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR (
      public.has_workspace_role(workspace_id, auth.uid(), 'editor')
      AND auth.uid() = user_id
    )
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  )
  WITH CHECK (
    public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR (
      public.has_workspace_role(workspace_id, auth.uid(), 'editor')
      AND auth.uid() = user_id
    )
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Workspace members can delete files"
  ON public.files
  FOR DELETE
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR (
      public.has_workspace_role(workspace_id, auth.uid(), 'editor')
      AND auth.uid() = user_id
    )
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

-- Folders RLS
DROP POLICY IF EXISTS "Users can create their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;

CREATE POLICY "Workspace members can view folders"
  ON public.folders
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), 'viewer')
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Workspace members can insert folders"
  ON public.folders
  FOR INSERT
  WITH CHECK (
    (
      auth.uid() = user_id
      AND public.has_workspace_role(workspace_id, auth.uid(), 'editor')
    )
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Workspace members can update folders"
  ON public.folders
  FOR UPDATE
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR (
      public.has_workspace_role(workspace_id, auth.uid(), 'editor')
      AND auth.uid() = user_id
    )
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  )
  WITH CHECK (
    public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR (
      public.has_workspace_role(workspace_id, auth.uid(), 'editor')
      AND auth.uid() = user_id
    )
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

CREATE POLICY "Workspace members can delete folders"
  ON public.folders
  FOR DELETE
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), 'admin')
    OR (
      public.has_workspace_role(workspace_id, auth.uid(), 'editor')
      AND auth.uid() = user_id
    )
    OR COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
  );

-- Harden create_file_record to enforce workspace membership when called by clients.
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
  v_is_service_role BOOLEAN;
BEGIN
  v_workspace_id := COALESCE(
    p_workspace_id,
    public.get_or_create_default_workspace(p_user_id)
  );

  v_is_service_role := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';

  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

    IF NOT public.has_workspace_role(v_workspace_id, p_user_id, 'editor') THEN
      RAISE EXCEPTION 'Insufficient workspace role';
    END IF;
  END IF;

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
