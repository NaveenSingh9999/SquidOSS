-- Fix RLS policies without referencing non-existent email column
DO $$ 
BEGIN
  -- Drop problematic policies
  DROP POLICY IF EXISTS "shares_select_user_specific" ON shares;
  DROP POLICY IF EXISTS "files_select_shared" ON files;
END $$;

-- User-specific shares viewable by authenticated users in allowed_users list (using user ID)
CREATE POLICY "shares_select_user_specific"
  ON shares FOR SELECT
  USING (
    share_type = 'user_specific'
    AND (expires_at IS NULL OR expires_at > NOW())
    AND auth.uid() IS NOT NULL
    AND auth.uid()::text = ANY(allowed_users)
  );

-- Allow viewing shared files (simplified without email check)
CREATE POLICY "files_select_shared"
  ON files FOR SELECT
  USING (
    -- Own files
    user_id = auth.uid()
    OR
    -- Publicly shared files
    EXISTS (
      SELECT 1 FROM shares s
      WHERE s.file_id = files.id
      AND s.share_type = 'public'
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
    )
    OR
    -- User-specific shared files (check if user ID is in allowed_users)
    (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM shares s
        WHERE s.file_id = files.id
        AND s.share_type = 'user_specific'
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
        AND auth.uid()::text = ANY(s.allowed_users)
      )
    )
  );