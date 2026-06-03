-- =====================================================
-- FIX SHARE ACCESS - Allow public to view shares
-- =====================================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow public access to shares by share_id" ON shares;
DROP POLICY IF EXISTS "Allow public access to shared files" ON files;

-- Add policy to allow anonymous users to read shares by share_id
-- This enables public share link access
CREATE POLICY "Allow public access to shares by share_id" ON shares
  FOR SELECT
  TO anon, authenticated
  USING (
    share_id IS NOT NULL 
    AND (expires_at IS NULL OR expires_at > NOW())
    AND COALESCE(is_active, true) = true
  );

-- Allow public to read files table for shared files
CREATE POLICY "Allow public access to shared files" ON files
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shares 
      WHERE shares.file_id = files.id 
      AND shares.share_id IS NOT NULL
      AND (shares.expires_at IS NULL OR shares.expires_at > NOW())
      AND COALESCE(shares.is_active, true) = true
    )
    OR 
    auth.uid() = user_id  -- Also allow owners to see their own files
  );

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
