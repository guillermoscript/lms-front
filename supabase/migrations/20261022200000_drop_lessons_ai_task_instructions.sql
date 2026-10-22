-- Drop the legacy lessons.ai_task_instructions column.
--
-- The teacher's private AI-tutor prompt lives in lessons_ai_tasks.system_prompt
-- (hidden from students by 20261022170000). The legacy lessons column was still
-- readable by any entitled student through `select *` on lessons, and a version
-- restore kept writing to it. Breaking cleanup, approved: drop the column.
--
-- Deploy order: nothing in the app reads or writes the column any more, so
-- migrate before or after the code; only a stale client that still names it in
-- a select would error ("column does not exist").

-- 1. Keep any prompt that only exists in the legacy column. Never overwrite an
--    existing non-empty lessons_ai_tasks.system_prompt.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons'
      AND column_name = 'ai_task_instructions'
  ) THEN
    UPDATE public.lessons_ai_tasks t
       SET system_prompt = l.ai_task_instructions
      FROM public.lessons l
     WHERE t.lesson_id = l.id
       AND btrim(coalesce(l.ai_task_instructions, '')) <> ''
       AND btrim(coalesce(t.system_prompt, '')) = '';

    INSERT INTO public.lessons_ai_tasks (lesson_id, system_prompt)
    SELECT l.id, l.ai_task_instructions
      FROM public.lessons l
     WHERE btrim(coalesce(l.ai_task_instructions, '')) <> ''
       AND NOT EXISTS (SELECT 1 FROM public.lessons_ai_tasks t WHERE t.lesson_id = l.id);
  END IF;
END $$;

-- 2. Functions that referenced the column (latest definitions: 20260302180000
--    snapshot trigger, 20260729120000 restore), minus the column.
CREATE OR REPLACE FUNCTION public.snapshot_lesson_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _snapshot JSONB;
  _ai_task JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', lat.id,
    'system_prompt', lat.system_prompt,
    'task_instructions', lat.task_instructions
  ) INTO _ai_task
  FROM lessons_ai_tasks lat
  WHERE lat.lesson_id = OLD.id;

  _snapshot := jsonb_build_object(
    'id', OLD.id,
    'course_id', OLD.course_id,
    'sequence', OLD.sequence,
    'title', OLD.title,
    'content', OLD.content,
    'description', OLD.description,
    'summary', OLD.summary,
    'video_url', OLD.video_url,
    'embed_code', OLD.embed_code,
    'status', OLD.status,
    'image', OLD.image,
    'ai_task_description', OLD.ai_task_description,
    'ai_task', _ai_task,
    'updated_at', OLD.updated_at
  );

  INSERT INTO content_versions (content_type, content_id, version_number, snapshot, changed_by)
  VALUES ('lesson', OLD.id, next_version_number('lesson', OLD.id), _snapshot, auth.uid());

  RETURN NEW;
END;
$$;

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

-- 3. Strip the dead key from stored lesson snapshots (history stays readable;
--    the live prompt is in each snapshot's `ai_task`).
UPDATE public.content_versions
   SET snapshot = snapshot - 'ai_task_instructions'
 WHERE content_type = 'lesson' AND snapshot ? 'ai_task_instructions';

-- 4. Drop the column (no views/other objects depend on it).
ALTER TABLE public.lessons DROP COLUMN IF EXISTS ai_task_instructions;
