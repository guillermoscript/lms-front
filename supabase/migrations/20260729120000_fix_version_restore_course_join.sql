-- Version restore has never worked for lessons or exams.
--
-- Both auth checks join `courses c ON c.id = <child>.course_id`, but the
-- courses primary key is `course_id` — there is no `id` column. The join is
-- only reached at runtime, so the functions created cleanly and every call
-- has failed with `column c.id does not exist`. The UI surfaced it as
-- "Restore failed" with the raw Postgres message.
--
-- While recreating restore_lesson_version, also close the removal hole: a
-- snapshot taken after the teacher cleared the AI task stores ai_task = null,
-- and the old body simply skipped the write, leaving the live task in place.
-- Restoring "no task" has to remove the row, or the student runtime keeps
-- serving a prompt the restored version does not have.

CREATE OR REPLACE FUNCTION public.restore_lesson_version(_lesson_id bigint, _version_number integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _snap JSONB;
  _ai_task JSONB;
BEGIN
  -- Auth check: caller must be the course author
  IF NOT EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.course_id = l.course_id
    WHERE l.id = _lesson_id AND c.author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to restore this lesson';
  END IF;

  -- Fetch snapshot
  SELECT snapshot INTO _snap
  FROM content_versions
  WHERE content_type = 'lesson' AND content_id = _lesson_id AND version_number = _version_number;

  IF _snap IS NULL THEN
    RAISE EXCEPTION 'Version not found';
  END IF;

  -- Update lesson (triggers snapshot of current state)
  UPDATE lessons SET
    title = _snap->>'title',
    content = _snap->>'content',
    description = _snap->>'description',
    summary = _snap->>'summary',
    video_url = _snap->>'video_url',
    embed_code = _snap->>'embed_code',
    status = (_snap->>'status')::status,
    image = _snap->>'image',
    ai_task_description = _snap->>'ai_task_description',
    ai_task_instructions = _snap->>'ai_task_instructions',
    updated_at = NOW()
  WHERE id = _lesson_id;

  _ai_task := _snap->'ai_task';
  IF _ai_task IS NOT NULL AND _ai_task != 'null'::jsonb THEN
    INSERT INTO lessons_ai_tasks (lesson_id, system_prompt, task_instructions)
    VALUES (
      _lesson_id,
      _ai_task->>'system_prompt',
      _ai_task->>'task_instructions'
    )
    ON CONFLICT (lesson_id) DO UPDATE SET
      system_prompt = EXCLUDED.system_prompt,
      task_instructions = EXCLUDED.task_instructions;
  ELSIF _snap ? 'ai_task' THEN
    -- The snapshot knows about the task and records that there was none.
    DELETE FROM lessons_ai_tasks WHERE lesson_id = _lesson_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_exam_version(_exam_id integer, _version_number integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Fetch snapshot
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

  -- Delete existing questions (cascades to options)
  DELETE FROM exam_questions WHERE exam_id = _exam_id;

  -- Re-insert questions and options from snapshot
  FOR _q IN SELECT * FROM jsonb_array_elements(_snap->'questions')
  LOOP
    INSERT INTO exam_questions (exam_id, question_text, question_type, ai_grading_criteria, expected_keywords, max_length)
    VALUES (
      _exam_id,
      _q->>'question_text',
      (_q->>'question_type')::varchar,
      _q->>'ai_grading_criteria',
      CASE WHEN _q->'expected_keywords' IS NOT NULL AND _q->'expected_keywords' != 'null'::jsonb
        THEN ARRAY(SELECT jsonb_array_elements_text(_q->'expected_keywords'))
        ELSE NULL
      END,
      (_q->>'max_length')::integer
    )
    RETURNING question_id INTO _new_qid;

    -- Insert options for this question
    FOR _o IN SELECT * FROM jsonb_array_elements(_q->'options')
    LOOP
      INSERT INTO question_options (question_id, option_text, is_correct)
      VALUES (
        _new_qid,
        _o->>'option_text',
        (_o->>'is_correct')::boolean
      );
    END LOOP;
  END LOOP;
END;
$function$;
