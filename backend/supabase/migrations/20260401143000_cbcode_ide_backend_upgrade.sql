-- cbCode IDE backend upgrade
-- Adds persistent IDE preferences, session state, and file snapshots.

CREATE TABLE IF NOT EXISTS public.cbcode_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  options JSONB NOT NULL DEFAULT '{
    "autosaveEnabled": true,
    "autosaveIntervalMs": 15000,
    "formatOnSave": true,
    "lintOnSave": false,
    "trimTrailingWhitespace": true,
    "insertFinalNewline": true,
    "wordWrap": "on",
    "wordWrapColumn": 120,
    "minimapEnabled": true,
    "lineNumbers": "on",
    "tabSize": 2,
    "insertSpaces": true,
    "fontSize": 14,
    "lineHeight": 22,
    "smoothScrolling": true,
    "cursorBlinking": "smooth",
    "cursorSmoothCaretAnimation": "on",
    "bracketPairColorization": true,
    "suggestOnTriggerCharacters": true,
    "quickSuggestions": true,
    "acceptSuggestionOnCommitCharacter": true,
    "inlineSuggestEnabled": true,
    "stickyScrollEnabled": true,
    "codeLens": false,
    "renderWhitespace": "selection",
    "scrollBeyondLastLine": false,
    "rulers": [100],
    "paddingTop": 10,
    "paddingBottom": 10,
    "experimental": {
      "multiCursorModifier": "alt",
      "linkedEditing": true,
      "unicodeHighlight": true,
      "semanticHighlighting": true,
      "inlayHints": true
    }
  }'::jsonb,
  keybindings JSONB NOT NULL DEFAULT '{}'::jsonb,
  snippets JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT cbcode_preferences_user_workspace_unique UNIQUE (user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS public.cbcode_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL DEFAULT 'default',
  state JSONB NOT NULL DEFAULT '{
    "activeFileId": null,
    "openTabs": [],
    "showTerminal": false,
    "searchQuery": "",
    "layout": {
      "sidebarWidth": 300,
      "terminalHeight": 220
    }
  }'::jsonb,
  active_file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT cbcode_sessions_scope_unique UNIQUE (user_id, workspace_id, session_name)
);

CREATE TABLE IF NOT EXISTS public.cbcode_file_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'plaintext',
  content TEXT NOT NULL,
  save_reason TEXT NOT NULL DEFAULT 'manual',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT cbcode_snapshots_reason_check CHECK (save_reason IN ('manual', 'autosave', 'run'))
);

CREATE INDEX IF NOT EXISTS cbcode_preferences_lookup_idx
  ON public.cbcode_preferences(user_id, workspace_id);

CREATE INDEX IF NOT EXISTS cbcode_sessions_lookup_idx
  ON public.cbcode_sessions(user_id, workspace_id, session_name);

CREATE INDEX IF NOT EXISTS cbcode_snapshots_file_created_idx
  ON public.cbcode_file_snapshots(file_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cbcode_snapshots_workspace_idx
  ON public.cbcode_file_snapshots(user_id, workspace_id, created_at DESC);

ALTER TABLE public.cbcode_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbcode_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbcode_file_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own cbcode preferences" ON public.cbcode_preferences;
DROP POLICY IF EXISTS "Users can manage own cbcode sessions" ON public.cbcode_sessions;
DROP POLICY IF EXISTS "Users can manage own cbcode snapshots" ON public.cbcode_file_snapshots;

CREATE POLICY "Users can manage own cbcode preferences"
  ON public.cbcode_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own cbcode sessions"
  ON public.cbcode_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own cbcode snapshots"
  ON public.cbcode_file_snapshots
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.cbcode_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cbcode_preferences_set_updated_at ON public.cbcode_preferences;
CREATE TRIGGER cbcode_preferences_set_updated_at
  BEFORE UPDATE ON public.cbcode_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.cbcode_set_updated_at();

DROP TRIGGER IF EXISTS cbcode_sessions_set_updated_at ON public.cbcode_sessions;
CREATE TRIGGER cbcode_sessions_set_updated_at
  BEFORE UPDATE ON public.cbcode_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.cbcode_set_updated_at();

CREATE OR REPLACE FUNCTION public.cbcode_upsert_preferences(
  p_workspace_id UUID DEFAULT NULL,
  p_options JSONB DEFAULT '{}'::jsonb,
  p_keybindings JSONB DEFAULT '{}'::jsonb,
  p_snippets JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_workspace_id UUID;
  v_record public.cbcode_preferences%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_workspace_id := COALESCE(p_workspace_id, public.get_or_create_default_workspace(v_user_id));

  INSERT INTO public.cbcode_preferences (
    user_id,
    workspace_id,
    options,
    keybindings,
    snippets
  ) VALUES (
    v_user_id,
    v_workspace_id,
    p_options,
    p_keybindings,
    p_snippets
  )
  ON CONFLICT (user_id, workspace_id)
  DO UPDATE
    SET options = COALESCE(public.cbcode_preferences.options, '{}'::jsonb) || COALESCE(EXCLUDED.options, '{}'::jsonb),
        keybindings = COALESCE(EXCLUDED.keybindings, public.cbcode_preferences.keybindings),
        snippets = COALESCE(EXCLUDED.snippets, public.cbcode_preferences.snippets),
        updated_at = now()
  RETURNING * INTO v_record;

  RETURN to_jsonb(v_record);
END;
$$;

CREATE OR REPLACE FUNCTION public.cbcode_upsert_session_state(
  p_workspace_id UUID DEFAULT NULL,
  p_state JSONB DEFAULT '{}'::jsonb,
  p_active_file_id UUID DEFAULT NULL,
  p_session_name TEXT DEFAULT 'default'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_workspace_id UUID;
  v_record public.cbcode_sessions%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_workspace_id := COALESCE(p_workspace_id, public.get_or_create_default_workspace(v_user_id));

  INSERT INTO public.cbcode_sessions (
    user_id,
    workspace_id,
    session_name,
    state,
    active_file_id
  ) VALUES (
    v_user_id,
    v_workspace_id,
    COALESCE(NULLIF(trim(p_session_name), ''), 'default'),
    p_state,
    p_active_file_id
  )
  ON CONFLICT (user_id, workspace_id, session_name)
  DO UPDATE
    SET state = COALESCE(public.cbcode_sessions.state, '{}'::jsonb) || COALESCE(EXCLUDED.state, '{}'::jsonb),
        active_file_id = COALESCE(EXCLUDED.active_file_id, public.cbcode_sessions.active_file_id),
        updated_at = now()
  RETURNING * INTO v_record;

  RETURN to_jsonb(v_record);
END;
$$;

CREATE OR REPLACE FUNCTION public.cbcode_save_snapshot(
  p_file_id UUID,
  p_workspace_id UUID DEFAULT NULL,
  p_content TEXT DEFAULT '',
  p_language TEXT DEFAULT 'plaintext',
  p_save_reason TEXT DEFAULT 'manual',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_workspace_id UUID;
  v_snapshot_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM 1
  FROM public.files
  WHERE id = p_file_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'File not found or access denied';
  END IF;

  v_workspace_id := COALESCE(p_workspace_id, public.get_or_create_default_workspace(v_user_id));

  INSERT INTO public.cbcode_file_snapshots (
    file_id,
    user_id,
    workspace_id,
    language,
    content,
    save_reason,
    metadata
  ) VALUES (
    p_file_id,
    v_user_id,
    v_workspace_id,
    p_language,
    p_content,
    CASE
      WHEN p_save_reason IN ('manual', 'autosave', 'run') THEN p_save_reason
      ELSE 'manual'
    END,
    p_metadata
  )
  RETURNING id INTO v_snapshot_id;

  DELETE FROM public.cbcode_file_snapshots
  WHERE id IN (
    SELECT id
    FROM public.cbcode_file_snapshots
    WHERE file_id = p_file_id
      AND user_id = v_user_id
    ORDER BY created_at DESC
    OFFSET 500
  );

  RETURN v_snapshot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cbcode_upsert_preferences(UUID, JSONB, JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbcode_upsert_session_state(UUID, JSONB, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbcode_save_snapshot(UUID, UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
