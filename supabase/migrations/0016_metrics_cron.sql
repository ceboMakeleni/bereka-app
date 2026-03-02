-- ============================================================================
-- Migration 0016 — Nightly pg_cron job for metrics MV refresh
-- Requires: pg_cron extension (enabled in Supabase Dashboard → Database → Extensions)
-- Schedule: every day at 03:00 UTC (5:00 SAST)
-- ============================================================================

-- Unschedule any existing version of this job first (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bereka-refresh-metrics-views') THEN
    PERFORM cron.unschedule('bereka-refresh-metrics-views');
  END IF;
END;
$$;

-- Schedule nightly refresh at 03:00 UTC
SELECT cron.schedule(
  'bereka-refresh-metrics-views',      -- unique job name
  '0 3 * * *',                         -- cron expression: daily at 03:00 UTC
  $$SELECT refresh_metrics_materialized_views()$$
);

-- Verify the job was created
-- After running this migration you can confirm with:
--   SELECT jobid, jobname, schedule, command, active FROM cron.job;
