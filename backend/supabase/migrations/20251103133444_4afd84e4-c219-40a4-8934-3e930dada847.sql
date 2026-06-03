-- Fix permission denied for table auth.users by removing cross-schema reference in shares policy

-- Drop existing problematic policy
DROP POLICY IF EXISTS "Allow public access to shares by share_id" ON public.shares;

-- Recreate policy without selecting from auth.users
CREATE POLICY "Allow public access to shares by share_id" ON public.shares
FOR SELECT
TO anon, authenticated
USING (
  share_id IS NOT NULL
  AND (expires_at IS NULL OR expires_at > now())
  AND coalesce(is_active, true) = true
  AND (
    share_type = 'public'
    OR (
      auth.uid() IS NOT NULL
      AND share_type = 'user_specific'
      AND auth.uid()::text = ANY (allowed_users)
    )
  )
);

-- Note: Email-based user-specific access was removed to avoid querying auth.users in RLS.
-- Use user IDs in shares.allowed_users (text[]) for user-specific sharing.
