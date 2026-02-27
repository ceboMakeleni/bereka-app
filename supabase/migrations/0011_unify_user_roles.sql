-- ============================================================================
-- Migration: Unify User Roles
-- Remove worker/client distinction; all non-admin users become 'user'
--
-- ORDER MATTERS: Everything that the UPDATE on profiles could trigger
-- must be fixed BEFORE the UPDATE runs.
-- ============================================================================

-- 1. Fix audit trigger function (before any UPDATE that fires it)
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
  v_resource_type := TG_TABLE_NAME;

  IF TG_OP = 'INSERT' THEN
    v_action := v_resource_type || '.created';
    v_resource_id := NEW.id::TEXT;
    v_new_data := to_jsonb(NEW);
    v_details := jsonb_build_object('new_values', v_new_data);

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

    SELECT jsonb_object_agg(key, value)
    INTO v_changed_fields
    FROM jsonb_each(v_new_data)
    WHERE v_new_data -> key IS DISTINCT FROM v_old_data -> key;

    IF v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;

    IF v_resource_type = 'jobs' THEN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_action := 'job.status_changed';
        v_details := jsonb_build_object(
          'old_status', OLD.status, 'new_status', NEW.status,
          'changed_fields', v_changed_fields
        );
        IF NEW.worker_id IS NOT NULL AND OLD.worker_id IS NULL THEN
          v_actor_id := NEW.creator_id;
        ELSE
          v_actor_id := COALESCE(NEW.worker_id, NEW.creator_id);
        END IF;
      ELSE
        v_action := 'jobs.updated';
        v_details := jsonb_build_object('changed_fields', v_changed_fields);
        v_actor_id := NEW.creator_id;
      END IF;
    ELSIF v_resource_type = 'disputes' THEN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_action := 'dispute.status_changed';
        v_details := jsonb_build_object(
          'old_status', OLD.status, 'new_status', NEW.status,
          'resolution', NEW.resolution, 'changed_fields', v_changed_fields
        );
      ELSE
        v_action := 'disputes.updated';
        v_details := jsonb_build_object('changed_fields', v_changed_fields);
      END IF;
      v_actor_id := COALESCE(NEW.resolved_by, NEW.opened_by);
    ELSIF v_resource_type = 'escrow_holds' THEN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_action := 'escrow.status_changed';
        v_details := jsonb_build_object(
          'old_status', OLD.status, 'new_status', NEW.status,
          'amount_sats', NEW.amount_sats, 'job_id', NEW.job_id
        );
      ELSE
        v_action := 'escrow_holds.updated';
        v_details := jsonb_build_object('changed_fields', v_changed_fields);
      END IF;
    ELSIF v_resource_type = 'applications' THEN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_action := 'application.status_changed';
        v_details := jsonb_build_object(
          'old_status', OLD.status, 'new_status', NEW.status,
          'job_id', NEW.job_id, 'worker_id', NEW.worker_id
        );
      ELSE
        v_action := 'applications.updated';
        v_details := jsonb_build_object('changed_fields', v_changed_fields);
      END IF;
    ELSIF v_resource_type = 'profiles' THEN
      IF OLD.role IS DISTINCT FROM NEW.role THEN
        v_action := 'profile.role_changed';
        v_details := jsonb_build_object(
          'old_role', OLD.role, 'new_role', NEW.role,
          'changed_fields', v_changed_fields
        );
      ELSE
        v_action := 'profiles.updated';
        v_details := jsonb_build_object('changed_fields', v_changed_fields);
      END IF;
      v_actor_id := NEW.id;
    ELSE
      v_action := v_resource_type || '.updated';
      v_details := jsonb_build_object('changed_fields', v_changed_fields);
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_action := v_resource_type || '.deleted';
    v_resource_id := OLD.id::TEXT;
    v_old_data := to_jsonb(OLD);
    v_details := jsonb_build_object('old_values', v_old_data);
  END IF;

  IF v_actor_id IS NOT NULL THEN
    SELECT role INTO v_actor_role FROM profiles WHERE id = v_actor_id;
  END IF;
  IF v_actor_role IS NULL THEN
    v_actor_role := 'system';
  END IF;

  INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, details)
  VALUES (v_actor_id, v_actor_role, v_action, v_resource_type, v_resource_id, v_details);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Update audit_log constraint (trigger inserts 'user' role during the UPDATE below)
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_role_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_role_check
  CHECK (actor_role IN ('user', 'admin', 'system'));

-- 3. Drop old profiles CHECK constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 4. NOW it's safe to backfill (trigger + audit_log both accept 'user')
UPDATE profiles SET role = 'user' WHERE role IN ('worker', 'client');

-- 5. Add new profiles CHECK constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));

-- 6. Update default value
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'user';

-- 7. Recreate the profiles_public view
CREATE OR REPLACE VIEW profiles_public WITH (security_invoker = true) AS
SELECT
  id,
  updated_at,
  username,
  bio,
  role,
  skills,
  avatar_url,
  lnbits_id,
  (lnbits_admin_key IS NOT NULL) AS has_wallet
FROM profiles;

GRANT SELECT ON profiles_public TO authenticated;
GRANT SELECT ON profiles_public TO anon;
