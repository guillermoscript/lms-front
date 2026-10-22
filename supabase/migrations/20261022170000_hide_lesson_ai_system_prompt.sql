-- The teacher's private tutor prompt (lessons_ai_tasks.system_prompt) was readable
-- by every entitled student: RLS is row-level, so `select('*')` / `select=system_prompt`
-- returned it. Filtering on it (`system_prompt=ilike.*x*`) was also an oracle.
--
-- Fix at the privilege layer: clients lose SELECT on the column. Everything that
-- needs the prompt goes through
--   * the server tutor (service role, which keeps its grants), or
--   * public.get_lesson_ai_system_prompt() for the lesson's staff / course author.
--
-- INSERT / UPDATE / DELETE grants are untouched, so teachers keep writing the prompt
-- through RLS-scoped writes. NOTE: a client write that RETURNS the row (`.select()`
-- after upsert/insert) now has to name columns and leave system_prompt out.
--
-- New columns are NOT readable by clients until granted here on purpose (allow-list).

REVOKE SELECT ON public.lessons_ai_tasks FROM anon, authenticated;

GRANT SELECT (id, created_at, lesson_id, task_instructions, requirements)
  ON public.lessons_ai_tasks TO authenticated;

CREATE OR REPLACE FUNCTION public.get_lesson_ai_system_prompt(_lesson_id bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.system_prompt
  FROM public.lessons_ai_tasks t
  JOIN public.lessons l ON l.id = t.lesson_id
  JOIN public.courses c ON c.course_id = l.course_id
  WHERE t.lesson_id = _lesson_id
    AND (
      public.is_staff_of(l.tenant_id)
      OR c.author_id = (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.get_lesson_ai_system_prompt(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_ai_system_prompt(bigint) TO authenticated, service_role;

-- `INSERT ... ON CONFLICT DO UPDATE SET system_prompt = EXCLUDED.system_prompt`
-- (what PostgREST upsert emits) needs SELECT on the column, which clients no
-- longer have. Writing the task therefore goes through this function, with the
-- same authorization as the read: staff of the lesson's tenant or the course author.
CREATE OR REPLACE FUNCTION public.upsert_lesson_ai_task(
  _lesson_id bigint,
  _task_instructions text,
  _system_prompt text,
  _requirements jsonb DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _id bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.lessons l
    JOIN public.courses c ON c.course_id = l.course_id
    WHERE l.id = _lesson_id
      AND (public.is_staff_of(l.tenant_id) OR c.author_id = (SELECT auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Not authorized to edit this lesson''s AI task' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.lessons_ai_tasks (lesson_id, task_instructions, system_prompt, requirements)
  VALUES (_lesson_id, _task_instructions, _system_prompt, _requirements)
  ON CONFLICT (lesson_id) DO UPDATE SET
    task_instructions = EXCLUDED.task_instructions,
    system_prompt = EXCLUDED.system_prompt,
    requirements = EXCLUDED.requirements
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_lesson_ai_task(bigint, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_lesson_ai_task(bigint, text, text, jsonb) TO authenticated, service_role;
