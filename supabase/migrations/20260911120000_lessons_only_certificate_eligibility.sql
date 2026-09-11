-- A course with lessons but no exams could never earn a certificate (#696).
--
-- `calculate_course_completion()` decided eligibility with a single boolean
-- expression:
--
--     v_completion_pct >= min_lesson_completion_pct
--     AND (
--       (requires_all_exams = true AND v_submitted_exams = v_total_exams AND v_all_exams_passed)
--       OR (requires_all_exams = false AND v_avg_score >= min_exam_pass_score)
--     )
--
-- `v_all_exams_passed` is `BOOL_AND(...)` and `v_avg_score` is `AVG(...)` over
-- the student's scored submissions. For a course with zero published exams both
-- aggregates run over an empty set and return NULL, so in three-valued logic the
-- whole expression collapses to NULL — not false, but not true either. The
-- function then emitted `"eligible": null`, and every caller
-- (`check_and_issue_certificate` casting with `::BOOLEAN`, the TypeScript
-- helpers using `data.eligible || false`) reads that as "not eligible". A
-- lessons-only course was therefore un-certifiable at 100% lesson completion
-- with an active template, and both auto-issuance triggers were dead for it.
--
-- Fix: decide the exam requirement in an explicit branch instead of inside the
-- boolean expression, and treat "no published exams" as vacuously satisfied.
-- The nullable template thresholds are read through COALESCE to their documented
-- defaults for the same reason — an explicit NULL in `min_lesson_completion_pct`,
-- `min_exam_pass_score` or `requires_all_exams` produced the identical
-- `eligible: null` symptom by a different route — and the verdict itself is
-- COALESCEd so the function can never again return a null eligibility.
--
-- A course with no published lessons AND no published exams is now explicitly
-- not eligible. Without that guard, "no exams means passed" plus a template
-- whose `min_lesson_completion_pct` is 0 would issue certificates for a
-- completely empty course; today that case returns null (read as not eligible),
-- so the guard preserves the current outcome rather than changing it.
--
-- The result JSON keeps its shape: same keys, `eligible` now always a real
-- boolean, and `reason` present on the explicit not-eligible early returns.

CREATE OR REPLACE FUNCTION public.calculate_course_completion(
  p_user_id UUID,
  p_course_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_lessons INTEGER;
  v_completed_lessons INTEGER;
  v_completion_pct NUMERIC;
  v_total_exams INTEGER;
  v_submitted_exams INTEGER;
  v_avg_score NUMERIC;
  v_all_exams_passed BOOLEAN;
  v_exams_ok BOOLEAN;
  v_eligible BOOLEAN := false;
  v_min_lesson_pct INTEGER;
  v_min_exam_score INTEGER;
  v_requires_all_exams BOOLEAN;
  v_template RECORD;
  v_result JSONB;
BEGIN
  -- Get certificate template for course
  SELECT * INTO v_template
  FROM public.certificate_templates
  WHERE course_id = p_course_id AND is_active = true
  LIMIT 1;

  -- If no template, return not eligible
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'No active certificate template for this course'
    );
  END IF;

  -- The criteria columns are nullable; fall back to the table defaults so a NULL
  -- can never make the eligibility verdict itself NULL.
  v_min_lesson_pct := COALESCE(v_template.min_lesson_completion_pct, 100);
  v_min_exam_score := COALESCE(v_template.min_exam_pass_score, 70);
  v_requires_all_exams := COALESCE(v_template.requires_all_exams, true);

  -- Count total published lessons
  SELECT COUNT(*) INTO v_total_lessons
  FROM public.lessons
  WHERE course_id = p_course_id AND status = 'published';

  -- Count completed lessons
  SELECT COUNT(DISTINCT lc.lesson_id) INTO v_completed_lessons
  FROM public.lesson_completions lc
  JOIN public.lessons l ON lc.lesson_id = l.id
  WHERE lc.user_id = p_user_id
    AND l.course_id = p_course_id
    AND l.status = 'published';

  -- Calculate completion percentage
  IF v_total_lessons > 0 THEN
    v_completion_pct := (v_completed_lessons::NUMERIC / v_total_lessons::NUMERIC) * 100;
  ELSE
    v_completion_pct := 0;
  END IF;

  -- Count total published exams
  SELECT COUNT(*) INTO v_total_exams
  FROM public.exams
  WHERE course_id = p_course_id AND status = 'published';

  -- Count submitted exams with scores
  SELECT
    COUNT(DISTINCT es.exam_id),
    AVG(esc.score),
    BOOL_AND(esc.score >= v_min_exam_score)
  INTO v_submitted_exams, v_avg_score, v_all_exams_passed
  FROM public.exam_submissions es
  JOIN public.exam_scores esc ON es.submission_id = esc.submission_id
  JOIN public.exams e ON es.exam_id = e.exam_id
  WHERE es.student_id = p_user_id
    AND e.course_id = p_course_id
    AND e.status = 'published';

  -- A course with nothing published has nothing to complete — never eligible,
  -- whatever the template's thresholds say.
  IF v_total_lessons = 0 AND v_total_exams = 0 THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'Course has no published lessons or exams',
      'completionPercentage', 0,
      'totalLessons', 0,
      'completedLessons', 0,
      'totalExams', 0,
      'submittedExams', 0,
      'averageExamScore', 0,
      'allExamsPassed', false,
      'criteria', jsonb_build_object(
        'minLessonCompletionPct', v_min_lesson_pct,
        'minExamPassScore', v_min_exam_score,
        'requiresAllExams', v_requires_all_exams
      )
    );
  END IF;

  -- Decide the exam requirement separately, so an empty aggregate cannot turn
  -- the whole verdict into NULL.
  IF v_total_exams = 0 THEN
    -- Nothing to sit: the exam requirement is vacuously satisfied.
    v_exams_ok := true;
  ELSIF v_requires_all_exams THEN
    v_exams_ok := (v_submitted_exams = v_total_exams AND COALESCE(v_all_exams_passed, false));
  ELSE
    v_exams_ok := (COALESCE(v_avg_score, 0) >= v_min_exam_score);
  END IF;

  v_eligible := COALESCE(
    (v_completion_pct >= v_min_lesson_pct AND v_exams_ok),
    false
  );

  -- Build result
  v_result := jsonb_build_object(
    'eligible', v_eligible,
    'completionPercentage', ROUND(v_completion_pct, 2),
    'totalLessons', v_total_lessons,
    'completedLessons', v_completed_lessons,
    'totalExams', v_total_exams,
    'submittedExams', v_submitted_exams,
    'averageExamScore', COALESCE(ROUND(v_avg_score, 2), 0),
    'allExamsPassed', CASE WHEN v_total_exams = 0 THEN true ELSE COALESCE(v_all_exams_passed, false) END,
    'criteria', jsonb_build_object(
      'minLessonCompletionPct', v_min_lesson_pct,
      'minExamPassScore', v_min_exam_score,
      'requiresAllExams', v_requires_all_exams
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_course_completion IS
  'Calculates if student meets certificate criteria for a course. A course with no published exams satisfies the exam requirement vacuously (#696); a course with nothing published at all is never eligible.';
