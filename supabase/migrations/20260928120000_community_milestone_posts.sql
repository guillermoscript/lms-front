-- Issue #871: real learning events write milestone posts into the community.
--
-- community_posts has carried post_type 'milestone' with milestone_type /
-- milestone_data since the community shipped, and MilestoneCard renders one,
-- but nothing ever wrote a row. This migration makes the database the only
-- writer, fired from the tables that already record the events:
--
--   course_completion  lesson_completions / exam_scores   the course feed
--   certificate        certificates                       the course feed
--   level_up           gamification_profiles.level        the school feed
--   streak             gamification_profiles.current_streak  the school feed
--
-- The rules:
--   * Only public.community_create_milestone() inserts milestone rows. It is
--     SECURITY DEFINER and nobody but its owner may call it. A restrictive
--     policy stops teachers and admins too (they could insert milestone
--     columns through "Members can create posts"), and another stops anyone
--     rewriting a milestone's text through the author/staff UPDATE policy.
--   * Who announces: an active STUDENT of the school (staff previewing a
--     course never do) whose profiles.share_milestones is on, in a school
--     whose community_milestone_posts switch is on (missing row = ON), that
--     is not muted there, on a plan with the community. A course event also
--     needs has_course_access() — the same rule RLS applies to a student's
--     own course post.
--   * Once ever per (school, student, type, value): a partial UNIQUE index.
--     Hidden posts count, so a milestone the student deleted is never posted
--     again. Levels announce from 5 up; streaks at 7, 30 and 100 days, once
--     per threshold per school — a streak rebuilt after a break is not news.
--   * "Complete" is calculate_course_completion() (#696) when the course has
--     an active certificate template, and the same rule with the template
--     defaults (100% lessons, every exam >= 70) when it does not. Completion
--     must not depend on a certificate existing: auto-issue is template-gated.
--   * The certificate folds into the completion post when both happen in the
--     same transaction (the usual case: the last lesson issues it), so the
--     course feed gets one post saying "completed X and earned the
--     certificate", not two. That relies on the completion triggers sorting
--     before the certificate triggers on the same table — Postgres fires
--     same-event triggers in name order. A rename degrades to two posts.
--   * A milestone must never break the event that caused it. Every source
--     trigger catches everything and RAISEs a WARNING; the host insert
--     (lesson completion, score, certificate, XP) always lands.
--   * content is '' — the card renders from milestone_type + milestone_data
--     ({course_id, course_title (a snapshot), certificate} / {level} /
--     {days}), so the web, the native app and notifications can localise it.
--   * Course milestones leave with their course (a hard delete would
--     otherwise SET NULL course_id and move them into the school feed).
--
-- Deferred: no backfill (only new events announce); hiding a milestone when
-- its certificate is revoked (revokeCertificate has no caller yet). A
-- completion is announced once: a later regrade below the bar does not take
-- the post back.

-- 0) the student's preference -------------------------------------------------

-- Global like blocks (#846): profiles are, and a student who does not want
-- their progress announced does not want it in any school. Editable through
-- the existing own-row UPDATE policy on profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS share_milestones boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.share_milestones IS
  '#871: false = no NEW automatic milestone posts about this person in any school. Earlier posts stay until deleted. Own-row UPDATE policy.';

-- 1) only the system writes milestones -----------------------------------------

-- Restrictive = ANDed with every permissive policy. The counter triggers, the
-- service-role moderation actions and the definer functions below bypass RLS.
CREATE POLICY "Milestones are system posts"
  ON public.community_posts AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (post_type <> 'milestone' AND milestone_type IS NULL AND milestone_data IS NULL);

CREATE POLICY "Milestone posts are not edited"
  ON public.community_posts AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (post_type <> 'milestone');

-- 2) once per (school, student, type, value) ------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS community_posts_milestone_once
  ON public.community_posts (
    tenant_id,
    author_id,
    milestone_type,
    (CASE milestone_type
       WHEN 'level_up' THEN milestone_data ->> 'level'
       WHEN 'streak' THEN milestone_data ->> 'days'
       ELSE milestone_data ->> 'course_id'
     END)
  )
  WHERE post_type = 'milestone';

-- 3) is the course complete? ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_course_complete(_user_id uuid, _course_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_total_lessons integer;
  v_done_lessons integer;
  v_total_exams integer;
  v_scored_exams integer;
  v_all_passed boolean;
BEGIN
  -- With a template the certificate rule IS the rule: zero drift between
  -- "completed" and "earned the certificate".
  IF EXISTS (
    SELECT 1 FROM public.certificate_templates t
    WHERE t.course_id = _course_id AND t.is_active = true
  ) THEN
    RETURN COALESCE(
      (public.calculate_course_completion(_user_id, _course_id) ->> 'eligible')::boolean,
      false
    );
  END IF;

  -- Without one: calculate_course_completion's counts and branches with the
  -- template defaults (min_lesson_completion_pct 100, min_exam_pass_score 70,
  -- requires_all_exams true). Keep the two in step; tests/sql/issue-871 checks.
  SELECT count(*) INTO v_total_lessons
  FROM public.lessons l
  WHERE l.course_id = _course_id AND l.status = 'published';

  SELECT count(*) INTO v_total_exams
  FROM public.exams e
  WHERE e.course_id = _course_id AND e.status = 'published';

  -- Nothing published: nothing to complete.
  IF v_total_lessons = 0 AND v_total_exams = 0 THEN
    RETURN false;
  END IF;

  -- 100% of the published lessons. No lessons is 0%, never 100% — an
  -- exams-only course is not complete under the defaults, as in the original.
  SELECT count(DISTINCT lc.lesson_id) INTO v_done_lessons
  FROM public.lesson_completions lc
  JOIN public.lessons l ON l.id = lc.lesson_id
  WHERE lc.user_id = _user_id
    AND l.course_id = _course_id
    AND l.status = 'published';

  IF v_total_lessons = 0 OR v_done_lessons < v_total_lessons THEN
    RETURN false;
  END IF;

  IF v_total_exams = 0 THEN
    RETURN true;
  END IF;

  -- Every published exam scored and every score >= 70. BOOL_AND over the
  -- scored rows like the original (one submission per student and exam today,
  -- so one score per exam).
  SELECT count(DISTINCT s.exam_id), bool_and(sc.score >= 70)
  INTO v_scored_exams, v_all_passed
  FROM public.exam_submissions s
  JOIN public.exam_scores sc ON sc.submission_id = s.submission_id
  JOIN public.exams e ON e.exam_id = s.exam_id
  WHERE s.student_id = _user_id
    AND e.course_id = _course_id
    AND e.status = 'published';

  RETURN COALESCE(v_scored_exams = v_total_exams AND v_all_passed, false);
END;
$$;

COMMENT ON FUNCTION public.is_course_complete(uuid, integer) IS
  '#871: the student completed the course — calculate_course_completion().eligible with an active certificate template, the same rule with the template defaults (100/70/all exams) without one.';

-- 4) may this student's milestones be announced in this school? ---------------

CREATE OR REPLACE FUNCTION public.community_milestone_allowed(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  -- Cheapest first. Staff previewing a course never announce.
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = _tenant_id
      AND tu.user_id = _user_id
      AND tu.role = 'student'
      AND tu.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  IF NOT COALESCE(
    (SELECT p.share_milestones FROM public.profiles p WHERE p.id = _user_id),
    false
  ) THEN
    RETURN false;
  END IF;

  IF NOT public.community_setting_on(_tenant_id, 'community_milestone_posts') THEN
    RETURN false;
  END IF;

  IF public.community_is_muted(_tenant_id, _user_id) THEN
    RETURN false;
  END IF;

  -- The plan gate reads the plan tables; last.
  RETURN public.community_enabled(_tenant_id);
END;
$$;

COMMENT ON FUNCTION public.community_milestone_allowed(uuid, uuid) IS
  '#871: an active student of the school who shares milestones, the school''s community_milestone_posts switch on, not muted there, a plan with the community.';

-- 5) the only writer ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.community_create_milestone(
  _user_id uuid,
  _tenant_id uuid,
  _course_id integer,
  _type text,
  _data jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_data jsonb;
  v_title text;
  v_key text;
  v_value jsonb;
  v_number numeric;
  v_existing record;
  v_id uuid;
BEGIN
  IF _type IS NULL OR _type NOT IN ('course_completion', 'certificate', 'level_up', 'streak') THEN
    RETURN NULL;
  END IF;

  IF _user_id IS NULL OR _tenant_id IS NULL
     OR NOT public.community_milestone_allowed(_user_id, _tenant_id) THEN
    RETURN NULL;
  END IF;

  IF _type IN ('course_completion', 'certificate') THEN
    SELECT c.title INTO v_title
    FROM public.courses c
    WHERE c.course_id = _course_id
      AND c.tenant_id = _tenant_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND OR NOT public.has_course_access(_user_id, _course_id) THEN
      RETURN NULL;
    END IF;

    v_data := COALESCE(_data, '{}'::jsonb)
      || jsonb_build_object('course_id', _course_id, 'course_title', v_title);
  ELSE
    IF _course_id IS NOT NULL THEN
      RETURN NULL;
    END IF;

    v_key := CASE _type WHEN 'level_up' THEN 'level' ELSE 'days' END;
    v_value := _data -> v_key;
    IF v_value IS NULL OR jsonb_typeof(v_value) IS DISTINCT FROM 'number' THEN
      RETURN NULL;
    END IF;

    v_number := (v_value #>> '{}')::numeric;
    IF v_number IS NULL OR v_number <= 0 OR v_number <> trunc(v_number) THEN
      RETURN NULL;
    END IF;

    -- Only the contract key, as an integer: 5.0 and 5 are the same level.
    v_data := jsonb_build_object(v_key, v_number::integer);
  END IF;

  IF _type = 'certificate' THEN
    SELECT p.id, p.created_at, p.milestone_data INTO v_existing
    FROM public.community_posts p
    WHERE p.tenant_id = _tenant_id
      AND p.author_id = _user_id
      AND p.milestone_type = 'course_completion'
      AND p.post_type = 'milestone'
      AND p.milestone_data ->> 'course_id' = _course_id::text
    LIMIT 1;

    IF FOUND THEN
      -- Already folded: the certificate was announced once.
      IF v_existing.milestone_data ->> 'certificate' = 'true' THEN
        RETURN v_existing.id;
      END IF;

      -- Completed in this same transaction: one post says both.
      IF v_existing.created_at = now() THEN
        UPDATE public.community_posts
        SET milestone_data = milestone_data || '{"certificate": true}'::jsonb
        WHERE id = v_existing.id;
        RETURN v_existing.id;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.community_posts (
    tenant_id, author_id, course_id, post_type, content, milestone_type, milestone_data
  )
  VALUES (
    _tenant_id,
    _user_id,
    CASE WHEN _type IN ('course_completion', 'certificate') THEN _course_id END,
    'milestone',
    '',
    _type,
    v_data
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.community_create_milestone(uuid, uuid, integer, text, jsonb) IS
  '#871: the only writer of milestone posts. Returns the post id, or NULL when the gates refuse or it already exists. Folds a certificate into a completion post written in the same transaction. Owner-only.';

-- 6) the source triggers -------------------------------------------------------------
--
-- All SECURITY DEFINER: the writer is revoked from every API role, and an
-- invoker trigger calling it would fail — silently, inside the EXCEPTION block.

-- The course-completion check both completion sources share.
CREATE OR REPLACE FUNCTION public.community_milestone_check_completion(
  _user_id uuid,
  _tenant_id uuid,
  _course_id integer
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT public.community_milestone_allowed(_user_id, _tenant_id)
     OR NOT public.has_course_access(_user_id, _course_id) THEN
    RETURN;
  END IF;

  -- Announced already (the index prefix finds it): skip the completion counts.
  IF EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.tenant_id = _tenant_id
      AND p.author_id = _user_id
      AND p.milestone_type = 'course_completion'
      AND p.post_type = 'milestone'
      AND p.milestone_data ->> 'course_id' = _course_id::text
  ) THEN
    RETURN;
  END IF;

  IF public.is_course_complete(_user_id, _course_id) THEN
    PERFORM public.community_create_milestone(_user_id, _tenant_id, _course_id, 'course_completion', '{}'::jsonb);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.community_milestone_check_completion(uuid, uuid, integer) IS
  '#871: announce the course completion when this event completed the course. Called by the lesson and exam-score triggers.';

CREATE OR REPLACE FUNCTION public.community_milestone_on_lesson_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_course_id integer;
  v_tenant_id uuid;
BEGIN
  BEGIN
    -- lesson_completions has no tenant_id: lessons -> courses.
    SELECT c.course_id, c.tenant_id INTO v_course_id, v_tenant_id
    FROM public.lessons l
    JOIN public.courses c ON c.course_id = l.course_id
    WHERE l.id = NEW.lesson_id
      AND l.status = 'published';

    IF v_course_id IS NOT NULL THEN
      PERFORM public.community_milestone_check_completion(NEW.user_id, v_tenant_id, v_course_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '#871 milestone lesson_completions: % %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.community_milestone_on_lesson_completed() IS
  '#871: a completed lesson may complete its course. Never fails the insert.';

-- Name sorts before on_lesson_completed_xp and trigger_auto_issue_on_lesson_completion:
-- the completion post must exist before the certificate trigger looks for it.
DROP TRIGGER IF EXISTS on_lesson_completed_community_milestone ON public.lesson_completions;
CREATE TRIGGER on_lesson_completed_community_milestone
  AFTER INSERT ON public.lesson_completions
  FOR EACH ROW EXECUTE FUNCTION public.community_milestone_on_lesson_completed();

CREATE OR REPLACE FUNCTION public.community_milestone_on_exam_scored()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_course_id integer;
  v_tenant_id uuid;
BEGIN
  BEGIN
    SELECT c.course_id, c.tenant_id INTO v_course_id, v_tenant_id
    FROM public.exams e
    JOIN public.courses c ON c.course_id = e.course_id
    WHERE e.exam_id = NEW.exam_id
      AND e.status = 'published';

    IF v_course_id IS NOT NULL THEN
      PERFORM public.community_milestone_check_completion(NEW.student_id, v_tenant_id, v_course_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '#871 milestone exam_scores: % %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.community_milestone_on_exam_scored() IS
  '#871: a scored exam may complete its course. Never fails the write.';

-- Name sorts before trigger_auto_issue_cert_on_exam_scores (same reason).
DROP TRIGGER IF EXISTS on_exam_score_community_milestone ON public.exam_scores;
CREATE TRIGGER on_exam_score_community_milestone
  AFTER INSERT OR UPDATE OF score ON public.exam_scores
  FOR EACH ROW
  WHEN (NEW.score IS NOT NULL)
  EXECUTE FUNCTION public.community_milestone_on_exam_scored();

CREATE OR REPLACE FUNCTION public.community_milestone_on_certificate_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  BEGIN
    -- The course's tenant, not NEW.tenant_id: the simplified issue route
    -- omits it and the column defaults to the Default School.
    SELECT c.tenant_id INTO v_tenant_id
    FROM public.courses c
    WHERE c.course_id = NEW.course_id;

    -- Every real issuance path checks eligibility first. A student may insert
    -- their own certificate row through RLS; that must not become a post.
    IF v_tenant_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.certificate_templates t
         WHERE t.course_id = NEW.course_id AND t.is_active = true
       )
       AND COALESCE(
         (public.calculate_course_completion(NEW.user_id, NEW.course_id) ->> 'eligible')::boolean,
         false
       ) THEN
      PERFORM public.community_create_milestone(NEW.user_id, v_tenant_id, NEW.course_id, 'certificate', '{}'::jsonb);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '#871 milestone certificates: % %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.community_milestone_on_certificate_issued() IS
  '#871: an eligible certificate is announced (or folded into the completion post). Never fails the issuance.';

DROP TRIGGER IF EXISTS on_certificate_issued_community_milestone ON public.certificates;
CREATE TRIGGER on_certificate_issued_community_milestone
  AFTER INSERT ON public.certificates
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL AND NEW.course_id IS NOT NULL AND NEW.revoked_at IS NULL)
  EXECUTE FUNCTION public.community_milestone_on_certificate_issued();

CREATE OR REPLACE FUNCTION public.community_milestone_on_gamification_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_level_floor CONSTANT integer := 5;
  c_streak_thresholds CONSTANT integer[] := ARRAY[7, 30, 100];
  v_level integer;
  v_days integer;
  v_threshold integer;
BEGIN
  -- Arithmetic first: most XP awards announce nothing.
  IF COALESCE(NEW.level, 0) > COALESCE(OLD.level, 0) AND NEW.level >= c_level_floor THEN
    v_level := NEW.level;  -- a multi-level jump announces where it landed
  END IF;

  FOREACH v_threshold IN ARRAY c_streak_thresholds LOOP
    IF COALESCE(OLD.current_streak, 0) < v_threshold
       AND v_threshold <= COALESCE(NEW.current_streak, 0) THEN
      v_days := v_threshold;  -- the highest threshold crossed
    END IF;
  END LOOP;

  IF v_level IS NULL AND v_days IS NULL THEN
    RETURN NULL;
  END IF;

  -- Separate blocks: one failing does not stop the other.
  IF v_level IS NOT NULL THEN
    BEGIN
      PERFORM public.community_create_milestone(
        NEW.user_id, NEW.tenant_id, NULL, 'level_up', jsonb_build_object('level', v_level)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '#871 milestone level_up: % %', SQLSTATE, SQLERRM;
    END;
  END IF;

  IF v_days IS NOT NULL THEN
    BEGIN
      PERFORM public.community_create_milestone(
        NEW.user_id, NEW.tenant_id, NULL, 'streak', jsonb_build_object('days', v_days)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '#871 milestone streak: % %', SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.community_milestone_on_gamification_progress() IS
  '#871: level 5 and up, and 7/30/100-day streaks, go to the school feed. Never fails the XP write.';

DROP TRIGGER IF EXISTS on_gamification_progress_community_milestone ON public.gamification_profiles;
CREATE TRIGGER on_gamification_progress_community_milestone
  AFTER UPDATE OF level, current_streak ON public.gamification_profiles
  FOR EACH ROW
  WHEN (NEW.level > OLD.level OR NEW.current_streak > OLD.current_streak)
  EXECUTE FUNCTION public.community_milestone_on_gamification_progress();

-- 7) course milestones leave with their course ---------------------------------

-- Definer: only admins have a DELETE policy on posts, and a course is deleted
-- by its teacher too. Not wrapped on purpose — failing silently would move the
-- course's milestones into the school feed. BEFORE, because the FK's SET NULL
-- runs (as an RI trigger) ahead of any user AFTER trigger.
CREATE OR REPLACE FUNCTION public.community_milestones_on_course_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.community_posts
  WHERE tenant_id = OLD.tenant_id
    AND course_id = OLD.course_id
    AND post_type = 'milestone';
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.community_milestones_on_course_deleted() IS
  '#871: a deleted course takes its milestone posts with it (human posts keep the FK''s SET NULL behaviour).';

DROP TRIGGER IF EXISTS on_course_deleted_community_milestones ON public.courses;
CREATE TRIGGER on_course_deleted_community_milestones
  BEFORE DELETE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.community_milestones_on_course_deleted();

-- 8) privileges ----------------------------------------------------------------------

-- Supabase's default ACL grants EXECUTE on new functions to anon, authenticated
-- and service_role. None of these is an API: the owner (the triggers) only.
-- Postgres does not check EXECUTE on a trigger function when it fires.
REVOKE ALL ON FUNCTION
  public.community_create_milestone(uuid, uuid, integer, text, jsonb),
  public.community_milestone_allowed(uuid, uuid),
  public.community_milestone_check_completion(uuid, uuid, integer),
  public.is_course_complete(uuid, integer)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.community_milestone_on_lesson_completed(),
  public.community_milestone_on_exam_scored(),
  public.community_milestone_on_certificate_issued(),
  public.community_milestone_on_gamification_progress(),
  public.community_milestones_on_course_deleted()
FROM PUBLIC, anon, authenticated, service_role;
