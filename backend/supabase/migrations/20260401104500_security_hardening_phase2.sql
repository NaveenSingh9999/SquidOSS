-- Security hardening phase 2
-- 1) Remove SECURITY DEFINER exposure from analytics view
-- 2) Add explicit RLS policies for account_health_logs
-- 3) Lock function search_path on public, non-extension functions

-- Recreate view as security invoker so querying user policies apply.
CREATE OR REPLACE VIEW public.video_analytics_summary
WITH (security_invoker = true) AS
SELECT
  f.id AS file_id,
  f.name AS file_name,
  f.type AS file_type,
  f.size AS file_size,
  count(DISTINCT mpl.session_id) AS total_sessions,
  count(DISTINCT mpl.user_id) AS unique_viewers,
  avg(vss.stream_duration) AS avg_watch_time,
  sum(vss.bandwidth_used) AS total_bandwidth,
  count(
    CASE
      WHEN mpl.event_type::text = 'complete'::text THEN 1
      ELSE NULL::integer
    END
  ) AS completion_count,
  count(
    CASE
      WHEN mpl.event_type::text = 'error'::text THEN 1
      ELSE NULL::integer
    END
  ) AS error_count,
  max(mpl."timestamp") AS last_viewed,
  avg(
    CASE
      WHEN mpl.event_type::text = 'complete'::text THEN mpl."position"
      ELSE NULL::numeric
    END
  ) AS avg_completion_time
FROM public.files f
LEFT JOIN public.media_playback_logs mpl ON f.id = mpl.file_id
LEFT JOIN public.video_stream_sessions vss ON mpl.session_id = vss.session_id
WHERE f.type LIKE 'video/%'
GROUP BY f.id, f.name, f.type, f.size;

ALTER TABLE public.account_health_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own account health logs" ON public.account_health_logs;
CREATE POLICY "Users can view own account health logs"
ON public.account_health_logs
FOR SELECT
TO authenticated
USING (account_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own account health logs" ON public.account_health_logs;
CREATE POLICY "Users can insert own account health logs"
ON public.account_health_logs
FOR INSERT
TO authenticated
WITH CHECK (account_id = auth.uid());

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d
      ON d.objid = p.oid
      AND d.classid = 'pg_proc'::regclass
      AND d.refclassid = 'pg_extension'::regclass
      AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND d.objid IS NULL
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(p.proconfig) cfg
          WHERE cfg LIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, auth, extensions, pg_temp', fn.signature);
  END LOOP;
END;
$$;
