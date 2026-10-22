-- Keep enrollments.status in step with entitlements (the source of truth for access).
--
-- When a user's LAST live entitlement for a course ends, the enrollment becomes
-- 'disabled'; when any entitlement is live again it returns to 'active'.
-- "Live" = status = 'active' AND (expires_at IS NULL OR expires_at > now()),
-- the same predicate has_course_access() uses (tenant access cutoff excluded:
-- it is tenant-wide and reversible, and has no trigger to hang this on).
--
-- Notes:
--   * Only touches EXISTING enrollment rows. It never creates one (enroll_user,
--     grant_free_entitlement and self_enroll_subscription_course still do, and
--     insert the entitlement first, so the first trigger run is a no-op).
--   * Time passing (expires_at) fires nothing; readers apply the expiry check.
--   * No DELETE trigger: entitlement deletes only happen via cascades (user /
--     course / tenant deletion) where the enrollment goes with them.
--   * Idempotent: UPDATE only when the value actually changes.

CREATE OR REPLACE FUNCTION public.sync_enrollment_status_from_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _live boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.entitlements AS e
    WHERE e.user_id = NEW.user_id
      AND e.course_id = NEW.course_id
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > now())
  ) INTO _live;

  IF _live THEN
    UPDATE public.enrollments AS en
    SET status = 'active'
    WHERE en.user_id = NEW.user_id
      AND en.course_id = NEW.course_id
      AND en.status IS DISTINCT FROM 'active';
  ELSE
    UPDATE public.enrollments AS en
    SET status = 'disabled'
    WHERE en.user_id = NEW.user_id
      AND en.course_id = NEW.course_id
      AND en.status = 'active';
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$$;

REVOKE ALL ON FUNCTION public.sync_enrollment_status_from_entitlements() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_enrollment_status_ins ON public.entitlements;
CREATE TRIGGER trg_sync_enrollment_status_ins
  AFTER INSERT ON public.entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_enrollment_status_from_entitlements();

DROP TRIGGER IF EXISTS trg_sync_enrollment_status_upd ON public.entitlements;
CREATE TRIGGER trg_sync_enrollment_status_upd
  AFTER UPDATE OF status, expires_at ON public.entitlements
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.expires_at IS DISTINCT FROM NEW.expires_at)
  EXECUTE FUNCTION public.sync_enrollment_status_from_entitlements();

-- One-time backfill: enrollments that already lapsed. Restricted to users who
-- HAVE entitlement rows for the course, none of them live, so legacy
-- enrollments with no entitlement history are left alone.
UPDATE public.enrollments AS en
SET status = 'disabled'
WHERE en.status = 'active'
  AND EXISTS (
    SELECT 1 FROM public.entitlements AS e
    WHERE e.user_id = en.user_id AND e.course_id = en.course_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.entitlements AS e
    WHERE e.user_id = en.user_id AND e.course_id = en.course_id
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > now())
  );
