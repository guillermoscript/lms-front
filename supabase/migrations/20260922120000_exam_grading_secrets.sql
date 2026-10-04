-- Issue #840: exam answer keys leave the student-readable rows.
--
-- Same class as #829/#833, for exams. `exam_questions` and `question_options`
-- are readable by anyone who can read the exam (`can_read_exam()`, #542), and
-- RLS is row-level, so the key came along with the question text:
--   * exam_questions.correct_answer | grading_rubric | ai_grading_criteria |
--     expected_keywords
--   * question_options.is_correct
-- A student could read every answer before submitting.
--
-- The key moves to the staff-only `exam_grading_secrets`, one row per
-- question. BEFORE triggers strip it off every write, so writers (exam builder,
-- MCP tools, restore, question generator) keep working unchanged. The #833
-- rule carries over — every client now reads NULL, so NULL on a write keeps the
-- stored value and a save-back of a loaded row wipes nothing:
--   * text columns: '' clears
--   * expected_keywords: '{}' clears
--   * is_correct: true/false sets; NULL keeps (a new option with NULL is wrong)
--
-- Readers:
--   * staff embed `exam_grading_secrets(...)` and merge it back
--     (`mergeExamGradingSecrets()`, lib/exams/grading-secrets.ts)
--   * the grader reads it with the service role (#841)
--   * a student gets `get_exam_answer_key(submission_id)` — the right answer
--     only, only for their own submission, only once it is graded

-- ── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE public.exam_grading_secrets (
  -- DEFERRABLE: the BEFORE INSERT trigger on exam_questions writes this row
  -- before the question row exists.
  question_id integer PRIMARY KEY
    REFERENCES public.exam_questions(question_id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  exam_id integer NOT NULL REFERENCES public.exams(exam_id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  correct_answer text,
  grading_rubric text,
  ai_grading_criteria text,
  expected_keywords text[],
  correct_option_ids integer[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX exam_grading_secrets_exam_id_idx ON public.exam_grading_secrets (exam_id);
CREATE INDEX exam_grading_secrets_tenant_id_idx ON public.exam_grading_secrets (tenant_id);

COMMENT ON TABLE public.exam_grading_secrets IS
  'Answer key and grading material for an exam question, lifted off the student-readable exam_questions / question_options rows by the trg_split_exam_* triggers (#840). correct_option_ids replaces question_options.is_correct. Staff-only under RLS; written only by the triggers.';

ALTER TABLE public.exam_grading_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.exam_grading_secrets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.exam_grading_secrets TO authenticated;
GRANT ALL ON public.exam_grading_secrets TO service_role;

CREATE POLICY "Staff can read exam grading secrets"
  ON public.exam_grading_secrets
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_staff_of(exam_grading_secrets.tenant_id))
    OR (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1
      FROM public.exams e
      JOIN public.courses c ON c.course_id = e.course_id
      WHERE e.exam_id = exam_grading_secrets.exam_id
        AND c.author_id = (SELECT auth.uid())
    )
  );

ALTER TABLE public.question_options ALTER COLUMN is_correct DROP NOT NULL;
ALTER TABLE public.question_options ALTER COLUMN is_correct DROP DEFAULT;

-- ── Split: exam_questions ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.exam_questions_split_grading_secrets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _stored public.exam_grading_secrets%ROWTYPE;
  _found boolean;
  _tenant_id uuid;
  _correct_answer text;
  _grading_rubric text;
  _ai_grading_criteria text;
  _expected_keywords text[];
BEGIN
  SELECT * INTO _stored
  FROM public.exam_grading_secrets s
  WHERE s.question_id = NEW.question_id;
  _found := FOUND;

  -- NULL keeps, '' clears.
  _correct_answer := CASE WHEN NEW.correct_answer IS NULL THEN _stored.correct_answer
                          ELSE NULLIF(NEW.correct_answer, '') END;
  _grading_rubric := CASE WHEN NEW.grading_rubric IS NULL THEN _stored.grading_rubric
                          ELSE NULLIF(NEW.grading_rubric, '') END;
  _ai_grading_criteria := CASE WHEN NEW.ai_grading_criteria IS NULL THEN _stored.ai_grading_criteria
                               ELSE NULLIF(NEW.ai_grading_criteria, '') END;
  _expected_keywords := CASE WHEN NEW.expected_keywords IS NULL THEN _stored.expected_keywords
                             WHEN cardinality(NEW.expected_keywords) = 0 THEN NULL
                             ELSE NEW.expected_keywords END;

  NEW.correct_answer := NULL;
  NEW.grading_rubric := NULL;
  NEW.ai_grading_criteria := NULL;
  NEW.expected_keywords := NULL;

  -- Nothing to store and no row yet: don't create an empty one.
  IF NOT _found
     AND _correct_answer IS NULL
     AND _grading_rubric IS NULL
     AND _ai_grading_criteria IS NULL
     AND _expected_keywords IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.tenant_id INTO _tenant_id FROM public.exams e WHERE e.exam_id = NEW.exam_id;

  INSERT INTO public.exam_grading_secrets
    (question_id, exam_id, tenant_id, correct_answer, grading_rubric,
     ai_grading_criteria, expected_keywords, updated_at)
  VALUES
    (NEW.question_id, NEW.exam_id, _tenant_id, _correct_answer, _grading_rubric,
     _ai_grading_criteria, _expected_keywords, now())
  ON CONFLICT (question_id) DO UPDATE
    SET exam_id = EXCLUDED.exam_id,
        tenant_id = EXCLUDED.tenant_id,
        correct_answer = EXCLUDED.correct_answer,
        grading_rubric = EXCLUDED.grading_rubric,
        ai_grading_criteria = EXCLUDED.ai_grading_criteria,
        expected_keywords = EXCLUDED.expected_keywords,
        updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.exam_questions_split_grading_secrets() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_split_exam_question_grading_secrets
  BEFORE INSERT OR UPDATE ON public.exam_questions
  FOR EACH ROW EXECUTE FUNCTION public.exam_questions_split_grading_secrets();

-- ── Split: question_options ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.question_options_split_grading_secrets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _question record;
BEGIN
  -- An option moved to another question takes its flag with it.
  IF TG_OP = 'UPDATE' AND NEW.question_id <> OLD.question_id THEN
    IF NEW.is_correct IS NULL THEN
      SELECT OLD.option_id = ANY (s.correct_option_ids) INTO NEW.is_correct
      FROM public.exam_grading_secrets s WHERE s.question_id = OLD.question_id;
    END IF;
    UPDATE public.exam_grading_secrets
    SET correct_option_ids = array_remove(correct_option_ids, OLD.option_id), updated_at = now()
    WHERE question_id = OLD.question_id;
  END IF;

  -- NULL keeps what is stored (a new option with NULL is not correct).
  IF NEW.is_correct IS NOT NULL THEN
    SELECT q.question_id, q.exam_id, e.tenant_id INTO _question
    FROM public.exam_questions q
    JOIN public.exams e ON e.exam_id = q.exam_id
    WHERE q.question_id = NEW.question_id;

    INSERT INTO public.exam_grading_secrets (question_id, exam_id, tenant_id, correct_option_ids)
    VALUES (
      _question.question_id, _question.exam_id, _question.tenant_id,
      CASE WHEN NEW.is_correct THEN ARRAY[NEW.option_id] ELSE '{}'::integer[] END
    )
    ON CONFLICT (question_id) DO UPDATE
      SET correct_option_ids = CASE
            WHEN NEW.is_correct
              THEN array_append(array_remove(exam_grading_secrets.correct_option_ids, NEW.option_id), NEW.option_id)
            ELSE array_remove(exam_grading_secrets.correct_option_ids, NEW.option_id)
          END,
          updated_at = now();
  END IF;

  NEW.is_correct := NULL;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.question_options_split_grading_secrets() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_split_question_option_grading_secrets
  BEFORE INSERT OR UPDATE ON public.question_options
  FOR EACH ROW EXECUTE FUNCTION public.question_options_split_grading_secrets();

CREATE OR REPLACE FUNCTION public.question_options_forget_grading_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.exam_grading_secrets
  SET correct_option_ids = array_remove(correct_option_ids, OLD.option_id), updated_at = now()
  WHERE question_id = OLD.question_id
    AND OLD.option_id = ANY (correct_option_ids);
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.question_options_forget_grading_secret() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_forget_question_option_grading_secret
  AFTER DELETE ON public.question_options
  FOR EACH ROW EXECUTE FUNCTION public.question_options_forget_grading_secret();

-- ── Student read: the right answer, after grading ──────────────────────────

-- Only the caller's own submission, only once it left `pending` (the grader
-- refuses to regrade from then on, #841). Rubric, criteria and keywords are
-- never returned: they stay staff material.
CREATE OR REPLACE FUNCTION public.get_exam_answer_key(p_submission_id integer)
RETURNS TABLE (question_id integer, correct_answer text, correct_option_ids integer[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.question_id, s.correct_answer, s.correct_option_ids
  FROM public.exam_submissions sub
  JOIN public.exam_grading_secrets s ON s.exam_id = sub.exam_id
  WHERE sub.submission_id = p_submission_id
    AND sub.student_id = (SELECT auth.uid())
    AND sub.review_status IS NOT NULL
    AND sub.review_status <> 'pending';
$$;

REVOKE EXECUTE ON FUNCTION public.get_exam_answer_key(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_answer_key(integer) TO authenticated;

-- ── Version history ─────────────────────────────────────────────────────────

-- Snapshots are staff-only (`content_versions` policies), so they keep the key.
CREATE OR REPLACE FUNCTION public.snapshot_exam_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _snapshot JSONB;
  _questions JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'question_id', eq.question_id,
      'question_text', eq.question_text,
      'question_type', eq.question_type,
      'points', eq.points,
      'correct_answer', gs.correct_answer,
      'grading_rubric', gs.grading_rubric,
      'ai_grading_criteria', gs.ai_grading_criteria,
      'expected_keywords', gs.expected_keywords,
      'max_length', eq.max_length,
      'options', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'option_id', qo.option_id,
            'option_text', qo.option_text,
            'is_correct', COALESCE(qo.option_id = ANY (gs.correct_option_ids), false)
          ) ORDER BY qo.option_id
        ), '[]'::jsonb)
        FROM question_options qo
        WHERE qo.question_id = eq.question_id
      )
    ) ORDER BY eq.question_id
  ), '[]'::jsonb) INTO _questions
  FROM exam_questions eq
  LEFT JOIN exam_grading_secrets gs ON gs.question_id = eq.question_id
  WHERE eq.exam_id = OLD.exam_id;

  _snapshot := jsonb_build_object(
    'exam_id', OLD.exam_id,
    'course_id', OLD.course_id,
    'title', OLD.title,
    'description', OLD.description,
    'exam_date', OLD.exam_date,
    'duration', OLD.duration,
    'status', OLD.status,
    'sequence', OLD.sequence,
    'questions', _questions,
    'updated_at', OLD.updated_at
  );

  INSERT INTO content_versions (content_type, content_id, version_number, snapshot, changed_by)
  VALUES ('exam', OLD.exam_id, next_version_number('exam', OLD.exam_id), _snapshot, auth.uid());

  RETURN NEW;
END;
$$;

-- Restore writes the whole key back (the split trigger stores it). Snapshots
-- taken before this migration carry no correct_answer / grading_rubric /
-- points; those come back NULL / default, as they did before.
CREATE OR REPLACE FUNCTION public.restore_exam_version(_exam_id integer, _version_number integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _snap JSONB;
  _q JSONB;
  _o JSONB;
  _new_qid INTEGER;
BEGIN
  -- Auth check: caller must be the course author
  IF NOT EXISTS (
    SELECT 1 FROM exams e
    JOIN courses c ON c.course_id = e.course_id
    WHERE e.exam_id = _exam_id AND c.author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to restore this exam';
  END IF;

  SELECT snapshot INTO _snap
  FROM content_versions
  WHERE content_type = 'exam' AND content_id = _exam_id AND version_number = _version_number;

  IF _snap IS NULL THEN
    RAISE EXCEPTION 'Version not found';
  END IF;

  -- Update exam metadata (triggers snapshot of current state)
  UPDATE exams SET
    title = _snap->>'title',
    description = _snap->>'description',
    duration = (_snap->>'duration')::integer,
    status = (_snap->>'status')::status,
    updated_at = NOW()
  WHERE exam_id = _exam_id;

  -- Delete existing questions (cascades to options and grading secrets)
  DELETE FROM exam_questions WHERE exam_id = _exam_id;

  FOR _q IN SELECT * FROM jsonb_array_elements(_snap->'questions')
  LOOP
    INSERT INTO exam_questions (
      exam_id, question_text, question_type, points, correct_answer, grading_rubric,
      ai_grading_criteria, expected_keywords, max_length
    )
    VALUES (
      _exam_id,
      _q->>'question_text',
      (_q->>'question_type')::varchar,
      COALESCE((_q->>'points')::integer, 10),
      _q->>'correct_answer',
      _q->>'grading_rubric',
      _q->>'ai_grading_criteria',
      CASE WHEN _q->'expected_keywords' IS NOT NULL AND _q->'expected_keywords' != 'null'::jsonb
        THEN ARRAY(SELECT jsonb_array_elements_text(_q->'expected_keywords'))
        ELSE NULL
      END,
      (_q->>'max_length')::integer
    )
    RETURNING question_id INTO _new_qid;

    FOR _o IN SELECT * FROM jsonb_array_elements(_q->'options')
    LOOP
      INSERT INTO question_options (question_id, option_text, is_correct)
      VALUES (
        _new_qid,
        _o->>'option_text',
        COALESCE((_o->>'is_correct')::boolean, false)
      );
    END LOOP;
  END LOOP;
END;
$$;

-- ── Backfill ────────────────────────────────────────────────────────────────

INSERT INTO public.exam_grading_secrets
  (question_id, exam_id, tenant_id, correct_answer, grading_rubric,
   ai_grading_criteria, expected_keywords, correct_option_ids)
SELECT
  q.question_id,
  q.exam_id,
  e.tenant_id,
  NULLIF(q.correct_answer, ''),
  NULLIF(q.grading_rubric, ''),
  NULLIF(q.ai_grading_criteria, ''),
  CASE WHEN cardinality(q.expected_keywords) > 0 THEN q.expected_keywords END,
  COALESCE(
    (SELECT array_agg(o.option_id ORDER BY o.option_id)
     FROM public.question_options o
     WHERE o.question_id = q.question_id AND o.is_correct),
    '{}'::integer[]
  )
FROM public.exam_questions q
JOIN public.exams e ON e.exam_id = q.exam_id;

-- The split triggers would re-read these NULLs as "keep", which is what we
-- want, but a data migration should not go through them at all.
ALTER TABLE public.exam_questions DISABLE TRIGGER USER;
ALTER TABLE public.question_options DISABLE TRIGGER USER;

UPDATE public.exam_questions
SET correct_answer = NULL,
    grading_rubric = NULL,
    ai_grading_criteria = NULL,
    expected_keywords = NULL
WHERE correct_answer IS NOT NULL
   OR grading_rubric IS NOT NULL
   OR ai_grading_criteria IS NOT NULL
   OR expected_keywords IS NOT NULL;

UPDATE public.question_options SET is_correct = NULL WHERE is_correct IS NOT NULL;

ALTER TABLE public.exam_questions ENABLE TRIGGER USER;
ALTER TABLE public.question_options ENABLE TRIGGER USER;
