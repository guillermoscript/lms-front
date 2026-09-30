-- Issue #873 (epic #867): teachers grade answers to graded discussion prompts.
--
-- A teacher could tick "graded" on a discussion prompt, but nothing followed:
-- no place to see who answered, no score, no feedback, nothing in the
-- student's grades. This adds the grade itself and wires it into the XP (#874)
-- and notification (#870) pipelines that already exist.
--
--   * community_prompt_grades: ONE row per (prompt, student) — UNIQUE
--     (post_id, student_id). A teacher grades the STUDENT's participation on
--     the prompt, not one comment: a student with several answers gets one
--     score. comment_id records the answer the grade was given for (the
--     student's latest visible top-level answer when the writer leaves it
--     NULL); it is NULL when the student never answered (a teacher may still
--     record a 0 for "did not participate").
--   * score is 0-100 (integer), feedback is optional text (<= 5000 chars).
--   * community_posts.due_at (optional): when a graded prompt is due. Only a
--     graded discussion prompt may carry one. Nothing is enforced on it — it is
--     shown to the student ("due in 3 days") and answers after it are still
--     accepted and gradeable.
--
--   * One rule, every writer. community_guard_prompt_grade() (BEFORE INSERT /
--     UPDATE, SECURITY DEFINER) is the authority for the web, the native app
--     and the MCP server:
--       - the grader is an ACTIVE teacher/admin of the prompt's school
--         (tenant_users, not the JWT claim) on a plan with the community;
--         on the RLS path the grader is auth.uid(), stamped into graded_by;
--         the service role must name one in graded_by;
--       - the prompt is a visible, graded discussion_prompt of a course in
--         that same school; the row's tenant_id is the prompt's;
--       - the student is an active student member of that school;
--       - comment_id, when given, is a top-level comment by that student on
--         that prompt, in that school;
--       - tenant_id / post_id / student_id never change after insert;
--       - graded_at and updated_at are the server's clock.
--   * RLS: a student reads their OWN rows only. Staff of the row's school
--     (is_staff_of) read and write every row of that school. Nobody else —
--     not other students, not another school's staff. authenticated may
--     UPDATE only score, feedback and comment_id.
--
--   * Grading fires community_on_prompt_graded() (AFTER INSERT, and AFTER
--     UPDATE when the score or feedback changed or the grade now covers an
--     answer — saving the same grade twice is silent):
--       - XP (#874): community_award_xp(student, 'community_prompt_graded',
--         reference = prompt id) — 20 XP, ONCE per prompt (the rule registry
--         already has it). Only when the grade is for an actual answer
--         (comment_id set): a "did not answer" 0 earns nothing. Re-grading
--         never earns again.
--       - Notification (#870): kind 'community_prompt_graded', one row per
--         (prompt, student). A re-grade updates that row in place and puts it
--         back to unread; its push is not sent a second time. The row carries
--         the score but NOT the feedback text (every teacher of the school can
--         read the school's notifications; the feedback lives on the grade).
--         Category 'replies' ("my contributions"): same never-notify rules as
--         an accepted answer — plan off, student left the school or lost the
--         course, preference off.
--     Both are wrapped in EXCEPTION -> WARNING: neither may fail a grade.
--   * Deleting a grade (un-grading) deletes its notification. XP stays (v1,
--     like every other community XP).
--
--   * Certificates (decision, v1): a graded prompt does NOT gate certificate
--     eligibility and does NOT count toward course completion. It shows in
--     the student's grades (progress page) only. checkCertificateEligibility /
--     the certificate RPCs are untouched, so no existing certificate or
--     eligibility changes. Revisit with an opt-in per prompt if schools ask.
--
-- Deploy: apply to cloud BEFORE merging the web code (the feed, the lesson
-- page and the progress page select community_posts.due_at and read
-- community_prompt_grades).

-- ---------------------------------------------------------------------------
-- 1. Due date on graded prompts
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_due_at_is_graded_prompt;
ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_due_at_is_graded_prompt
  CHECK (due_at IS NULL OR (is_graded AND post_type = 'discussion_prompt'));

COMMENT ON COLUMN public.community_posts.due_at IS
  '#873: optional due date of a graded discussion prompt. Informational: answers after it are still accepted and gradeable.';

-- ---------------------------------------------------------------------------
-- 2. The grades
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_prompt_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.community_comments(id) ON DELETE SET NULL,
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  feedback text CHECK (feedback IS NULL OR char_length(feedback) <= 5000),
  graded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  graded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_prompt_grades_post_student_key UNIQUE (post_id, student_id)
);

COMMENT ON TABLE public.community_prompt_grades IS
  '#873: a teacher''s score (0-100) and feedback for one student''s participation in one graded discussion prompt. One row per (post_id, student_id). Written by staff of the school (trigger + RLS enforced); a student reads only their own.';
COMMENT ON COLUMN public.community_prompt_grades.comment_id IS
  '#873: the answer (top-level comment) the grade was given for; the student''s latest visible answer when the writer leaves it NULL. NULL = graded without an answer.';
COMMENT ON COLUMN public.community_prompt_grades.graded_by IS
  '#873: the teacher/admin who last graded. Stamped from auth.uid() on the RLS path; the service role must supply it.';

-- The student's grades (progress page) and the teacher's per-prompt view.
CREATE INDEX IF NOT EXISTS idx_community_prompt_grades_student
  ON public.community_prompt_grades (tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_community_prompt_grades_comment
  ON public.community_prompt_grades (comment_id)
  WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_prompt_grades_graded_by
  ON public.community_prompt_grades (graded_by)
  WHERE graded_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. The rule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_guard_prompt_grade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  p record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.post_id IS DISTINCT FROM OLD.post_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      RAISE EXCEPTION 'community_grade_invalid: a grade cannot move to another prompt, student or school'
        USING ERRCODE = '23514';
    END IF;
    NEW.created_at := OLD.created_at;

    -- System clears: the graded answer or the grader's account was deleted
    -- (ON DELETE SET NULL). Nothing is graded here, so nothing is checked —
    -- otherwise deleting a comment or an account would fail on the grade.
    IF NEW.score IS NOT DISTINCT FROM OLD.score
       AND NEW.feedback IS NOT DISTINCT FROM OLD.feedback
       AND (NEW.comment_id IS NOT DISTINCT FROM OLD.comment_id OR NEW.comment_id IS NULL)
       AND (NEW.graded_by IS NOT DISTINCT FROM OLD.graded_by OR NEW.graded_by IS NULL)
       AND (NEW.comment_id IS DISTINCT FROM OLD.comment_id OR NEW.graded_by IS DISTINCT FROM OLD.graded_by) THEN
      RETURN NEW;
    END IF;
  ELSE
    NEW.created_at := now();
  END IF;

  -- The grader: the caller on the RLS path, the named teacher otherwise.
  IF v_actor IS NOT NULL THEN
    NEW.graded_by := v_actor;
  END IF;
  IF NEW.graded_by IS NULL THEN
    RAISE EXCEPTION 'community_grade_not_allowed: graded_by is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT cp.id, cp.tenant_id, cp.course_id, cp.post_type, cp.is_graded, cp.is_hidden
    INTO p
    FROM public.community_posts cp
   WHERE cp.id = NEW.post_id;

  IF NOT FOUND
     OR p.is_hidden
     OR p.post_type <> 'discussion_prompt'
     OR NOT p.is_graded
     OR p.course_id IS NULL THEN
    RAISE EXCEPTION 'community_grade_invalid: not a graded discussion prompt'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM p.tenant_id THEN
    RAISE EXCEPTION 'community_grade_invalid: the prompt belongs to another school'
      USING ERRCODE = '23514';
  END IF;

  IF NOT public.community_enabled(NEW.tenant_id)
     OR NOT EXISTS (
       SELECT 1 FROM public.tenant_users tu
        WHERE tu.tenant_id = NEW.tenant_id
          AND tu.user_id = NEW.graded_by
          AND tu.status = 'active'
          AND tu.role IN ('teacher', 'admin')
     ) THEN
    RAISE EXCEPTION 'community_grade_not_allowed: only the school''s teachers and admins grade prompts'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users tu
     WHERE tu.tenant_id = NEW.tenant_id
       AND tu.user_id = NEW.student_id
       AND tu.status = 'active'
       AND tu.role = 'student'
  ) THEN
    RAISE EXCEPTION 'community_grade_invalid: not a student of this school'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.comment_id IS NULL THEN
    SELECT cc.id INTO NEW.comment_id
      FROM public.community_comments cc
     WHERE cc.post_id = NEW.post_id
       AND cc.tenant_id = NEW.tenant_id
       AND cc.author_id = NEW.student_id
       AND cc.parent_comment_id IS NULL
       AND NOT cc.is_hidden
     ORDER BY cc.created_at DESC
     LIMIT 1;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.community_comments cc
     WHERE cc.id = NEW.comment_id
       AND cc.post_id = NEW.post_id
       AND cc.tenant_id = NEW.tenant_id
       AND cc.author_id = NEW.student_id
       AND cc.parent_comment_id IS NULL
  ) THEN
    RAISE EXCEPTION 'community_grade_invalid: not this student''s answer to this prompt'
      USING ERRCODE = '23514';
  END IF;

  NEW.graded_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.community_guard_prompt_grade() IS
  '#873: every writer of community_prompt_grades is an active teacher/admin of the prompt''s school, grading an active student of it on a visible graded discussion prompt of a course. Stamps graded_by (auth.uid()), graded_at, updated_at; fills comment_id with the latest answer.';

DROP TRIGGER IF EXISTS trg_community_guard_prompt_grade ON public.community_prompt_grades;
CREATE TRIGGER trg_community_guard_prompt_grade
  BEFORE INSERT OR UPDATE ON public.community_prompt_grades
  FOR EACH ROW
  EXECUTE FUNCTION public.community_guard_prompt_grade();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_prompt_grades ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.community_prompt_grades FROM anon;
REVOKE ALL ON public.community_prompt_grades FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_prompt_grades TO authenticated;
GRANT UPDATE (score, feedback, comment_id) ON public.community_prompt_grades TO authenticated;
GRANT ALL ON public.community_prompt_grades TO service_role;

DROP POLICY IF EXISTS "Students read their own prompt grades" ON public.community_prompt_grades;
CREATE POLICY "Students read their own prompt grades"
  ON public.community_prompt_grades FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Staff read the school's prompt grades" ON public.community_prompt_grades;
CREATE POLICY "Staff read the school's prompt grades"
  ON public.community_prompt_grades FOR SELECT TO authenticated
  USING (public.is_staff_of(tenant_id));

DROP POLICY IF EXISTS "Staff grade prompts" ON public.community_prompt_grades;
CREATE POLICY "Staff grade prompts"
  ON public.community_prompt_grades FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_of(tenant_id) AND graded_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Staff regrade prompts" ON public.community_prompt_grades;
CREATE POLICY "Staff regrade prompts"
  ON public.community_prompt_grades FOR UPDATE TO authenticated
  USING (public.is_staff_of(tenant_id))
  WITH CHECK (public.is_staff_of(tenant_id) AND graded_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Staff remove prompt grades" ON public.community_prompt_grades;
CREATE POLICY "Staff remove prompt grades"
  ON public.community_prompt_grades FOR DELETE TO authenticated
  USING (public.is_staff_of(tenant_id));

-- ---------------------------------------------------------------------------
-- 5. Notification (#870 pipeline)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_notify_prompt_graded(_grade_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  g record;
  p record;
  v_id bigint;
  v_post_label text;
  v_title text;
  v_content text;
  v_actor_name text;
  v_actor_role text;
  v_meta jsonb;
BEGIN
  BEGIN
    SELECT pg.id, pg.tenant_id, pg.post_id, pg.student_id, pg.score, pg.graded_by
      INTO g
      FROM public.community_prompt_grades pg
     WHERE pg.id = _grade_id;
    IF NOT FOUND OR g.graded_by IS NULL OR g.graded_by = g.student_id THEN
      RETURN NULL;
    END IF;

    SELECT cp.id, cp.tenant_id, cp.course_id, cp.lesson_id, cp.title, cp.content, cp.milestone_data, cp.is_hidden
      INTO p
      FROM public.community_posts cp
     WHERE cp.id = g.post_id;
    IF NOT FOUND OR p.is_hidden OR p.tenant_id IS DISTINCT FROM g.tenant_id THEN
      RETURN NULL;
    END IF;

    IF NOT public.community_enabled(p.tenant_id)
       OR NOT public.community_notify_can_reach(g.student_id, p.tenant_id, p.course_id)
       OR NOT public.community_notify_wants(g.student_id, 'replies') THEN
      RETURN NULL;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('community_grade:' || p.id::text || ':' || g.student_id::text, 0));

    SELECT nullif(btrim(pr.full_name), '') INTO v_actor_name FROM public.profiles pr WHERE pr.id = g.graded_by;
    SELECT tu.role INTO v_actor_role
      FROM public.tenant_users tu
     WHERE tu.tenant_id = p.tenant_id AND tu.user_id = g.graded_by AND tu.status = 'active';

    v_post_label := public.community_notification_post_label(p.title, p.content, p.milestone_data);
    v_title := coalesce(v_post_label, public.community_notification_place_label(p.tenant_id, p.course_id));
    v_content := g.score::text || '/100';
    v_meta := jsonb_build_object(
      'kind', 'community_prompt_graded',
      'post_id', p.id,
      'course_id', p.course_id,
      'lesson_id', p.lesson_id,
      'grade_id', g.id,
      'score', g.score,
      'actor_id', g.graded_by,
      'actor_name', v_actor_name,
      'actor_role', v_actor_role,
      'post_label', v_post_label
    );

    SELECT n.id
      INTO v_id
      FROM public.notifications n
     WHERE n.community_post_id = p.id
       AND n.tenant_id = p.tenant_id
       AND n.notification_type = 'community'
       AND n.metadata ->> 'kind' = 'community_prompt_graded'
       AND n.target_user_ids = ARRAY[g.student_id]
     LIMIT 1;

    IF FOUND THEN
      -- A re-grade: same row, new score, unread again. Its push went out once;
      -- a queued one simply carries the new text. created_at is the push
      -- queue's order, so it only moves once the push is sent.
      UPDATE public.notifications n
         SET title = v_title,
             content = v_content,
             metadata = v_meta || jsonb_build_object('regraded', true),
             sent_at = now()
       WHERE n.id = v_id;

      UPDATE public.user_notifications un
         SET in_app_read = false,
             in_app_read_at = NULL,
             dismissed = false,
             dismissed_at = NULL,
             created_at = CASE WHEN un.push_sent THEN now() ELSE un.created_at END
       WHERE un.notification_id = v_id
         AND un.user_id = g.student_id;
      RETURN v_id;
    END IF;

    INSERT INTO public.notifications (
      tenant_id, title, content, notification_type, priority,
      target_type, target_user_ids, target_course_id, community_post_id,
      delivery_channels, status, sent_at, created_by, metadata
    ) VALUES (
      p.tenant_id,
      v_title,
      v_content,
      'community',
      'normal',
      'user',
      ARRAY[g.student_id],
      p.course_id,
      p.id,
      ARRAY['in_app', 'push'],
      'sent',
      now(),
      NULL,
      v_meta
    )
    RETURNING id INTO v_id;

    INSERT INTO public.user_notifications (notification_id, user_id)
    VALUES (v_id, g.student_id);

    RETURN v_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[#873 community_notify_prompt_graded] % (%)', SQLERRM, SQLSTATE;
    RETURN NULL;
  END;
END;
$$;

COMMENT ON FUNCTION public.community_notify_prompt_graded(uuid) IS
  '#873: tells the student their answer to a graded prompt was graded (kind community_prompt_graded; score, no feedback text). One row per (prompt, student), updated in place and made unread on a re-grade. Same never-notify rules as an accepted answer. Never raises.';

CREATE OR REPLACE FUNCTION public.community_on_prompt_graded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- #874: 20 XP once per prompt, for a graded answer only.
  BEGIN
    IF NEW.comment_id IS NOT NULL THEN
      PERFORM public.community_award_xp(
        NEW.student_id, NEW.tenant_id, 'community_prompt_graded',
        NEW.post_id::text, 'community_post');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'community_on_prompt_graded XP failed for grade %: %', NEW.id, SQLERRM;
  END;

  PERFORM public.community_notify_prompt_graded(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_on_prompt_graded ON public.community_prompt_grades;
CREATE TRIGGER trg_community_on_prompt_graded
  AFTER INSERT ON public.community_prompt_grades
  FOR EACH ROW
  EXECUTE FUNCTION public.community_on_prompt_graded();

-- A re-grade that changes something the student sees (score, feedback) or
-- that now covers an answer. Saving the same grade again, and the system
-- clears above, notify nobody.
DROP TRIGGER IF EXISTS trg_community_on_prompt_regraded ON public.community_prompt_grades;
CREATE TRIGGER trg_community_on_prompt_regraded
  AFTER UPDATE ON public.community_prompt_grades
  FOR EACH ROW
  WHEN (OLD.score IS DISTINCT FROM NEW.score
        OR OLD.feedback IS DISTINCT FROM NEW.feedback
        OR (OLD.comment_id IS NULL AND NEW.comment_id IS NOT NULL))
  EXECUTE FUNCTION public.community_on_prompt_graded();

-- Un-grading takes the "you were graded" notification back.
CREATE OR REPLACE FUNCTION public.community_retract_prompt_grade_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    DELETE FROM public.notifications n
     WHERE n.community_post_id = OLD.post_id
       AND n.tenant_id = OLD.tenant_id
       AND n.notification_type = 'community'
       AND n.metadata ->> 'kind' = 'community_prompt_graded'
       AND n.target_user_ids = ARRAY[OLD.student_id];
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[#873 community_retract_prompt_grade_notification] % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_retract_prompt_grade ON public.community_prompt_grades;
CREATE TRIGGER trg_community_retract_prompt_grade
  AFTER DELETE ON public.community_prompt_grades
  FOR EACH ROW
  EXECUTE FUNCTION public.community_retract_prompt_grade_notification();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- None of these is a client API: the notifier would let a member forge
-- notifications, the trigger functions only run as triggers.
REVOKE ALL ON FUNCTION public.community_guard_prompt_grade() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_notify_prompt_graded(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_on_prompt_graded() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_retract_prompt_grade_notification() FROM PUBLIC, anon, authenticated;
