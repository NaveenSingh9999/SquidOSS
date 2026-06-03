-- Security hardening phase 3
-- Tighten permissive INSERT policies that currently use WITH CHECK (true).

-- account_changes
DROP POLICY IF EXISTS "System can insert account changes" ON public.account_changes;
CREATE POLICY "Users can insert their own account changes"
ON public.account_changes
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- api_request_logs
DROP POLICY IF EXISTS "System can insert API request logs" ON public.api_request_logs;
CREATE POLICY "Users can insert their own API request logs"
ON public.api_request_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- extension_analytics
DROP POLICY IF EXISTS "System can insert analytics" ON public.extension_analytics;
CREATE POLICY "Users can insert their own extension analytics"
ON public.extension_analytics
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- key_access_logs
DROP POLICY IF EXISTS "System can insert key access logs" ON public.key_access_logs;
CREATE POLICY "Users can insert their own key access logs"
ON public.key_access_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- migration_logs
DROP POLICY IF EXISTS "System can insert migration logs" ON public.migration_logs;
CREATE POLICY "Users can insert their own migration logs"
ON public.migration_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- threat_alerts
DROP POLICY IF EXISTS "System can insert threat alerts" ON public.threat_alerts;
CREATE POLICY "Users can insert their own threat alerts"
ON public.threat_alerts
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- partner_codes
DROP POLICY IF EXISTS "Authenticated users can create partner codes" ON public.partner_codes;
CREATE POLICY "Authenticated users can create partner codes"
ON public.partner_codes
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());
