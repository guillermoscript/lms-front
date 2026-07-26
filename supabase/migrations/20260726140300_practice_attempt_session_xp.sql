-- =============================================================================
-- Practice XP: award once per session, not once per stored row
-- Issue #549 §5 (epic #540). Fixes 20260710120000_create_practice_attempts.
--
-- A mixed (interleaved) session is stored as one practice_attempts row PER
-- TOPIC (#393, migration 20260715120000) so the per-topic pipelines keep
-- aggregating unchanged. But trg_practice_attempt_xp is a FOR EACH ROW trigger
-- awarding 15 XP per row, so a 3-topic session paid 45 XP and burned 3 of the
-- 10 daily slots against 15 XP for the equivalent focused session. XP scaled
-- with how many topics the model chose to tag, not with work done.
--
-- Fix: rows carry a session_id, set once per lms_record_practice_attempt call
-- across every slice. The trigger awards for the first row of a session and is
-- a no-op for its siblings, keyed on the XP transaction it already writes — so
-- it stays correct on retry and needs no extra bookkeeping table.
--
-- Also closes the check-then-act on the daily cap noted in the same issue: the
-- count and the award are now serialized per (user, tenant) by a transaction
-- advisory lock, so concurrent inserts can no longer both observe 9 awards and
-- both award. The lock is taken before the count, and released at commit.
--
-- Existing rows each get their own session_id, which preserves the XP they were
-- already granted (they were each awarded individually at the time).
-- =============================================================================

ALTER TABLE public.practice_attempts
  ADD COLUMN IF NOT EXISTS session_id UUID NOT NULL DEFAULT gen_random_uuid();

COMMENT ON COLUMN public.practice_attempts.session_id IS
  'Groups the per-topic rows of one mixed practice session. XP is awarded once '
  'per session_id, not once per row (issue #549).';

CREATE INDEX IF NOT EXISTS practice_attempts_session_idx
  ON public.practice_attempts (session_id);

CREATE OR REPLACE FUNCTION public.handle_practice_attempt_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_awards_today int;
BEGIN
  -- Serialize this user's award path so the cap check below is not a
  -- check-then-act race between concurrent inserts.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.user_id::text || ':' || NEW.tenant_id::text, 0)
  );

  -- One award per SESSION. The sibling rows of a mixed session find the
  -- transaction written by the first row and award nothing.
  IF EXISTS (
    SELECT 1
    FROM public.gamification_xp_transactions
    WHERE user_id = NEW.user_id
      AND tenant_id = NEW.tenant_id
      AND action_type = 'practice_attempt'
      AND reference_type = 'practice_session'
      AND reference_id = NEW.session_id::text
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_awards_today
  FROM public.gamification_xp_transactions
  WHERE user_id = NEW.user_id
    AND tenant_id = NEW.tenant_id
    AND action_type = 'practice_attempt'
    AND created_at >= date_trunc('day', now());

  IF v_awards_today < 10 THEN
    PERFORM award_xp(
      NEW.user_id, 'practice_attempt', 15,
      NEW.session_id::text, 'practice_session', NEW.tenant_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only function — not meant to be a PostgREST RPC (advisor:
-- anon_security_definer_function_executable; matches fix_advisor_security_findings).
REVOKE EXECUTE ON FUNCTION public.handle_practice_attempt_xp() FROM public, anon, authenticated;
