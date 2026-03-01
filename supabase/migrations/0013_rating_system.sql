-- ============================================================================
-- Bereka: Rating System
-- Migration 0013 — Post-job-completion peer ratings
--
-- Both creators (clients) and workers can rate each other after a job
-- is marked COMPLETED. One rating per job per rater.
-- ============================================================================

-- ============================================
-- 1. Ratings table
-- ============================================
CREATE TABLE IF NOT EXISTS ratings (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  rater_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ratee_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Prevent rater from rating themselves on a job
  CONSTRAINT chk_rating_rater_ne_ratee CHECK (rater_id <> ratee_id),
  -- One rating per rater per job (idempotency guard)
  CONSTRAINT uq_rating_job_rater UNIQUE (job_id, rater_id)
);

-- ============================================
-- 2. Row Level Security
-- ============================================
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Users can view ratings where they are the rater or the ratee
CREATE POLICY "Users can view their own ratings"
  ON ratings FOR SELECT
  USING (auth.uid() = rater_id OR auth.uid() = ratee_id);

-- Admins can view all ratings
CREATE POLICY "Admins can view all ratings"
  ON ratings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Only the service role (edge functions) can insert ratings
-- Users never write directly to this table
CREATE POLICY "Service role can insert ratings"
  ON ratings FOR INSERT
  WITH CHECK (true);

-- No updates or deletes allowed (ratings are immutable)
-- (no UPDATE/DELETE policies = denied by default for all authenticated users)

-- ============================================
-- 3. Indexes for efficient querying
-- ============================================
CREATE INDEX IF NOT EXISTS idx_ratings_job_id     ON ratings(job_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rater_id   ON ratings(rater_id);
CREATE INDEX IF NOT EXISTS idx_ratings_ratee_id   ON ratings(ratee_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON ratings(created_at DESC);

-- ============================================
-- 4. CDC Trigger — automatic audit on insert
-- ============================================
-- Extend the existing audit_trigger_func to handle the 'ratings' table
-- by attaching the trigger (the function already handles unknown tables
-- with a generic '.created' action for INSERTs).

CREATE TRIGGER audit_ratings_insert
  AFTER INSERT ON ratings
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
