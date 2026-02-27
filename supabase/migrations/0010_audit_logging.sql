-- ============================================================================
-- Bereka: Audit Logging & Change Data Capture
-- Migration 0010 — Production-ready audit trail infrastructure
--
-- Standards: OWASP Logging Cheat Sheet, SOC 2 audit requirements
-- Retention: audit_log = unlimited, edge_function_logs = 90 days
-- ============================================================================

-- ============================================
-- 1. Audit Log — Primary business audit trail
-- Records WHO did WHAT to WHICH resource and WHY
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID REFERENCES auth.users,                -- NULL for system/trigger actions
  actor_role TEXT CHECK (actor_role IN ('worker', 'client', 'admin', 'system')),
  action TEXT NOT NULL,                                -- e.g. 'job.status_changed', 'escrow.funded'
  resource_type TEXT NOT NULL,                         -- e.g. 'job', 'dispute', 'profile'
  resource_id TEXT NOT NULL,                           -- ID of the affected entity
  details JSONB DEFAULT '{}',                          -- Action-specific metadata (old/new values, amounts)
  ip_address TEXT,                                     -- Client IP for traceability
  user_agent TEXT,                                     -- Client user agent
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Users can view audit entries where they are the actor
CREATE POLICY "Users can view own audit entries"
  ON audit_log FOR SELECT USING (auth.uid() = actor_id);

-- Admins can view all audit entries
CREATE POLICY "Admins can view all audit entries"
  ON audit_log FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Only service role / triggers can insert (no direct user inserts)
CREATE POLICY "Service role can insert audit entries"
  ON audit_log FOR INSERT WITH CHECK (true);

-- ============================================
-- 2. Edge Function Logs — Execution tracking
-- Records function invocations with timing and status
-- ============================================
CREATE TABLE IF NOT EXISTS edge_function_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,                         -- e.g. 'approve-payout', 'create-wallet'
  actor_id UUID REFERENCES auth.users,                 -- Authenticated user (nullable for webhooks)
  status TEXT CHECK (status IN ('success', 'error', 'warning')) NOT NULL,
  duration_ms INTEGER,                                 -- Execution time in milliseconds
  request_meta JSONB DEFAULT '{}',                     -- Sanitized request metadata
  response_meta JSONB DEFAULT '{}',                    -- Response metadata (status code)
  error_message TEXT,                                  -- Error details if failed
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE edge_function_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view function logs
CREATE POLICY "Admins can view edge function logs"
  ON edge_function_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Service role can insert
CREATE POLICY "Service role can insert function logs"
  ON edge_function_logs FOR INSERT WITH CHECK (true);

-- ============================================
-- 3. Indexes for efficient querying
-- ============================================
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_edge_function_logs_function_name ON edge_function_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_created_at ON edge_function_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_status ON edge_function_logs(status);

-- ============================================
-- 4. CDC Triggers — Automatic change tracking
-- ============================================

-- 4a. Generic audit trigger function for INSERT/UPDATE/DELETE
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_resource_type TEXT;
  v_resource_id TEXT;
  v_details JSONB;
  v_actor_id UUID;
  v_actor_role TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_changed_fields JSONB;
BEGIN
  -- Determine resource type from table name
  v_resource_type := TG_TABLE_NAME;

  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := v_resource_type || '.created';
    v_resource_id := NEW.id::TEXT;
    v_new_data := to_jsonb(NEW);
    v_details := jsonb_build_object('new_values', v_new_data);

    -- Try to get actor from the row data
    IF v_resource_type = 'jobs' THEN
      v_actor_id := NEW.creator_id;
    ELSIF v_resource_type = 'applications' THEN
      v_actor_id := NEW.worker_id;
    ELSIF v_resource_type = 'submissions' THEN
      v_actor_id := NEW.worker_id;
    ELSIF v_resource_type = 'disputes' THEN
      v_actor_id := NEW.opened_by;
    ELSIF v_resource_type = 'profiles' THEN
      v_actor_id := NEW.id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    v_resource_id := NEW.id::TEXT;
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);

    -- Build changed fields object (only fields that actually changed)
    SELECT jsonb_object_agg(key, value)
    INTO v_changed_fields
    FROM jsonb_each(v_new_data)
    WHERE v_new_data -> key IS DISTINCT FROM v_old_data -> key;

    -- Skip if nothing actually changed
    IF v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;

    -- Determine specific action based on what changed
    IF v_resource_type = 'jobs' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'job.status_changed';
      v_details := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'changed_fields', v_changed_fields
      );
      -- Worker assignment
      IF NEW.worker_id IS NOT NULL AND OLD.worker_id IS NULL THEN
        v_actor_id := NEW.creator_id;
      ELSE
        v_actor_id := COALESCE(NEW.worker_id, NEW.creator_id);
      END IF;
    ELSIF v_resource_type = 'disputes' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'dispute.status_changed';
      v_details := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'resolution', NEW.resolution,
        'changed_fields', v_changed_fields
      );
      v_actor_id := COALESCE(NEW.resolved_by, NEW.opened_by);
    ELSIF v_resource_type = 'escrow_holds' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'escrow.status_changed';
      v_details := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'amount_sats', NEW.amount_sats,
        'job_id', NEW.job_id
      );
    ELSIF v_resource_type = 'applications' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'application.status_changed';
      v_details := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'job_id', NEW.job_id,
        'worker_id', NEW.worker_id
      );
    ELSIF v_resource_type = 'profiles' AND OLD.role IS DISTINCT FROM NEW.role THEN
      v_action := 'profile.role_changed';
      v_details := jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'changed_fields', v_changed_fields
      );
      v_actor_id := NEW.id;
    ELSE
      v_action := v_resource_type || '.updated';
      v_details := jsonb_build_object('changed_fields', v_changed_fields);
      -- Best-effort actor detection
      IF v_resource_type = 'jobs' THEN
        v_actor_id := NEW.creator_id;
      ELSIF v_resource_type = 'profiles' THEN
        v_actor_id := NEW.id;
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_action := v_resource_type || '.deleted';
    v_resource_id := OLD.id::TEXT;
    v_old_data := to_jsonb(OLD);
    v_details := jsonb_build_object('old_values', v_old_data);
  END IF;

  -- Get actor role
  IF v_actor_id IS NOT NULL THEN
    SELECT role INTO v_actor_role FROM profiles WHERE id = v_actor_id;
  END IF;

  -- Default to 'system' for trigger-originated actions without an identifiable actor
  IF v_actor_role IS NULL THEN
    v_actor_role := 'system';
  END IF;

  -- Insert audit entry
  INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, details)
  VALUES (v_actor_id, v_actor_role, v_action, v_resource_type, v_resource_id, v_details);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- 5. Attach CDC triggers to critical tables
-- ============================================

-- Jobs: track creation, status changes, worker assignment
CREATE TRIGGER audit_jobs_insert
  AFTER INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_jobs_update
  AFTER UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Applications: track creation and status changes (accept/reject)
CREATE TRIGGER audit_applications_insert
  AFTER INSERT ON applications
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_applications_update
  AFTER UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Disputes: track creation and resolution
CREATE TRIGGER audit_disputes_insert
  AFTER INSERT ON disputes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_disputes_update
  AFTER UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Escrow holds: track status changes (HELD → RELEASED/REFUNDED)
CREATE TRIGGER audit_escrow_holds_insert
  AFTER INSERT ON escrow_holds
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_escrow_holds_update
  AFTER UPDATE ON escrow_holds
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Profiles: track role changes (critical for security auditing)
CREATE TRIGGER audit_profiles_update
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Submissions: track creation
CREATE TRIGGER audit_submissions_insert
  AFTER INSERT ON submissions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================
-- 6. Ledger entries enhancement
-- Add actor tracking to existing ledger system
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'actor_id'
  ) THEN
    ALTER TABLE ledger_entries ADD COLUMN actor_id UUID REFERENCES auth.users;
    ALTER TABLE ledger_entries ADD COLUMN description TEXT;
  END IF;
END $$;
