-- Issue #833: the rest of the grading material leaves the `exercises` row.
--
-- #829 moved closed-question answer keys into the staff-only
-- `exercise_answer_keys`. The AI grader's material stayed behind, readable by
-- any entitled student under their own token (#509):
--   * `exercises.system_prompt` — the grader's instructions, often with the
--     model answer in them
--   * `exercises.template_variables` — the values the prompt template was
--     filled with (same content)
--   * `exercise_config.evaluation_criteria | rubric | expected_keywords |
--     system_prompt`
--
-- Same fix, one table: `exercise_answer_keys` becomes `exercise_grading_secrets`
-- and gains `config`, `system_prompt` and `template_variables`. One BEFORE
-- trigger strips all of it on every write. The #829 rule carries over — a write
-- that does not carry a field keeps the stored value, so a client that loaded
-- the stripped row and saves it back wipes nothing. To clear: a config key set
-- to JSON null, or `system_prompt = ''`. `template_variables` cannot be
-- cleared to NULL (write `{}`).
--
-- Server code merges the secrets back with `mergeGradingSecrets()` /
-- `withGradingSecrets()` (lib/exercises/grading-secrets.ts) from the embed
-- `exercise_grading_secrets(questions, config, system_prompt, template_variables)`.

-- ── Table ───────────────────────────────────────────────────────────────────

ALTER TABLE public.exercise_answer_keys RENAME TO exercise_grading_secrets;
ALTER INDEX public.exercise_answer_keys_pkey RENAME TO exercise_grading_secrets_pkey;
ALTER INDEX public.exercise_answer_keys_tenant_id_idx RENAME TO exercise_grading_secrets_tenant_id_idx;
ALTER POLICY "Staff can manage exercise answer keys" ON public.exercise_grading_secrets
  RENAME TO "Staff can manage exercise grading secrets";

ALTER TABLE public.exercise_grading_secrets
  -- { evaluation_criteria?, rubric?, expected_keywords?, system_prompt? } —
  -- the keys lifted out of exercises.exercise_config.
  ADD COLUMN config jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(config) = 'object'),
  ADD COLUMN system_prompt text,
  ADD COLUMN template_variables jsonb;

COMMENT ON TABLE public.exercise_grading_secrets IS
  'Grading material for an exercise, lifted off the student-readable exercises row by the trg_split_exercise_grading_secrets trigger: closed-question answer keys (questions, keyed by question id, #829), the secret exercise_config keys (config), system_prompt and template_variables (#833). Staff-only under RLS.';

-- ── Split ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.exercises_split_grading_secrets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _config_keys constant text[] := ARRAY['evaluation_criteria', 'rubric', 'expected_keywords', 'system_prompt'];
  _stored public.exercise_grading_secrets%ROWTYPE;
  _found boolean;
  _split record;
  _config jsonb;
  _key text;
  _system_prompt text;
  _template_variables jsonb;
BEGIN
  SELECT * INTO _stored
  FROM public.exercise_grading_secrets s
  WHERE s.exercise_id = NEW.id;
  _found := FOUND;

  SELECT * INTO _split
  FROM public.split_exercise_answer_key(NEW.exercise_config, COALESCE(_stored.questions, '{}'::jsonb));
  NEW.exercise_config := _split.config;

  -- Present key: stored (JSON null clears it). Absent key: kept.
  _config := COALESCE(_stored.config, '{}'::jsonb);
  IF jsonb_typeof(NEW.exercise_config) = 'object' THEN
    FOREACH _key IN ARRAY _config_keys LOOP
      CONTINUE WHEN NOT NEW.exercise_config ? _key;
      IF NEW.exercise_config -> _key = 'null'::jsonb THEN
        _config := _config - _key;
      ELSE
        _config := _config || jsonb_build_object(_key, NEW.exercise_config -> _key);
      END IF;
    END LOOP;
    NEW.exercise_config := NEW.exercise_config - _config_keys;
  END IF;

  -- NULL keeps what is stored — every row reads back NULL, so NULL is what an
  -- untouched save-back carries. '' clears.
  _system_prompt := CASE WHEN NEW.system_prompt IS NULL THEN _stored.system_prompt
                         ELSE NULLIF(NEW.system_prompt, '') END;
  _template_variables := COALESCE(NEW.template_variables, _stored.template_variables);
  NEW.system_prompt := NULL;
  NEW.template_variables := NULL;

  -- Nothing to store and no row yet: don't create an empty one.
  IF NOT _found
     AND _split.answer_key = '{}'::jsonb
     AND _config = '{}'::jsonb
     AND _system_prompt IS NULL
     AND _template_variables IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.exercise_grading_secrets
    (exercise_id, tenant_id, questions, config, system_prompt, template_variables, updated_at)
  VALUES
    (NEW.id, NEW.tenant_id, _split.answer_key, _config, _system_prompt, _template_variables, now())
  ON CONFLICT (exercise_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id,
        questions = EXCLUDED.questions,
        config = EXCLUDED.config,
        system_prompt = EXCLUDED.system_prompt,
        template_variables = EXCLUDED.template_variables,
        updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.exercises_split_grading_secrets() FROM PUBLIC, anon, authenticated;

DROP TRIGGER exercises_split_answer_key ON public.exercises;
DROP FUNCTION public.exercises_split_answer_key();

-- ── Version history ─────────────────────────────────────────────────────────

-- The snapshot is of OLD, whose system_prompt / template_variables now read
-- NULL; the stored values come from the side table. Triggers of one timing fire
-- in name order, and `trg_snapshot_…` sorts before `trg_split_…`, so the side
-- table still holds OLD's values when this runs.
CREATE OR REPLACE FUNCTION public.snapshot_exercise_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _snapshot JSONB;
  _secrets public.exercise_grading_secrets%ROWTYPE;
BEGIN
  SELECT * INTO _secrets FROM public.exercise_grading_secrets s WHERE s.exercise_id = OLD.id;

  _snapshot := jsonb_build_object(
    'id', OLD.id,
    'course_id', OLD.course_id,
    'lesson_id', OLD.lesson_id,
    'title', OLD.title,
    'description', OLD.description,
    'instructions', OLD.instructions,
    'system_prompt', COALESCE(OLD.system_prompt, _secrets.system_prompt),
    'exercise_type', OLD.exercise_type,
    'difficulty_level', OLD.difficulty_level,
    'time_limit', OLD.time_limit,
    'active_file', OLD.active_file,
    'visible_files', OLD.visible_files,
    'template_id', OLD.template_id,
    'template_variables', COALESCE(OLD.template_variables, _secrets.template_variables),
    'status', OLD.status,
    'updated_at', OLD.updated_at
  );

  INSERT INTO content_versions (content_type, content_id, version_number, snapshot, changed_by)
  VALUES ('exercise', OLD.id, next_version_number('exercise', OLD.id), _snapshot, auth.uid());

  RETURN NEW;
END;
$$;

-- Restoring a version whose prompt was empty must clear the current one.
CREATE OR REPLACE FUNCTION public.restore_exercise_version(_exercise_id bigint, _version_number integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _snap JSONB;
BEGIN
  -- Auth check: caller must be the exercise creator
  IF NOT EXISTS (
    SELECT 1 FROM exercises WHERE id = _exercise_id AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to restore this exercise';
  END IF;

  SELECT snapshot INTO _snap
  FROM content_versions
  WHERE content_type = 'exercise' AND content_id = _exercise_id AND version_number = _version_number;

  IF _snap IS NULL THEN
    RAISE EXCEPTION 'Version not found';
  END IF;

  UPDATE exercises SET
    title = _snap->>'title',
    description = _snap->>'description',
    instructions = _snap->>'instructions',
    -- '' clears: NULL would keep the current prompt (#833).
    system_prompt = COALESCE(_snap->>'system_prompt', ''),
    exercise_type = (_snap->>'exercise_type')::exercise_type,
    difficulty_level = (_snap->>'difficulty_level')::difficulty_level,
    time_limit = (_snap->>'time_limit')::integer,
    template_id = (_snap->>'template_id')::bigint,
    template_variables = CASE WHEN _snap->'template_variables' != 'null'::jsonb THEN _snap->'template_variables' ELSE NULL END,
    status = (_snap->>'status')::status,
    updated_at = NOW()
  WHERE id = _exercise_id;
END;
$$;

-- ── Backfill ────────────────────────────────────────────────────────────────

-- USER triggers off: the version snapshot must not see a data migration as a
-- teacher edit.
ALTER TABLE public.exercises DISABLE TRIGGER USER;

WITH src AS (
  SELECT
    e.id,
    e.tenant_id,
    COALESCE((
      SELECT jsonb_object_agg(c.key, c.value)
      FROM jsonb_each(e.exercise_config) c
      WHERE c.key = ANY (ARRAY['evaluation_criteria', 'rubric', 'expected_keywords', 'system_prompt'])
        AND c.value <> 'null'::jsonb
    ), '{}'::jsonb) AS config,
    NULLIF(e.system_prompt, '') AS system_prompt,
    e.template_variables
  FROM public.exercises e
  WHERE (jsonb_typeof(e.exercise_config) = 'object'
         AND e.exercise_config ?| ARRAY['evaluation_criteria', 'rubric', 'expected_keywords', 'system_prompt'])
     OR e.system_prompt IS NOT NULL
     OR e.template_variables IS NOT NULL
)
INSERT INTO public.exercise_grading_secrets (exercise_id, tenant_id, config, system_prompt, template_variables)
SELECT id, tenant_id, config, system_prompt, template_variables FROM src
ON CONFLICT (exercise_id) DO UPDATE
  SET config = EXCLUDED.config,
      system_prompt = EXCLUDED.system_prompt,
      template_variables = EXCLUDED.template_variables,
      updated_at = now();

UPDATE public.exercises e
SET exercise_config = CASE WHEN jsonb_typeof(e.exercise_config) = 'object'
                           THEN e.exercise_config - ARRAY['evaluation_criteria', 'rubric', 'expected_keywords', 'system_prompt']
                           ELSE e.exercise_config END,
    system_prompt = NULL,
    template_variables = NULL
WHERE (jsonb_typeof(e.exercise_config) = 'object'
       AND e.exercise_config ?| ARRAY['evaluation_criteria', 'rubric', 'expected_keywords', 'system_prompt'])
   OR e.system_prompt IS NOT NULL
   OR e.template_variables IS NOT NULL;

ALTER TABLE public.exercises ENABLE TRIGGER USER;

CREATE TRIGGER trg_split_exercise_grading_secrets
  BEFORE INSERT OR UPDATE OF exercise_config, system_prompt, template_variables, tenant_id
  ON public.exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.exercises_split_grading_secrets();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.exercises e
    WHERE e.system_prompt IS NOT NULL
       OR e.template_variables IS NOT NULL
       OR (jsonb_typeof(e.exercise_config) = 'object'
           AND e.exercise_config ?| ARRAY['evaluation_criteria', 'rubric', 'expected_keywords', 'system_prompt'])
  ) THEN
    RAISE EXCEPTION 'exercise_grading_secrets backfill left grading material on exercises';
  END IF;
END;
$$;

-- ── Server-side grading ─────────────────────────────────────────────────────

-- Unchanged from #829 except the table it reads the key from.
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
  FROM public.exercise_grading_secrets k
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
      -- A student learns right or wrong, never the answer: with correctValue in
      -- the result, grading `[]` would read the whole key back.
      _per_question := _per_question || jsonb_build_array(
        jsonb_build_object('questionId', _id, 'correct', _correct)
        || CASE WHEN _is_staff
                THEN jsonb_build_object('correctValue', _correct_value)
                ELSE '{}'::jsonb END
        || CASE WHEN _is_staff AND jsonb_typeof(_entry -> 'explanation') = 'string'
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
  'Grade closed-question answers server-side against exercise_grading_secrets (#829, #833). Same rules as lib/checkpoints/grading.ts. Students get right/wrong only (no correctValue/explanation) and are refused on enabled lesson-checkpoint exercises.';

NOTIFY pgrst, 'reload schema';
