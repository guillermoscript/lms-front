-- Issue #829: closed-question answer keys leave `exercises.exercise_config`.
--
-- `exercises` is SELECT-able by any entitled student under their own token
-- (#509), and the whole row came with it — including
-- `exercise_config.questions[].correctIndex | correctAnswer | acceptedAnswers
-- | explanation`. The web lesson page stripped them server-side, but a native
-- client or anyone with a token and PostgREST read the key straight off the row.
-- A column-level grant on `exercises` was rejected: ~41 call sites read the
-- table, many with `select('*')` or an embedded `exercises(*)`, and all of them
-- would 42501.
--
-- Instead the key moves to `exercise_answer_keys`, which only staff can read,
-- and a BEFORE trigger on `exercises` keeps it there: every write that carries
-- answer fields has them lifted into the key row and stripped from the config.
-- A write that carries a question WITHOUT answer fields keeps that question's
-- existing key entry, so a client that loaded the stripped config and saves it
-- back does not wipe the key.
--
-- Students grade closed questions through `grade_exercise_answers()` (server
-- side, same rules as lib/checkpoints/grading.ts); server code that needs the
-- key embeds `exercise_answer_keys(questions)` and merges it back
-- (`mergeAnswerKey()` in lib/checkpoints/types.ts).

-- ── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE public.exercise_answer_keys (
  -- DEFERRABLE: the BEFORE INSERT trigger on `exercises` writes this row
  -- before the exercise row itself exists.
  exercise_id bigint PRIMARY KEY
    REFERENCES public.exercises(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- { "<questionId>": { correctIndex? | correctAnswer? | acceptedAnswers?, explanation? } }
  questions jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(questions) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX exercise_answer_keys_tenant_id_idx ON public.exercise_answer_keys (tenant_id);

COMMENT ON TABLE public.exercise_answer_keys IS
  'Answer keys for closed questions in exercises.exercise_config.questions, keyed by question id. Staff-only under RLS; written by the exercises_split_answer_key trigger (#829).';

ALTER TABLE public.exercise_answer_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.exercise_answer_keys FROM anon;

-- Staff of the row's tenant, the course author, or a super admin — the same
-- people who can edit the exercise. Students and anon get nothing.
CREATE POLICY "Staff can manage exercise answer keys"
  ON public.exercise_answer_keys FOR ALL TO authenticated
  USING (
    (SELECT public.is_staff_of(tenant_id))
    OR (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1
      FROM public.exercises e
      JOIN public.courses c ON c.course_id = e.course_id
      WHERE e.id = exercise_answer_keys.exercise_id
        AND c.author_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT public.is_staff_of(tenant_id))
    OR (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1
      FROM public.exercises e
      JOIN public.courses c ON c.course_id = e.course_id
      WHERE e.id = exercise_answer_keys.exercise_id
        AND e.tenant_id = exercise_answer_keys.tenant_id
        AND c.author_id = (SELECT auth.uid())
    )
  );

-- ── Split ───────────────────────────────────────────────────────────────────

-- Pure: given a config and the exercise's current key, return the config with
-- every answer field stripped and the key the exercise should now have.
CREATE OR REPLACE FUNCTION public.split_exercise_answer_key(
  _config jsonb,
  _existing jsonb,
  OUT config jsonb,
  OUT answer_key jsonb
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  _fields constant text[] := ARRAY['correctIndex', 'correctAnswer', 'acceptedAnswers', 'explanation'];
  _question jsonb;
  _id text;
  _answers jsonb;
  _stripped jsonb := '[]'::jsonb;
BEGIN
  answer_key := '{}'::jsonb;
  config := _config;
  IF _config IS NULL OR jsonb_typeof(_config) <> 'object'
     OR jsonb_typeof(_config -> 'questions') IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;

  FOR _question IN SELECT value FROM jsonb_array_elements(_config -> 'questions') LOOP
    IF jsonb_typeof(_question) <> 'object' THEN
      _stripped := _stripped || jsonb_build_array(_question);
      CONTINUE;
    END IF;

    _id := CASE WHEN jsonb_typeof(_question -> 'id') = 'string' THEN _question ->> 'id' END;
    SELECT jsonb_object_agg(key, value) INTO _answers
    FROM jsonb_each(_question)
    WHERE key = ANY (_fields);

    IF _id IS NOT NULL THEN
      IF _answers IS NOT NULL THEN
        answer_key := answer_key || jsonb_build_object(_id, _answers);
      ELSIF _existing ? _id THEN
        answer_key := answer_key || jsonb_build_object(_id, _existing -> _id);
      END IF;
    END IF;

    -- Stripped even when the question has no id: nothing can grade it, and
    -- it must not leak either.
    _stripped := _stripped || jsonb_build_array(_question - _fields);
  END LOOP;

  config := jsonb_set(_config, '{questions}', _stripped);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.split_exercise_answer_key(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.exercises_split_answer_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _existing jsonb;
  _split record;
BEGIN
  SELECT k.questions INTO _existing
  FROM public.exercise_answer_keys k
  WHERE k.exercise_id = NEW.id;

  SELECT * INTO _split
  FROM public.split_exercise_answer_key(NEW.exercise_config, COALESCE(_existing, '{}'::jsonb));

  NEW.exercise_config := _split.config;

  -- No key and nothing to store: don't create an empty row for every essay.
  IF _existing IS NULL AND _split.answer_key = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.exercise_answer_keys (exercise_id, tenant_id, questions, updated_at)
  VALUES (NEW.id, NEW.tenant_id, _split.answer_key, now())
  ON CONFLICT (exercise_id) DO UPDATE
    SET questions = EXCLUDED.questions,
        tenant_id = EXCLUDED.tenant_id,
        updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.exercises_split_answer_key() FROM PUBLIC, anon, authenticated;

-- ── Backfill ────────────────────────────────────────────────────────────────

-- Runs the split directly rather than through a no-op UPDATE, with USER
-- triggers off: the version-snapshot trigger (and anything else a deployment
-- has on `exercises`) must not see a data migration as a teacher edit.
ALTER TABLE public.exercises DISABLE TRIGGER USER;

WITH src AS (
  SELECT e.id, e.tenant_id, s.config, s.answer_key
  FROM public.exercises e
  CROSS JOIN LATERAL public.split_exercise_answer_key(e.exercise_config, '{}'::jsonb) s
  WHERE jsonb_typeof(e.exercise_config -> 'questions') = 'array'
),
keys AS (
  INSERT INTO public.exercise_answer_keys (exercise_id, tenant_id, questions)
  SELECT id, tenant_id, answer_key FROM src
  WHERE answer_key <> '{}'::jsonb AND tenant_id IS NOT NULL
  ON CONFLICT (exercise_id) DO UPDATE SET questions = EXCLUDED.questions, updated_at = now()
  RETURNING exercise_id
)
UPDATE public.exercises e
SET exercise_config = src.config
FROM src
WHERE e.id = src.id
  AND e.exercise_config IS DISTINCT FROM src.config;

ALTER TABLE public.exercises ENABLE TRIGGER USER;

CREATE TRIGGER exercises_split_answer_key
  BEFORE INSERT OR UPDATE OF exercise_config, tenant_id ON public.exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.exercises_split_answer_key();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.exercises e
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(e.exercise_config -> 'questions') = 'array'
           THEN e.exercise_config -> 'questions' ELSE '[]'::jsonb END
    ) q
    WHERE jsonb_typeof(q) = 'object'
      AND q ?| ARRAY['correctIndex', 'correctAnswer', 'acceptedAnswers', 'explanation']
  ) THEN
    RAISE EXCEPTION 'exercise_answer_keys backfill left answer fields in exercises.exercise_config';
  END IF;
END;
$$;

-- ── Server-side grading ─────────────────────────────────────────────────────

-- normalizeAnswerText() from lib/checkpoints/grading.ts: trim, lowercase,
-- collapse whitespace.
CREATE OR REPLACE FUNCTION public.normalize_answer_text(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(regexp_replace(lower(_value), '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g');
$$;

-- Grade closed-question answers without handing the key to the caller.
-- Mirrors parseCheckpointQuestions + gradeCheckpointQuestions
-- (lib/checkpoints/types.ts, lib/checkpoints/grading.ts) rule for rule:
-- malformed questions are skipped, unanswered ones count as wrong, free text
-- goes through normalize_answer_text().
--
-- `_answers` is `[{ questionId, value }]`. Returns
-- `{ score, correctCount, total, passingScore, passed, perQuestion: [{ questionId, correct, correctValue, explanation? }] }`.
--
-- Who may call it is who may read the exercise (the `exercises` SELECT policy),
-- except that a student cannot grade an exercise that is an enabled lesson
-- checkpoint: that one is answered in the lesson, where the attempt is counted,
-- and grading it here would hand back its correct values for free.
CREATE OR REPLACE FUNCTION public.grade_exercise_answers(_exercise_id bigint, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _exercise record;
  _key jsonb;
  _is_staff boolean;
  _by_question jsonb := '{}'::jsonb;
  _answer jsonb;
  _question jsonb;
  _entry jsonb;
  _id text;
  _value jsonb;
  _options jsonb;
  _accepted jsonb;
  _correct boolean;
  _correct_value jsonb;
  _index numeric;
  _per_question jsonb := '[]'::jsonb;
  _total int := 0;
  _correct_count int := 0;
  _score int;
  _passing numeric;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT e.id, e.tenant_id, e.course_id, e.exercise_config
  INTO _exercise
  FROM public.exercises e
  WHERE e.id = _exercise_id
    AND e.tenant_id = public.get_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'exercise_not_found' USING ERRCODE = 'P0002';
  END IF;

  _is_staff := public.is_staff_of(_exercise.tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.course_id = _exercise.course_id AND c.author_id = _uid
    );

  IF NOT _is_staff THEN
    IF NOT public.has_course_access(_uid, _exercise.course_id) THEN
      RAISE EXCEPTION 'exercise_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.lesson_checkpoints lc
      WHERE lc.exercise_id = _exercise.id
        AND lc.tenant_id = _exercise.tenant_id
        AND lc.is_enabled
    ) THEN
      RAISE EXCEPTION 'exercise_is_lesson_checkpoint' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT k.questions INTO _key
  FROM public.exercise_answer_keys k
  WHERE k.exercise_id = _exercise.id;
  _key := COALESCE(_key, '{}'::jsonb);

  -- Last answer per question wins, as with the Map in gradeCheckpointQuestions.
  IF jsonb_typeof(_answers) = 'array' THEN
    FOR _answer IN SELECT value FROM jsonb_array_elements(_answers) LOOP
      IF jsonb_typeof(_answer) = 'object' AND jsonb_typeof(_answer -> 'questionId') = 'string' THEN
        _by_question := _by_question || jsonb_build_object(_answer ->> 'questionId', _answer -> 'value');
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(_exercise.exercise_config -> 'questions') = 'array' THEN
    FOR _question IN SELECT value FROM jsonb_array_elements(_exercise.exercise_config -> 'questions') LOOP
      CONTINUE WHEN jsonb_typeof(_question) <> 'object'
        OR jsonb_typeof(_question -> 'id') IS DISTINCT FROM 'string'
        OR jsonb_typeof(_question -> 'prompt') IS DISTINCT FROM 'string';

      _id := _question ->> 'id';
      _entry := COALESCE(_key -> _id, '{}'::jsonb);
      _value := _by_question -> _id;
      _correct := false;
      _correct_value := 'null'::jsonb;

      IF _question ->> 'type' = 'multiple_choice' THEN
        CONTINUE WHEN jsonb_typeof(_question -> 'options') IS DISTINCT FROM 'array'
          OR jsonb_typeof(_entry -> 'correctIndex') IS DISTINCT FROM 'number';
        SELECT COALESCE(jsonb_agg(o), '[]'::jsonb) INTO _options
        FROM jsonb_array_elements(_question -> 'options') o
        WHERE jsonb_typeof(o) = 'string';
        _index := (_entry ->> 'correctIndex')::numeric;
        _correct := COALESCE(jsonb_typeof(_value) = 'number' AND (_value #>> '{}')::numeric = _index, false);
        IF _index = trunc(_index) AND _index >= 0 AND _index < jsonb_array_length(_options) THEN
          _correct_value := _options -> _index::int;
        END IF;

      ELSIF _question ->> 'type' = 'true_false' THEN
        CONTINUE WHEN jsonb_typeof(_entry -> 'correctAnswer') IS DISTINCT FROM 'boolean';
        _correct := COALESCE(jsonb_typeof(_value) = 'boolean' AND _value = _entry -> 'correctAnswer', false);
        _correct_value := _entry -> 'correctAnswer';

      ELSIF _question ->> 'type' = 'fill_in_the_blank' THEN
        CONTINUE WHEN jsonb_typeof(_entry -> 'acceptedAnswers') IS DISTINCT FROM 'array'
          OR jsonb_array_length(_entry -> 'acceptedAnswers') = 0;
        SELECT COALESCE(jsonb_agg(a), '[]'::jsonb) INTO _accepted
        FROM jsonb_array_elements(_entry -> 'acceptedAnswers') a
        WHERE jsonb_typeof(a) = 'string';
        _correct := COALESCE(jsonb_typeof(_value) = 'string' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(_accepted) acc
          WHERE public.normalize_answer_text(acc) = public.normalize_answer_text(_value #>> '{}')
        ), false);
        _correct_value := COALESCE(_accepted -> 0, 'null'::jsonb);

      ELSE
        CONTINUE;
      END IF;

      _total := _total + 1;
      IF _correct THEN _correct_count := _correct_count + 1; END IF;
      _per_question := _per_question || jsonb_build_array(
        jsonb_build_object('questionId', _id, 'correct', _correct, 'correctValue', _correct_value)
        || CASE WHEN jsonb_typeof(_entry -> 'explanation') = 'string'
                THEN jsonb_build_object('explanation', _entry -> 'explanation')
                ELSE '{}'::jsonb END
      );
    END LOOP;
  END IF;

  _score := CASE WHEN _total = 0 THEN 0 ELSE round(_correct_count * 100.0 / _total)::int END;
  _passing := CASE WHEN jsonb_typeof(_exercise.exercise_config -> 'passing_score') = 'number'
                   THEN (_exercise.exercise_config ->> 'passing_score')::numeric ELSE 70 END;

  RETURN jsonb_build_object(
    'score', _score,
    'correctCount', _correct_count,
    'total', _total,
    'passingScore', _passing,
    'passed', _total > 0 AND _score >= _passing,
    'perQuestion', _per_question
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grade_exercise_answers(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_exercise_answers(bigint, jsonb) TO authenticated;

COMMENT ON FUNCTION public.grade_exercise_answers(bigint, jsonb) IS
  'Grade closed-question answers server-side against exercise_answer_keys (#829). Same rules as lib/checkpoints/grading.ts. Refuses students on enabled lesson-checkpoint exercises.';
