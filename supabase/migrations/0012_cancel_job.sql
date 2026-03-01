-- ============================================================================
-- Migration: Add atomic_cancel_job function
-- Allows a job creator to cancel their job (OPEN or FUNDED state).
-- If FUNDED, escrowed funds are refunded to the creator's AVAILABLE balance.
-- ============================================================================

-- Atomic cancellation of a job by its creator.
-- Safe to call on OPEN jobs (no escrow to unwind) and FUNDED jobs (refunds escrow).
-- Idempotent: returns early if job is already CANCELLED.
CREATE OR REPLACE FUNCTION atomic_cancel_job(
  p_job_id    UUID,
  p_creator_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_job          RECORD;
  v_escrow_hold  RECORD;
  v_creator_escrow    UUID;
  v_creator_available UUID;
BEGIN
  -- Lock the job row to prevent concurrent modifications
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id FOR UPDATE;
  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  -- Authorisation check
  IF v_job.creator_id <> p_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: only the job creator can cancel this job';
  END IF;

  -- Idempotency guard
  IF v_job.status = 'CANCELLED' THEN
    RETURN json_build_object('success', true, 'already_cancelled', true);
  END IF;

  -- Only OPEN or FUNDED jobs may be cancelled
  IF v_job.status NOT IN ('OPEN', 'FUNDED') THEN
    RAISE EXCEPTION 'Job cannot be cancelled in status: %', v_job.status;
  END IF;

  -- Handle FUNDED jobs: refund escrowed funds
  IF v_job.status = 'FUNDED' THEN
    SELECT * INTO v_escrow_hold
    FROM escrow_holds
    WHERE job_id = p_job_id AND status = 'HELD';

    IF v_escrow_hold IS NULL THEN
      RAISE EXCEPTION 'No active escrow hold found for funded job';
    END IF;

    SELECT id INTO v_creator_escrow
    FROM accounts WHERE user_id = p_creator_id AND type = 'ESCROW';

    SELECT id INTO v_creator_available
    FROM accounts WHERE user_id = p_creator_id AND type = 'AVAILABLE';

    IF v_creator_escrow IS NULL OR v_creator_available IS NULL THEN
      RAISE EXCEPTION 'Creator accounts not found';
    END IF;

    -- Return funds from escrow back to creator's available balance
    PERFORM move_funds(
      v_creator_escrow,
      v_creator_available,
      v_escrow_hold.amount_sats,
      'ESCROW_REFUND',
      p_job_id::TEXT
    );

    -- Mark escrow hold as refunded
    UPDATE escrow_holds
    SET status = 'REFUNDED'
    WHERE job_id = p_job_id AND status = 'HELD';
  END IF;

  -- Mark the job as cancelled
  UPDATE jobs SET status = 'CANCELLED' WHERE id = p_job_id;

  RETURN json_build_object(
    'success', true,
    'refunded', v_job.status = 'FUNDED',
    'amount_sats', COALESCE(v_escrow_hold.amount_sats, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
