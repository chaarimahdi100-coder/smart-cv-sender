-- ============================================================================
-- Migration: 20240107000000_fencing_and_atomic_lifecycle.sql
-- Project: Smart CV Sender
-- Description: 
--   1. Schema prerequisites and idempotent column additions.
--   2. Creation of distributed dispatch leases table with monotonic fencing tokens.
--   3. Absolute immutability trigger for audit log (email_events).
--   4. Legal and audit protection trigger preventing deletion of sending/sent applications.
--   5. Atomic stored procedure: acquire_mock_dispatch_lease.
--   6. Atomic stored procedure: transition_application_status_atomic.
--   7. Atomic stored procedure: save_email_draft_atomic (with conflict resolution & omission logic).
--   8. Atomic stored procedure: approve_email_draft_atomic (with state machine guards).
--   9. Rate limits table & atomic check_rate_limit procedure.
--  10. Strict PostgREST privilege hardening and RLS policies across all tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Prerequisites and Schema Guards
-- ----------------------------------------------------------------------------
ALTER TABLE public.applications 
  ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS send_idempotency_key text;

ALTER TABLE public.email_drafts 
  ADD COLUMN IF NOT EXISTS approved_attachment_hash text,
  ADD COLUMN IF NOT EXISTS conflict_resolution text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conflict_resolution_note text DEFAULT NULL;

ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'mock',
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;

-- Idempotent unique constraint on email_drafts(application_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_email_draft_per_application'
  ) THEN
    ALTER TABLE public.email_drafts 
      ADD CONSTRAINT unique_email_draft_per_application UNIQUE (application_id);
  END IF;
END $$;

-- Idempotent unique partial index on applications(send_idempotency_key)
CREATE UNIQUE INDEX IF NOT EXISTS unique_application_send_key
  ON public.applications (send_idempotency_key)
  WHERE send_idempotency_key IS NOT NULL;

-- Idempotent unique partial index on email_events(provider_id)
CREATE UNIQUE INDEX IF NOT EXISTS unique_email_event_provider_id
  ON public.email_events (provider_id)
  WHERE provider_id IS NOT NULL;

-- Change email_events foreign key from CASCADE to RESTRICT to protect audit logs from accidental cascade deletions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'email_events' AND constraint_name = 'email_events_application_id_fkey'
  ) THEN
    ALTER TABLE public.email_events DROP CONSTRAINT email_events_application_id_fkey;
  END IF;
  ALTER TABLE public.email_events ADD CONSTRAINT email_events_application_id_fkey
    FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE RESTRICT;
END $$;

-- Drop legacy function overloads from prior schema migrations before defining new signatures
DROP FUNCTION IF EXISTS public.save_email_draft_atomic(uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.transition_application_status_atomic(uuid, text, text);

-- ----------------------------------------------------------------------------
-- 2. Distributed Dispatch Leases Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispatch_leases (
  application_id uuid PRIMARY KEY REFERENCES public.applications(id) ON DELETE CASCADE,
  tracking_key text NOT NULL,
  lease_owner text NOT NULL,
  lease_expires_at timestamp with time zone NOT NULL,
  fencing_token bigint NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_leases_tracking_key 
  ON public.dispatch_leases (tracking_key);

CREATE INDEX IF NOT EXISTS idx_dispatch_leases_active 
  ON public.dispatch_leases (lease_expires_at) 
  WHERE status = 'processing';

ALTER TABLE public.dispatch_leases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own dispatch leases" ON public.dispatch_leases;
CREATE POLICY "Users can view own dispatch leases" ON public.dispatch_leases
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = dispatch_leases.application_id
        AND applications.user_id = auth.uid()
    )
  );

REVOKE ALL ON public.dispatch_leases FROM public, anon;
GRANT SELECT ON public.dispatch_leases TO authenticated;
GRANT ALL ON public.dispatch_leases TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Native PostgreSQL Immutability & Audit Triggers
-- ----------------------------------------------------------------------------

-- Trigger 3.1: Absolute append-only immutability for email_events
-- Blocks UPDATE and DELETE unconditionally, even for service_role or database admins
CREATE OR REPLACE FUNCTION public.fn_email_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Table public.email_events is an immutable, append-only audit log. UPDATE and DELETE operations are strictly prohibited.'
    USING ERRCODE = '55000'; -- object_not_in_prerequisite_state
END;
$$;

DROP TRIGGER IF EXISTS trg_email_events_immutable ON public.email_events;
CREATE TRIGGER trg_email_events_immutable
  BEFORE UPDATE OR DELETE ON public.email_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_email_events_immutable();

-- Trigger 3.2: Prevent deletion of applications in 'sending' or 'sent' status
CREATE OR REPLACE FUNCTION public.fn_prevent_sent_application_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('sending', 'sent') THEN
    RAISE EXCEPTION 'Cannot delete application %: status is "%". In-flight and sent applications are protected for audit compliance.',
      OLD.id, OLD.status
      USING ERRCODE = '55000'; -- object_not_in_prerequisite_state
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_sent_application_deletion ON public.applications;
CREATE TRIGGER trg_prevent_sent_application_deletion
  BEFORE DELETE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_sent_application_deletion();

-- ----------------------------------------------------------------------------
-- 4. RPC: acquire_mock_dispatch_lease
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acquire_mock_dispatch_lease(
  p_application_id uuid,
  p_worker_id text,
  p_tracking_key text,
  p_ttl_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app record;
  v_lease record;
  v_ttl interval;
  v_now timestamp with time zone := clock_timestamp();
BEGIN
  -- 1. Input validations
  IF p_application_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_application_id');
  END IF;

  IF p_worker_id IS NULL OR length(trim(p_worker_id)) < 3 OR NOT (p_worker_id ~ '^[a-zA-Z0-9_\-:.]{3,128}$') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_worker_id');
  END IF;

  IF p_tracking_key IS NULL OR length(trim(p_tracking_key)) < 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_tracking_key');
  END IF;

  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 5 OR p_ttl_seconds > 300 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_ttl_bounds');
  END IF;

  v_ttl := (p_ttl_seconds || ' seconds')::interval;

  -- 2. Lock ordering: Lock 1 = applications
  SELECT * INTO v_app
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'application_not_found');
  END IF;

  -- Candidate ownership check when invoked in authenticated user context
  IF auth.uid() IS NOT NULL AND v_app.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Application must be approved, sending, or failed to acquire dispatch lease
  IF v_app.status NOT IN ('approved', 'sending', 'failed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_application_status', 'current_status', v_app.status);
  END IF;

  -- 3. Lock ordering: Lock 2 = dispatch_leases
  SELECT * INTO v_lease
  FROM public.dispatch_leases
  WHERE application_id = p_application_id
  FOR UPDATE;

  -- Scenario A: Initial lease creation
  IF NOT FOUND THEN
    INSERT INTO public.dispatch_leases (
      application_id,
      tracking_key,
      lease_owner,
      lease_expires_at,
      fencing_token,
      status,
      created_at,
      updated_at
    ) VALUES (
      p_application_id,
      p_tracking_key,
      p_worker_id,
      v_now + v_ttl,
      1,
      'processing',
      v_now,
      v_now
    )
    RETURNING * INTO v_lease;

    UPDATE public.applications
    SET status = 'sending',
        send_idempotency_key = p_tracking_key,
        updated_at = v_now
    WHERE id = p_application_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'acquired',
      'fencing_token', v_lease.fencing_token,
      'lease_expires_at', v_lease.lease_expires_at
    );
  END IF;

  -- Scenario B: Prior lease exists with DIFFERENT tracking key (draft was edited)
  IF v_lease.tracking_key <> p_tracking_key THEN
    -- If prior send is still actively in-flight, do not overwrite
    IF v_lease.status = 'processing' AND v_lease.lease_expires_at > v_now THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'in_flight_prior_send',
        'lease_owner', v_lease.lease_owner,
        'retry_after_seconds', GREATEST(1, extract(epoch from (v_lease.lease_expires_at - v_now))::integer)
      );
    END IF;

    -- Prior lease expired or completed for an older draft revision: reset for new send
    UPDATE public.dispatch_leases
    SET tracking_key = p_tracking_key,
        lease_owner = p_worker_id,
        lease_expires_at = v_now + v_ttl,
        fencing_token = v_lease.fencing_token + 1,
        status = 'processing',
        result = NULL,
        updated_at = v_now
    WHERE application_id = p_application_id
    RETURNING * INTO v_lease;

    UPDATE public.applications
    SET status = 'sending',
        send_idempotency_key = p_tracking_key,
        updated_at = v_now
    WHERE id = p_application_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'reset_acquired',
      'fencing_token', v_lease.fencing_token,
      'lease_expires_at', v_lease.lease_expires_at
    );
  END IF;

  -- Scenario C: Prior lease exists with SAME tracking key and COMPLETED
  IF v_lease.status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'already_completed',
      'fencing_token', v_lease.fencing_token,
      'result', v_lease.result
    );
  END IF;

  -- Scenario D: Prior lease exists with SAME tracking key and actively in-flight
  IF v_lease.status = 'processing' AND v_lease.lease_expires_at > v_now THEN
    IF v_lease.lease_owner = p_worker_id THEN
      -- Reentry / renewal by identical worker
      UPDATE public.dispatch_leases
      SET lease_expires_at = v_now + v_ttl,
          updated_at = v_now
      WHERE application_id = p_application_id
      RETURNING * INTO v_lease;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'reentered',
        'fencing_token', v_lease.fencing_token,
        'lease_expires_at', v_lease.lease_expires_at
      );
    ELSE
      -- Dispatched to a different active worker
      RETURN jsonb_build_object(
        'success', false,
        'error', 'lease_in_flight',
        'lease_owner', v_lease.lease_owner,
        'retry_after_seconds', GREATEST(1, extract(epoch from (v_lease.lease_expires_at - v_now))::integer)
      );
    END IF;
  END IF;

  -- Scenario E: Expired processing lease or failed lease with same tracking key (Recovery)
  UPDATE public.dispatch_leases
  SET lease_owner = p_worker_id,
      lease_expires_at = v_now + v_ttl,
      fencing_token = v_lease.fencing_token + 1,
      status = 'processing',
      updated_at = v_now
  WHERE application_id = p_application_id
  RETURNING * INTO v_lease;

  UPDATE public.applications
  SET status = 'sending',
      updated_at = v_now
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'recovered',
    'fencing_token', v_lease.fencing_token,
    'lease_expires_at', v_lease.lease_expires_at
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPC: transition_application_status_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_application_status_atomic(
  p_application_id uuid,
  p_new_status text,
  p_idempotency_key text DEFAULT NULL,
  p_fencing_token bigint DEFAULT NULL,
  p_provider_id text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_provider text DEFAULT 'mock',
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app record;
  v_lease record;
  v_existing_event record;
  v_now timestamp with time zone := clock_timestamp();
BEGIN
  -- 1. Input validations
  IF p_application_id IS NULL OR p_new_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_required_arguments');
  END IF;

  IF p_new_status NOT IN ('draft', 'approved', 'sending', 'sent', 'failed', 'postponed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_target_status');
  END IF;

  -- 2. Lock 1 = applications
  SELECT * INTO v_app
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'application_not_found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_app.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- 3. Terminal state invariant
  IF v_app.status = 'sent' THEN
    IF p_new_status = 'sent' THEN
      RETURN jsonb_build_object('success', true, 'action', 'already_sent');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'terminal_state_immutable', 'message', 'Application has already been sent and cannot transition out of sent state.');
    END IF;
  END IF;

  -- ==========================================================================
  -- BRANCH: Transition to 'sent'
  -- ==========================================================================
  IF p_new_status = 'sent' THEN
    IF v_app.status <> 'sending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'from', v_app.status, 'to', 'sent');
    END IF;

    -- Strict Fencing Token Validation: reject NULL and <= 0
    IF p_fencing_token IS NULL OR p_fencing_token <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'missing_or_invalid_fencing_token');
    END IF;

    -- Validate against existing lease
    SELECT * INTO v_lease
    FROM public.dispatch_leases
    WHERE application_id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'lease_not_found');
    END IF;

    IF v_lease.status <> 'processing' THEN
      RETURN jsonb_build_object('success', false, 'error', 'lease_not_processing', 'current_lease_status', v_lease.status);
    END IF;

    IF v_lease.lease_expires_at <= v_now THEN
      RETURN jsonb_build_object('success', false, 'error', 'lease_expired');
    END IF;

    IF v_lease.fencing_token <> p_fencing_token THEN
      RETURN jsonb_build_object('success', false, 'error', 'stale_fencing_token', 'expected', v_lease.fencing_token, 'presented', p_fencing_token);
    END IF;

    -- Finalize lease
    UPDATE public.dispatch_leases
    SET status = 'completed',
        result = jsonb_build_object('provider_id', p_provider_id, 'payload', p_payload, 'completed_at', v_now),
        updated_at = v_now
    WHERE application_id = p_application_id;

    -- Validate Provider ID and Insert Audit Event
    IF p_provider_id IS NOT NULL THEN
      SELECT * INTO v_existing_event
      FROM public.email_events
      WHERE provider_id = p_provider_id;

      IF FOUND THEN
        IF v_existing_event.application_id <> p_application_id THEN
          RAISE EXCEPTION 'Provider message ID % is already registered to a different application %',
            p_provider_id, v_existing_event.application_id
            USING ERRCODE = '23505';
        END IF;
      ELSE
        INSERT INTO public.email_events (
          application_id, event_type, provider_id, provider, payload, created_at
        ) VALUES (
          p_application_id, COALESCE(p_event_type, 'sent'), p_provider_id, p_provider, p_payload, v_now
        );
      END IF;
    END IF;

    -- Finalize application status
    UPDATE public.applications
    SET status = 'sent',
        sent_at = v_now,
        updated_at = v_now
    WHERE id = p_application_id;

    RETURN jsonb_build_object('success', true, 'action', 'transitioned_to_sent');

  -- ==========================================================================
  -- BRANCH: Transition to 'sending'
  -- ==========================================================================
  ELSIF p_new_status = 'sending' THEN
    IF v_app.status NOT IN ('approved', 'sending', 'failed') THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'from', v_app.status, 'to', 'sending');
    END IF;

    IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'missing_idempotency_key');
    END IF;

    -- Prevent modifying in-flight key
    IF v_app.status = 'sending' AND v_app.send_idempotency_key IS NOT NULL AND v_app.send_idempotency_key <> p_idempotency_key THEN
      RETURN jsonb_build_object('success', false, 'error', 'in_flight_key_mismatch');
    END IF;

    -- Ensure draft approval is intact
    IF NOT EXISTS (
      SELECT 1 FROM public.email_drafts
      WHERE application_id = p_application_id
        AND approved_at IS NOT NULL
        AND approved_hash IS NOT NULL AND approved_hash ~ '^[0-9a-fA-F]{64}$'
        AND approved_attachment_hash IS NOT NULL AND approved_attachment_hash ~ '^[0-9a-fA-F]{64}$'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'missing_or_invalid_approval');
    END IF;

    UPDATE public.applications
    SET status = 'sending',
        send_idempotency_key = p_idempotency_key,
        updated_at = v_now
    WHERE id = p_application_id;

    RETURN jsonb_build_object('success', true, 'action', 'transitioned_to_sending');

  -- ==========================================================================
  -- BRANCH: Transition to 'failed'
  -- ==========================================================================
  ELSIF p_new_status = 'failed' THEN
    IF v_app.status <> 'sending' AND v_app.status <> 'failed' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'from', v_app.status, 'to', 'failed');
    END IF;

    -- Fencing token verification on failure if token is provided
    IF p_fencing_token IS NOT NULL THEN
      SELECT * INTO v_lease
      FROM public.dispatch_leases
      WHERE application_id = p_application_id
      FOR UPDATE;

      IF FOUND THEN
        IF v_lease.status = 'processing' AND v_lease.fencing_token = p_fencing_token AND v_lease.lease_expires_at > v_now THEN
          UPDATE public.dispatch_leases
          SET status = 'failed',
              result = jsonb_build_object('error', p_error_message, 'failed_at', v_now),
              updated_at = v_now
          WHERE application_id = p_application_id;
        ELSE
          RETURN jsonb_build_object('success', false, 'error', 'stale_fencing_token_on_failure');
        END IF;
      END IF;
    END IF;

    -- Audit failure event
    INSERT INTO public.email_events (
      application_id, event_type, provider_id, provider, payload, error_message, created_at
    ) VALUES (
      p_application_id, 'failed', p_provider_id, p_provider, p_payload, p_error_message, v_now
    );

    UPDATE public.applications
    SET status = 'failed',
        updated_at = v_now
    WHERE id = p_application_id;

    RETURN jsonb_build_object('success', true, 'action', 'transitioned_to_failed');

  -- ==========================================================================
  -- BRANCH: Transition to 'postponed'
  -- ==========================================================================
  ELSIF p_new_status = 'postponed' THEN
    -- STRICT INVARIANT: 'sending' can NEVER be postponed
    IF v_app.status NOT IN ('draft', 'approved', 'failed', 'postponed') THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'from', v_app.status, 'to', 'postponed');
    END IF;

    UPDATE public.applications
    SET status = 'postponed',
        updated_at = v_now
    WHERE id = p_application_id;

    RETURN jsonb_build_object('success', true, 'action', 'transitioned_to_postponed');

  -- ==========================================================================
  -- BRANCH: Transition to 'draft'
  -- ==========================================================================
  ELSIF p_new_status = 'draft' THEN
    IF v_app.status IN ('sending', 'sent') THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'from', v_app.status, 'to', 'draft');
    END IF;

    -- Invalidate draft approvals
    UPDATE public.email_drafts
    SET approved_at = NULL,
        approved_hash = NULL,
        approved_attachment_hash = NULL,
        updated_at = v_now
    WHERE application_id = p_application_id;

    UPDATE public.applications
    SET status = 'draft',
        updated_at = v_now
    WHERE id = p_application_id;

    RETURN jsonb_build_object('success', true, 'action', 'transitioned_to_draft');

  -- ==========================================================================
  -- BRANCH: Transition to 'approved'
  -- ==========================================================================
  ELSIF p_new_status = 'approved' THEN
    -- STRICT INVARIANT: Direct transition postponed -> approved is FORBIDDEN
    IF v_app.status NOT IN ('draft', 'approved', 'failed') THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'from', v_app.status, 'to', 'approved');
    END IF;

    -- Ensure approved draft exists
    IF NOT EXISTS (
      SELECT 1 FROM public.email_drafts
      WHERE application_id = p_application_id
        AND approved_at IS NOT NULL
        AND approved_hash IS NOT NULL AND approved_hash ~ '^[0-9a-fA-F]{64}$'
        AND approved_attachment_hash IS NOT NULL AND approved_attachment_hash ~ '^[0-9a-fA-F]{64}$'
        AND recipient_email IS NOT NULL AND trim(recipient_email) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
        AND subject IS NOT NULL AND trim(subject) <> ''
        AND body IS NOT NULL AND trim(body) <> ''
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'draft_not_approved_prerequisite');
    END IF;

    UPDATE public.applications
    SET status = 'approved',
        updated_at = v_now
    WHERE id = p_application_id;

    RETURN jsonb_build_object('success', true, 'action', 'transitioned_to_approved');

  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'unhandled_transition');
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC: save_email_draft_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_email_draft_atomic(
  p_application_id uuid,
  p_recipient text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_resume_id uuid DEFAULT NULL,
  p_conflict_resolution text DEFAULT '__OMITTED__',
  p_conflict_resolution_note text DEFAULT '__OMITTED__'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app record;
  v_draft record;
  v_resolved_conflict text;
  v_resolved_note text;
  v_now timestamp with time zone := clock_timestamp();
BEGIN
  -- 1. Input checks
  IF p_application_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_application_id');
  END IF;

  -- 2. Lock ordering: 1. applications
  SELECT * INTO v_app
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'application_not_found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_app.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Editing is strictly prohibited while sending or after sent
  IF v_app.status IN ('sending', 'sent') THEN
    RETURN jsonb_build_object('success', false, 'error', 'application_status_locked', 'current_status', v_app.status);
  END IF;

  -- 3. Lock ordering: 2. email_drafts
  SELECT * INTO v_draft
  FROM public.email_drafts
  WHERE application_id = p_application_id
  FOR UPDATE;

  -- 4. VALIDATIONS EXECUTED BEFORE ANY DATABASE MUTATION
  -- Resume ownership verification
  IF p_resume_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.resumes
      WHERE id = p_resume_id
        AND (auth.uid() IS NULL OR user_id = auth.uid())
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_or_unauthorized_resume');
    END IF;
  END IF;

  -- Draft content validations
  IF p_recipient IS NOT NULL OR p_subject IS NOT NULL OR p_body IS NOT NULL THEN
    IF p_recipient IS NULL OR trim(p_recipient) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_recipient_email');
    END IF;

    IF p_subject IS NULL OR length(trim(p_subject)) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'empty_subject');
    END IF;

    IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'empty_body');
    END IF;
  ELSE
    -- If no draft content was supplied and no draft row exists, reject creation of empty draft
    IF v_draft IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'draft_content_required_for_initial_save');
    END IF;
  END IF;

  -- 5. RESOLVE OMISSION vs EXPLICIT VALUES
  IF p_conflict_resolution = '__OMITTED__' THEN
    v_resolved_conflict := CASE WHEN v_draft IS NOT NULL THEN v_draft.conflict_resolution ELSE NULL END;
  ELSE
    v_resolved_conflict := p_conflict_resolution;
  END IF;

  IF p_conflict_resolution_note = '__OMITTED__' THEN
    v_resolved_note := CASE WHEN v_draft IS NOT NULL THEN v_draft.conflict_resolution_note ELSE NULL END;
  ELSE
    v_resolved_note := p_conflict_resolution_note;
  END IF;

  -- 6. MUTATIONS (Guaranteed safe: all validations passed)
  -- Update application: set resume and return status to 'draft'
  UPDATE public.applications
  SET resume_id = COALESCE(p_resume_id, resume_id),
      status = 'draft',
      updated_at = v_now
  WHERE id = p_application_id;

  -- Upsert email_drafts, clearing prior approval snapshot
  IF v_draft IS NULL THEN
    INSERT INTO public.email_drafts (
      application_id,
      recipient_email,
      subject,
      body,
      conflict_resolution,
      conflict_resolution_note,
      approved_at,
      approved_hash,
      approved_attachment_hash,
      created_at,
      updated_at
    ) VALUES (
      p_application_id,
      trim(p_recipient),
      trim(p_subject),
      p_body,
      v_resolved_conflict,
      v_resolved_note,
      NULL,
      NULL,
      NULL,
      v_now,
      v_now
    );
  ELSE
    UPDATE public.email_drafts
    SET recipient_email = COALESCE(trim(p_recipient), recipient_email),
        subject = COALESCE(trim(p_subject), subject),
        body = COALESCE(p_body, body),
        conflict_resolution = v_resolved_conflict,
        conflict_resolution_note = v_resolved_note,
        approved_at = NULL,
        approved_hash = NULL,
        approved_attachment_hash = NULL,
        updated_at = v_now
    WHERE application_id = p_application_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'action', 'saved');
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC: approve_email_draft_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_email_draft_atomic(
  p_application_id uuid,
  p_hash text,
  p_attachment_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app record;
  v_draft record;
  v_now timestamp with time zone := clock_timestamp();
BEGIN
  IF p_application_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_application_id');
  END IF;

  -- Validate SHA-256 hash formatting
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-fA-F]{64}$' OR
     p_attachment_hash IS NULL OR p_attachment_hash !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_approval_hash_format');
  END IF;

  IF p_hash = p_attachment_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'identical_draft_and_attachment_hashes');
  END IF;

  -- Lock 1 = applications
  SELECT * INTO v_app
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'application_not_found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_app.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Prohibit approval while sending or sent
  IF v_app.status IN ('sending', 'sent') THEN
    RETURN jsonb_build_object('success', false, 'error', 'application_status_locked', 'current_status', v_app.status);
  END IF;

  -- STRICT INVARIANT: postponed applications must return to draft before re-approval
  IF v_app.status = 'postponed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'postponed_application_must_revisit_draft');
  END IF;

  -- Verify attached resume exists and is owned
  IF v_app.resume_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_resume_attachment');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.resumes
    WHERE id = v_app.resume_id
      AND (auth.uid() IS NULL OR user_id = auth.uid())
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'resume_unauthorized_or_not_found');
  END IF;

  -- Lock 2 = email_drafts
  SELECT * INTO v_draft
  FROM public.email_drafts
  WHERE application_id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'draft_not_found');
  END IF;

  IF v_draft.recipient_email IS NULL OR trim(v_draft.recipient_email) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR
     v_draft.subject IS NULL OR length(trim(v_draft.subject)) = 0 OR
     v_draft.body IS NULL OR length(trim(v_draft.body)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'incomplete_draft_content');
  END IF;

  -- Approve draft snapshot
  UPDATE public.email_drafts
  SET approved_at = v_now,
      approved_hash = p_hash,
      approved_attachment_hash = p_attachment_hash,
      updated_at = v_now
  WHERE application_id = p_application_id;

  -- Transition application to approved
  UPDATE public.applications
  SET status = 'approved',
      updated_at = v_now
  WHERE id = p_application_id;

  RETURN jsonb_build_object('success', true, 'action', 'approved');
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC: delete_application_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_application_atomic(
  p_application_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app record;
BEGIN
  IF p_application_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_application_id');
  END IF;

  SELECT * INTO v_app
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'application_not_found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_app.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF v_app.status IN ('sending', 'sent') THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_delete_active_or_sent_application');
  END IF;

  DELETE FROM public.applications WHERE id = p_application_id;

  RETURN jsonb_build_object('success', true, 'action', 'deleted');
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Rate Limits Table & check_rate_limit Procedure
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id text PRIMARY KEY,
  request_count int NOT NULL DEFAULT 1,
  window_start timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits (window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own rate limits" ON public.rate_limits;
CREATE POLICY "Users can view own rate limits" ON public.rate_limits
  FOR SELECT USING (
    id ~ '^[a-zA-Z0-9_-]+:[0-9a-fA-F-]{36}$' AND
    split_part(id, ':', 2) = auth.uid()::text
  );

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamp with time zone := clock_timestamp();
  v_record public.rate_limits%rowtype;
  v_reset_in int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Authentication required for rate limiting');
  END IF;

  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Rate limit key cannot be empty');
  END IF;

  IF p_limit IS NULL OR p_limit <= 0 OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Invalid limit or window parameters');
  END IF;

  IF p_key !~ '^[a-zA-Z0-9_-]+:[0-9a-fA-F-]{36}$' THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Invalid rate limit key format');
  END IF;

  IF split_part(p_key, ':', 2) <> auth.uid()::text THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Unauthorized rate limit key: user ID mismatch');
  END IF;

  INSERT INTO public.rate_limits (id, request_count, window_start)
  VALUES (p_key, 0, v_now)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_record FROM public.rate_limits WHERE id = p_key FOR UPDATE;

  IF v_record.request_count = 0 OR (v_now - v_record.window_start) > (p_window_seconds || ' seconds')::interval THEN
    UPDATE public.rate_limits
    SET request_count = 1,
        window_start = v_now
    WHERE id = p_key;

    RETURN jsonb_build_object('allowed', true, 'remaining', p_limit - 1, 'reset_in_seconds', p_window_seconds);
  END IF;

  v_reset_in := GREATEST(1, p_window_seconds - extract(epoch from (v_now - v_record.window_start))::int);

  IF v_record.request_count >= p_limit THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'reset_in_seconds', v_reset_in);
  ELSE
    UPDATE public.rate_limits
    SET request_count = v_record.request_count + 1
    WHERE id = p_key;

    RETURN jsonb_build_object('allowed', true, 'remaining', p_limit - (v_record.request_count + 1), 'reset_in_seconds', v_reset_in);
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. PostgREST Privilege Hardening & Execution Permissions
-- ----------------------------------------------------------------------------
-- Revoke direct execution from public and anon
REVOKE EXECUTE ON FUNCTION public.acquire_mock_dispatch_lease(uuid, text, text, int) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.transition_application_status_atomic(uuid, text, text, bigint, text, text, text, text, jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.save_email_draft_atomic(uuid, text, text, text, uuid, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.approve_email_draft_atomic(uuid, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.delete_application_atomic(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) FROM public, anon;

-- Grant execution to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.acquire_mock_dispatch_lease(uuid, text, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_application_status_atomic(uuid, text, text, bigint, text, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_email_draft_atomic(uuid, text, text, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_email_draft_atomic(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_application_atomic(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO authenticated, service_role;

-- Revoke mutating privileges on tables from authenticated and anon
REVOKE ALL ON public.rate_limits FROM public, anon;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limits FROM authenticated;
GRANT SELECT ON public.rate_limits TO authenticated;

-- Disallow direct table UPDATEs on applications and email_drafts via PostgREST
-- All lifecycle transitions and draft saves must pass through the atomic SECURITY DEFINER RPCs
REVOKE ALL ON public.applications FROM public, anon;
REVOKE UPDATE ON public.applications FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;

REVOKE ALL ON public.email_drafts FROM public, anon;
REVOKE UPDATE ON public.email_drafts FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.email_drafts TO authenticated;
GRANT ALL ON public.email_drafts TO service_role;

DROP POLICY IF EXISTS "Users can update own applications" ON public.applications;
DROP POLICY IF EXISTS "Users can update own email drafts" ON public.email_drafts;
DROP POLICY IF EXISTS "Users can update own email_drafts" ON public.email_drafts;

-- Safe DELETE policies (only if not sending or sent)
DROP POLICY IF EXISTS "Users can delete own applications" ON public.applications;
CREATE POLICY "Users can delete own applications" ON public.applications
  FOR DELETE USING (
    auth.uid() = user_id
    AND status NOT IN ('sending', 'sent')
  );

DROP POLICY IF EXISTS "Users can delete own email drafts" ON public.email_drafts;
CREATE POLICY "Users can delete own email drafts" ON public.email_drafts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = email_drafts.application_id
        AND applications.user_id = auth.uid()
        AND applications.status NOT IN ('sending', 'sent')
    )
  );