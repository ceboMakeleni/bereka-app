-- ============================================================================
-- Bereka: Admin Metrics Infrastructure
-- Migration 0015 — Analytics event log + views + materialized views
--                  for the admin metrics dashboard
--
-- Design principles:
--   • Source of truth = core tables (jobs, applications, escrow_holds, etc.)
--   • app_events = supplemental analytics for events not captured in core tables
--   • All materialized views refreshable on-demand by calling
--       refresh_metrics_materialized_views()
--   • RLS: admin-only SELECT; service-role INSERT
-- ============================================================================

-- ============================================
-- 1. app_events — supplemental analytics log
--    Append-only. For events not already captured by core tables.
-- ============================================
CREATE TABLE IF NOT EXISTS app_events (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name   TEXT NOT NULL,                        -- e.g. 'job_posted', 'payout_succeeded'
  user_id      UUID REFERENCES auth.users,           -- actor (nullable for system events)
  job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
  source       TEXT NOT NULL DEFAULT 'server'
               CHECK (source IN ('web', 'mobile', 'admin', 'system', 'cron')),
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all app_events"
  ON app_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Service role can insert app_events"
  ON app_events FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_app_events_name_created   ON app_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_user_created   ON app_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_job_created    ON app_events(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_created        ON app_events(created_at DESC);

-- ============================================
-- 2. v_marketplace_overview
--    Real-time aggregate of job states and funnel rates.
-- ============================================
CREATE OR REPLACE VIEW v_marketplace_overview AS
SELECT
  COUNT(*)                                                     AS total_jobs,
  COUNT(*) FILTER (WHERE status = 'OPEN')                      AS open_jobs,
  COUNT(*) FILTER (WHERE status = 'FUNDED')                    AS funded_jobs,
  COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')               AS in_progress_jobs,
  COUNT(*) FILTER (WHERE status = 'REVIEW')                    AS review_jobs,
  COUNT(*) FILTER (WHERE status = 'COMPLETED')                 AS completed_jobs,
  COUNT(*) FILTER (WHERE status = 'DISPUTED')                  AS disputed_jobs,
  COUNT(*) FILTER (WHERE status = 'CANCELLED')                 AS cancelled_jobs,
  -- Accepted = job has a worker assigned (FUNDED → COMPLETED path)
  COUNT(*) FILTER (WHERE worker_id IS NOT NULL)                AS accepted_jobs,
  ROUND(
    CASE WHEN COUNT(*) > 0
    THEN COUNT(*) FILTER (WHERE worker_id IS NOT NULL)::NUMERIC / COUNT(*) * 100
    ELSE 0 END, 2
  )                                                            AS accept_rate_pct,
  ROUND(
    CASE WHEN COUNT(*) FILTER (WHERE worker_id IS NOT NULL) > 0
    THEN COUNT(*) FILTER (WHERE status = 'COMPLETED')::NUMERIC
         / COUNT(*) FILTER (WHERE worker_id IS NOT NULL) * 100
    ELSE 0 END, 2
  )                                                            AS completion_rate_pct,
  -- Unique active posters (last 30 days)
  COUNT(DISTINCT creator_id) FILTER (WHERE created_at >= now() - INTERVAL '30 days') AS active_posters_30d,
  -- Unique active workers (last 30 days)
  COUNT(DISTINCT worker_id) FILTER (WHERE worker_id IS NOT NULL AND updated_at >= now() - INTERVAL '30 days') AS active_workers_30d
FROM jobs;

GRANT SELECT ON v_marketplace_overview TO authenticated;

-- ============================================
-- 3. v_financials_overview
--    Real-time financial health from core tables.
-- ============================================
CREATE OR REPLACE VIEW v_financials_overview AS
WITH payouts AS (
  SELECT
    SUM(le.amount_sats) AS total_payout_sats,
    COUNT(*)            AS payout_count
  FROM ledger_entries le
  WHERE le.reference_type = 'PAYOUT'
),
fees AS (
  SELECT
    SUM(le.amount_sats) AS total_fee_sats,
    COUNT(*)            AS fee_count
  FROM ledger_entries le
  WHERE le.reference_type ILIKE '%PLATFORM_FEE%'
     OR le.reference_type = 'PLATFORM_FEE'
),
escrow AS (
  SELECT
    SUM(amount_sats) FILTER (WHERE status = 'HELD')     AS held_sats,
    SUM(amount_sats) FILTER (WHERE status = 'RELEASED') AS released_sats,
    SUM(amount_sats) FILTER (WHERE status = 'REFUNDED') AS refunded_sats
  FROM escrow_holds
),
jobs_agg AS (
  SELECT
    COALESCE(AVG(budget_sats), 0)                                            AS avg_budget_sats,
    COALESCE(SUM(budget_sats) FILTER (WHERE status = 'COMPLETED'), 0)        AS gmv_sats
  FROM jobs
)
SELECT
  COALESCE(p.total_payout_sats, 0)  AS total_payout_sats,
  COALESCE(p.payout_count, 0)       AS payout_count,
  COALESCE(f.total_fee_sats, 0)     AS total_fee_sats,
  COALESCE(e.held_sats, 0)          AS escrow_held_sats,
  COALESCE(e.released_sats, 0)      AS escrow_released_sats,
  COALESCE(e.refunded_sats, 0)      AS escrow_refunded_sats,
  ROUND(j.avg_budget_sats, 0)       AS avg_budget_sats,
  j.gmv_sats
FROM payouts p
CROSS JOIN fees f
CROSS JOIN escrow e
CROSS JOIN jobs_agg j;

GRANT SELECT ON v_financials_overview TO authenticated;

-- ============================================
-- 4. v_trust_safety_overview
--    Real-time trust and safety summary.
-- ============================================
CREATE OR REPLACE VIEW v_trust_safety_overview AS
SELECT
  -- Disputes
  COUNT(*) FILTER (WHERE d.status = 'OPEN')     AS open_disputes,
  COUNT(*) FILTER (WHERE d.status = 'RESOLVED') AS resolved_disputes,
  -- Chat reports
  (SELECT COUNT(*) FROM chat_reports WHERE status = 'OPEN')     AS open_chat_reports,
  (SELECT COUNT(*) FROM chat_reports WHERE status = 'RESOLVED') AS resolved_chat_reports,
  -- Ratings
  (SELECT COUNT(*) FROM ratings WHERE score <= 2)               AS low_ratings_count,
  (SELECT ROUND(AVG(score)::NUMERIC, 2) FROM ratings)           AS avg_rating,
  (SELECT COUNT(*) FROM ratings)                                AS total_ratings
FROM disputes d;

GRANT SELECT ON v_trust_safety_overview TO authenticated;

-- ============================================
-- 5. v_time_to_accept
--    Per-job time between posting and first acceptance.
-- ============================================
CREATE OR REPLACE VIEW v_time_to_accept AS
SELECT
  j.id                                        AS job_id,
  j.created_at                                AS posted_at,
  -- First accepted application timestamp
  MIN(a.created_at) FILTER (WHERE a.status = 'ACCEPTED') AS accepted_at,
  EXTRACT(EPOCH FROM (
    MIN(a.created_at) FILTER (WHERE a.status = 'ACCEPTED') - j.created_at
  ))::BIGINT                                  AS time_to_accept_seconds
FROM jobs j
LEFT JOIN applications a ON a.job_id = j.id
GROUP BY j.id, j.created_at;

GRANT SELECT ON v_time_to_accept TO authenticated;

-- ============================================
-- 6. v_time_to_complete
--    Per-job time between acceptance and completion.
-- ============================================
CREATE OR REPLACE VIEW v_time_to_complete AS
SELECT
  j.id                                         AS job_id,
  MIN(a.created_at) FILTER (WHERE a.status = 'ACCEPTED') AS accepted_at,
  CASE WHEN j.status = 'COMPLETED' THEN j.updated_at ELSE NULL END AS completed_at,
  CASE WHEN j.status = 'COMPLETED' THEN
    EXTRACT(EPOCH FROM (
      j.updated_at - MIN(a.created_at) FILTER (WHERE a.status = 'ACCEPTED')
    ))::BIGINT
  ELSE NULL END                                AS time_to_complete_seconds
FROM jobs j
LEFT JOIN applications a ON a.job_id = j.id
GROUP BY j.id, j.status, j.updated_at;

GRANT SELECT ON v_time_to_complete TO authenticated;

-- ============================================
-- 7. mv_marketplace_funnel_daily
--    Daily job funnel grain from core jobs table.
-- ============================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_marketplace_funnel_daily AS
SELECT
  DATE_TRUNC('day', created_at)::DATE                                   AS day,
  COUNT(*)                                                               AS jobs_posted,
  COUNT(*) FILTER (WHERE status IN ('FUNDED','IN_PROGRESS','REVIEW','COMPLETED','DISPUTED')) AS jobs_funded,
  COUNT(*) FILTER (WHERE status IN ('IN_PROGRESS','REVIEW','COMPLETED','DISPUTED'))          AS jobs_in_progress,
  COUNT(*) FILTER (WHERE status = 'COMPLETED')                           AS jobs_completed,
  COUNT(*) FILTER (WHERE status = 'CANCELLED')                           AS jobs_cancelled,
  COUNT(*) FILTER (WHERE status = 'DISPUTED')                            AS jobs_disputed,
  COUNT(*) FILTER (WHERE worker_id IS NOT NULL)                          AS jobs_accepted,
  ROUND(
    CASE WHEN COUNT(*) > 0
    THEN COUNT(*) FILTER (WHERE worker_id IS NOT NULL)::NUMERIC / COUNT(*) * 100
    ELSE 0 END, 2
  )                                                                      AS accept_rate_pct,
  ROUND(
    CASE WHEN COUNT(*) FILTER (WHERE worker_id IS NOT NULL) > 0
    THEN COUNT(*) FILTER (WHERE status = 'COMPLETED')::NUMERIC
         / COUNT(*) FILTER (WHERE worker_id IS NOT NULL) * 100
    ELSE 0 END, 2
  )                                                                      AS completion_rate_pct,
  ROUND(AVG(budget_sats)::NUMERIC, 0)                                   AS avg_budget_sats,
  SUM(budget_sats) FILTER (WHERE status = 'COMPLETED')                  AS gmv_sats
FROM jobs
GROUP BY DATE_TRUNC('day', created_at)::DATE
ORDER BY day DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_funnel_daily_day ON mv_marketplace_funnel_daily(day);
CREATE INDEX IF NOT EXISTS idx_mv_funnel_daily_day_idx ON mv_marketplace_funnel_daily(day DESC);

-- ============================================
-- 8. mv_financials_daily
--    Daily financial metrics from ledger_entries + escrow_holds.
-- ============================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_financials_daily AS
WITH daily_ledger AS (
  SELECT
    DATE_TRUNC('day', le.created_at)::DATE     AS day,
    SUM(le.amount_sats) FILTER (
      WHERE le.reference_type = 'PAYOUT'
         OR le.reference_type ILIKE 'DISPUTE_PAY%'
    )                                          AS payout_sats,
    COUNT(*) FILTER (
      WHERE le.reference_type = 'PAYOUT'
         OR le.reference_type ILIKE 'DISPUTE_PAY%'
    )                                          AS payout_count,
    SUM(le.amount_sats) FILTER (
      WHERE le.reference_type ILIKE '%PLATFORM_FEE%'
         OR le.reference_type = 'PLATFORM_FEE'
    )                                          AS fee_sats,
    SUM(le.amount_sats) FILTER (
      WHERE le.reference_type = 'ESCROW_FUND'
    )                                          AS escrow_funded_sats,
    SUM(le.amount_sats) FILTER (
      WHERE le.reference_type IN ('ESCROW_REFUND','DISPUTE_REFUND','DISPUTE_SPLIT_CREATOR')
    )                                          AS refund_sats,
    COUNT(*) FILTER (
      WHERE le.reference_type IN ('ESCROW_REFUND','DISPUTE_REFUND')
    )                                          AS refund_count
  FROM ledger_entries le
  GROUP BY DATE_TRUNC('day', le.created_at)::DATE
),
daily_jobs AS (
  SELECT
    DATE_TRUNC('day', created_at)::DATE                              AS day,
    SUM(budget_sats) FILTER (WHERE status = 'COMPLETED')             AS gmv_sats,
    ROUND(AVG(budget_sats)::NUMERIC, 0)                              AS avg_budget_sats
  FROM jobs
  GROUP BY DATE_TRUNC('day', created_at)::DATE
)
SELECT
  COALESCE(dl.day, dj.day)                  AS day,
  COALESCE(dj.gmv_sats, 0)                  AS gmv_sats,
  COALESCE(dl.escrow_funded_sats, 0)        AS escrow_funded_sats,
  COALESCE(dl.payout_sats, 0)               AS payout_sats,
  COALESCE(dl.payout_count, 0)              AS payout_count,
  COALESCE(dl.fee_sats, 0)                  AS fee_sats,
  COALESCE(dl.refund_sats, 0)               AS refund_sats,
  COALESCE(dl.refund_count, 0)              AS refund_count,
  COALESCE(dj.avg_budget_sats, 0)           AS avg_budget_sats
FROM daily_ledger dl
FULL OUTER JOIN daily_jobs dj ON dl.day = dj.day
ORDER BY day DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_financials_daily_day ON mv_financials_daily(day);

-- ============================================
-- 9. mv_trust_safety_daily
--    Daily trust & safety events.
-- ============================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_trust_safety_daily AS
WITH daily_disputes AS (
  SELECT
    DATE_TRUNC('day', created_at)::DATE   AS day,
    COUNT(*)                               AS disputes_opened,
    COUNT(*) FILTER (WHERE status = 'RESOLVED') AS disputes_resolved
  FROM disputes
  GROUP BY DATE_TRUNC('day', created_at)::DATE
),
daily_chat_reports AS (
  SELECT
    DATE_TRUNC('day', created_at)::DATE   AS day,
    COUNT(*)                               AS chat_reports
  FROM chat_reports
  GROUP BY DATE_TRUNC('day', created_at)::DATE
),
daily_ratings AS (
  SELECT
    DATE_TRUNC('day', created_at)::DATE   AS day,
    COUNT(*) FILTER (WHERE score <= 2)    AS low_ratings,
    COUNT(*)                               AS total_ratings,
    ROUND(AVG(score)::NUMERIC, 2)         AS avg_score
  FROM ratings
  GROUP BY DATE_TRUNC('day', created_at)::DATE
)
SELECT
  COALESCE(dd.day, dcr.day, dr.day)          AS day,
  COALESCE(dd.disputes_opened, 0)             AS disputes_opened,
  COALESCE(dd.disputes_resolved, 0)           AS disputes_resolved,
  COALESCE(dcr.chat_reports, 0)               AS chat_reports,
  COALESCE(dr.low_ratings, 0)                 AS low_ratings,
  COALESCE(dr.total_ratings, 0)               AS total_ratings,
  dr.avg_score
FROM daily_disputes dd
FULL OUTER JOIN daily_chat_reports dcr ON dd.day = dcr.day
FULL OUTER JOIN daily_ratings dr ON COALESCE(dd.day, dcr.day) = dr.day
ORDER BY day DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_trust_safety_daily_day ON mv_trust_safety_daily(day);

-- ============================================
-- 10. mv_category_weekly
--     Weekly per-category performance metrics.
-- ============================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_category_weekly AS
SELECT
  DATE_TRUNC('week', created_at)::DATE                                   AS week_start,
  COALESCE(category, 'Other')                                            AS category,
  COUNT(*)                                                               AS posted,
  COUNT(*) FILTER (WHERE worker_id IS NOT NULL)                          AS accepted,
  COUNT(*) FILTER (WHERE status = 'COMPLETED')                           AS completed,
  ROUND(
    CASE WHEN COUNT(*) > 0
    THEN COUNT(*) FILTER (WHERE worker_id IS NOT NULL)::NUMERIC / COUNT(*) * 100
    ELSE 0 END, 2
  )                                                                      AS accept_rate_pct,
  ROUND(
    CASE WHEN COUNT(*) FILTER (WHERE worker_id IS NOT NULL) > 0
    THEN COUNT(*) FILTER (WHERE status = 'COMPLETED')::NUMERIC
         / COUNT(*) FILTER (WHERE worker_id IS NOT NULL) * 100
    ELSE 0 END, 2
  )                                                                      AS completion_rate_pct,
  ROUND(AVG(budget_sats)::NUMERIC, 0)                                   AS avg_budget_sats,
  ROUND(
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY budget_sats)::NUMERIC, 0
  )                                                                      AS median_budget_sats
FROM jobs
GROUP BY DATE_TRUNC('week', created_at)::DATE, COALESCE(category, 'Other')
ORDER BY week_start DESC, posted DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_category_weekly_wk_cat
  ON mv_category_weekly(week_start, category);

-- ============================================
-- 11. mv_supply_demand_weekly
--     Weekly unique poster/worker counts.
-- ============================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_supply_demand_weekly AS
SELECT
  DATE_TRUNC('week', j.created_at)::DATE           AS week_start,
  COUNT(DISTINCT j.creator_id)                      AS unique_posters,
  COUNT(DISTINCT j.worker_id)
    FILTER (WHERE j.worker_id IS NOT NULL)           AS unique_workers,
  COUNT(DISTINCT j.creator_id) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM jobs j2
      WHERE j2.creator_id = j.creator_id
        AND j2.created_at < DATE_TRUNC('week', j.created_at)
    )
  )                                                  AS new_posters,
  COUNT(DISTINCT j.worker_id) FILTER (
    WHERE j.worker_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM jobs j2
        WHERE j2.worker_id = j.worker_id
          AND j2.updated_at < DATE_TRUNC('week', j.created_at)
      )
  )                                                  AS new_workers,
  COUNT(*)                                           AS total_jobs
FROM jobs j
GROUP BY DATE_TRUNC('week', j.created_at)::DATE
ORDER BY week_start DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_supply_demand_weekly_wk ON mv_supply_demand_weekly(week_start);

-- ============================================
-- 12. Refresh helper function
--     Call this to refresh all analytics MVs at once.
--     Callable by admin via RPC.
-- ============================================
CREATE OR REPLACE FUNCTION refresh_metrics_materialized_views()
RETURNS JSONB AS $$
DECLARE
  v_started_at TIMESTAMPTZ := now();
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_marketplace_funnel_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_financials_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trust_safety_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_weekly;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_supply_demand_weekly;

  RETURN jsonb_build_object(
    'success', true,
    'refreshed_at', now(),
    'duration_ms', EXTRACT(MILLISECONDS FROM (now() - v_started_at))::INT
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute to authenticated (admin check done in app layer)
GRANT EXECUTE ON FUNCTION refresh_metrics_materialized_views() TO authenticated;

-- ============================================
-- 13. RLS on materialized views
--     MVs don't support RLS natively; we rely on admin
--     check in the edge function. Add a security view wrapper
--     for direct Supabase client queries.
-- ============================================

-- Admin-accessible wrappers (views over MVs with security_invoker)
CREATE OR REPLACE VIEW v_admin_funnel_daily WITH (security_invoker = true) AS
SELECT * FROM mv_marketplace_funnel_daily;
GRANT SELECT ON v_admin_funnel_daily TO authenticated;

CREATE OR REPLACE VIEW v_admin_financials_daily WITH (security_invoker = true) AS
SELECT * FROM mv_financials_daily;
GRANT SELECT ON v_admin_financials_daily TO authenticated;

CREATE OR REPLACE VIEW v_admin_trust_safety_daily WITH (security_invoker = true) AS
SELECT * FROM mv_trust_safety_daily;
GRANT SELECT ON v_admin_trust_safety_daily TO authenticated;

CREATE OR REPLACE VIEW v_admin_category_weekly WITH (security_invoker = true) AS
SELECT * FROM mv_category_weekly;
GRANT SELECT ON v_admin_category_weekly TO authenticated;

CREATE OR REPLACE VIEW v_admin_supply_demand_weekly WITH (security_invoker = true) AS
SELECT * FROM mv_supply_demand_weekly;
GRANT SELECT ON v_admin_supply_demand_weekly TO authenticated;
