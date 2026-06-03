-- Security hardening phase 1
-- Date: 2026-04-01

-- 1) Redact encryption_key from shared-file public RPC
DROP FUNCTION IF EXISTS public.get_shared_file_info(text);

CREATE OR REPLACE FUNCTION public.get_shared_file_info(share_id_param text)
RETURNS TABLE(
  file_id uuid,
  file_name text,
  file_type text,
  file_size bigint,
  file_created_at timestamptz,
  file_updated_at timestamptz,
  is_encrypted boolean,
  storage_path text,
  owner_id uuid,
  share_created_at timestamptz,
  share_expires_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id::uuid,
    f.name,
    f.type,
    f.size,
    f.created_at,
    f.updated_at,
    f.encrypted,
    f.storage_path,
    f.user_id::uuid,
    s.created_at,
    s.expires_at
  FROM public.shares s
  JOIN public.files f ON s.file_id = f.id
  WHERE s.share_id = share_id_param
    AND (s.expires_at IS NULL OR s.expires_at > NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_file_info(text) TO authenticated, anon;

-- 2) Enable RLS on exposed tables
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_collection_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_health_logs ENABLE ROW LEVEL SECURITY;

-- 3) user_passkeys already has policies in this project; keep them as-is.

-- 4) share_collections owner policies
DROP POLICY IF EXISTS "Users can view own share collections" ON public.share_collections;
CREATE POLICY "Users can view own share collections"
  ON public.share_collections
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own share collections" ON public.share_collections;
CREATE POLICY "Users can insert own share collections"
  ON public.share_collections
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own share collections" ON public.share_collections;
CREATE POLICY "Users can update own share collections"
  ON public.share_collections
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own share collections" ON public.share_collections;
CREATE POLICY "Users can delete own share collections"
  ON public.share_collections
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 5) share_collection_files policy via parent collection ownership
DROP POLICY IF EXISTS "Users can view own share collection files" ON public.share_collection_files;
CREATE POLICY "Users can view own share collection files"
  ON public.share_collection_files
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.share_collections sc
      WHERE sc.id = share_collection_files.collection_id
        AND sc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own share collection files" ON public.share_collection_files;
CREATE POLICY "Users can insert own share collection files"
  ON public.share_collection_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.share_collections sc
      WHERE sc.id = share_collection_files.collection_id
        AND sc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own share collection files" ON public.share_collection_files;
CREATE POLICY "Users can delete own share collection files"
  ON public.share_collection_files
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.share_collections sc
      WHERE sc.id = share_collection_files.collection_id
        AND sc.user_id = auth.uid()
    )
  );

-- 6) share_audit_logs: users can view logs for their own shares
DROP POLICY IF EXISTS "Owners can view own share audit logs" ON public.share_audit_logs;
CREATE POLICY "Owners can view own share audit logs"
  ON public.share_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shares s
      WHERE s.share_id = share_audit_logs.share_id
        AND s.user_id = auth.uid()
    )
  );

-- Allow write-only logging for anonymous and authenticated viewers.
DROP POLICY IF EXISTS "Public can insert share audit logs" ON public.share_audit_logs;
CREATE POLICY "Public can insert share audit logs"
  ON public.share_audit_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.shares s
      WHERE s.share_id = share_audit_logs.share_id
    )
  );

-- 7) account_health_logs intentionally has no anon/authenticated access policies.
-- Service role can continue to manage this table via bypass RLS.
