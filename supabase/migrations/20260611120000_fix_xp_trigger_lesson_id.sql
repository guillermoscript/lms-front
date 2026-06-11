-- =============================================================================
-- Fix XP trigger functions: lessons PK is `id`, not `lesson_id`
-- =============================================================================
-- Three SECURITY DEFINER trigger functions joined `lessons l` on `l.lesson_id`,
-- which does not exist (the lessons primary key is `id`). The bad reference
-- raised `42703 column l.lesson_id does not exist` inside the trigger, which
-- rolled back the host INSERT:
--   * handle_comment_posted_xp     -> every lesson_comments insert failed
--   * handle_exercise_completion_xp -> every exercise_completions insert failed
--   * handle_lesson_completion_xp  -> only the NULL-tenant fallback path (latent)
--
-- Fix = `l.lesson_id` -> `l.id`. Bodies are otherwise unchanged.
-- Source of the bug: 20260217030000_tenant_scope_gamification.sql.

-- Trigger: lesson_completions -> award XP
CREATE OR REPLACE FUNCTION handle_lesson_completion_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- lesson_completions has tenant_id directly
  v_tenant_id := NEW.tenant_id;

  IF v_tenant_id IS NULL THEN
    -- Fallback: look up from lessons -> courses
    SELECT c.tenant_id INTO v_tenant_id
    FROM lessons l
    JOIN courses c ON c.course_id = l.course_id
    WHERE l.id = NEW.lesson_id;
  END IF;

  PERFORM award_xp(NEW.user_id, 'lesson_completion', 100, NEW.lesson_id::text, 'lesson', v_tenant_id);
  RETURN NEW;
END;
$$;

-- Trigger: exercise_completions -> award XP
CREATE OR REPLACE FUNCTION handle_exercise_completion_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Look up tenant from exercises -> lessons -> courses
  SELECT c.tenant_id INTO v_tenant_id
  FROM exercises e
  JOIN lessons l ON l.id = e.lesson_id
  JOIN courses c ON c.course_id = l.course_id
  WHERE e.id = NEW.exercise_id;

  PERFORM award_xp(NEW.user_id, 'exercise_completion', 50, NEW.exercise_id::text, 'exercise', v_tenant_id);
  RETURN NEW;
END;
$$;

-- Trigger: lesson_comments -> award XP
CREATE OR REPLACE FUNCTION handle_comment_posted_xp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Look up tenant from lessons -> courses
  SELECT c.tenant_id INTO v_tenant_id
  FROM lessons l
  JOIN courses c ON c.course_id = l.course_id
  WHERE l.id = NEW.lesson_id;

  PERFORM award_xp(NEW.user_id, 'comment_posted', 10, NEW.id::text, 'comment', v_tenant_id);
  RETURN NEW;
END;
$$;
