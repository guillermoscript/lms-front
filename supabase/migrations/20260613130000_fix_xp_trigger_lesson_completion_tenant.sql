-- =============================================================================
-- Fix handle_lesson_completion_xp: lesson_completions has NO tenant_id column
-- =============================================================================
-- The XP trigger function started with `v_tenant_id := NEW.tenant_id;` under the
-- comment "lesson_completions has tenant_id directly". That column does not exist
-- (lesson_completions is: id, user_id, lesson_id, completed_at). In PL/pgSQL,
-- reading a non-existent field off a trigger record raises
--   record "new" has no field "tenant_id"
-- at that line -- BEFORE the NULL-tenant fallback below it can run. Because the
-- trigger fires AFTER INSERT, that error rolled back the host INSERT, so EVERY
-- attempt to mark a lesson complete failed.
--
-- The earlier fix (20260611120000) assumed NEW.tenant_id would simply be NULL and
-- fall through to the lessons -> courses lookup; it does not -- it errors. Drop the
-- bad reference and always derive the tenant from lessons -> courses.
-- Source of the bug: 20260217030000_tenant_scope_gamification.sql.

CREATE OR REPLACE FUNCTION handle_lesson_completion_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- lesson_completions has no tenant_id; derive it from lessons -> courses.
  SELECT c.tenant_id INTO v_tenant_id
  FROM lessons l
  JOIN courses c ON c.course_id = l.course_id
  WHERE l.id = NEW.lesson_id;

  PERFORM award_xp(NEW.user_id, 'lesson_completion', 100, NEW.lesson_id::text, 'lesson', v_tenant_id);
  RETURN NEW;
END;
$$;
