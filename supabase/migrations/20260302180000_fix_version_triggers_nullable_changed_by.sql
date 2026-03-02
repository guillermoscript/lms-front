-- Fix content_versions triggers to work with service role (MCP server)
-- auth.uid() returns NULL when using service role key, causing NOT NULL violation.

-- 1. Make changed_by nullable
ALTER TABLE public.content_versions ALTER COLUMN changed_by DROP NOT NULL;

-- 2. Update lesson trigger
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
    'ai_task_instructions', OLD.ai_task_instructions,
    'ai_task', _ai_task,
    'updated_at', OLD.updated_at
  );

  INSERT INTO content_versions (content_type, content_id, version_number, snapshot, changed_by)
  VALUES ('lesson', OLD.id, next_version_number('lesson', OLD.id), _snapshot, auth.uid());

  RETURN NEW;
END;
$$;

-- 3. Update exam trigger
CREATE OR REPLACE FUNCTION public.snapshot_exam_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      'ai_grading_criteria', eq.ai_grading_criteria,
      'expected_keywords', eq.expected_keywords,
      'max_length', eq.max_length,
      'options', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'option_id', qo.option_id,
            'option_text', qo.option_text,
            'is_correct', qo.is_correct
          ) ORDER BY qo.option_id
        ), '[]'::jsonb)
        FROM question_options qo
        WHERE qo.question_id = eq.question_id
      )
    ) ORDER BY eq.question_id
  ), '[]'::jsonb) INTO _questions
  FROM exam_questions eq
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

-- 4. Update exercise trigger
CREATE OR REPLACE FUNCTION public.snapshot_exercise_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _snapshot JSONB;
BEGIN
  _snapshot := jsonb_build_object(
    'id', OLD.id,
    'course_id', OLD.course_id,
    'lesson_id', OLD.lesson_id,
    'title', OLD.title,
    'description', OLD.description,
    'instructions', OLD.instructions,
    'system_prompt', OLD.system_prompt,
    'exercise_type', OLD.exercise_type,
    'difficulty_level', OLD.difficulty_level,
    'time_limit', OLD.time_limit,
    'active_file', OLD.active_file,
    'visible_files', OLD.visible_files,
    'template_id', OLD.template_id,
    'template_variables', OLD.template_variables,
    'status', OLD.status,
    'updated_at', OLD.updated_at
  );

  INSERT INTO content_versions (content_type, content_id, version_number, snapshot, changed_by)
  VALUES ('exercise', OLD.id, next_version_number('exercise', OLD.id), _snapshot, auth.uid());

  RETURN NEW;
END;
$$;

-- 5. Update prompt template trigger
CREATE OR REPLACE FUNCTION public.snapshot_prompt_template_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _snapshot JSONB;
BEGIN
  _snapshot := jsonb_build_object(
    'id', OLD.id,
    'name', OLD.name,
    'category', OLD.category,
    'description', OLD.description,
    'task_description_template', OLD.task_description_template,
    'system_prompt_template', OLD.system_prompt_template,
    'variables', OLD.variables,
    'is_system', OLD.is_system,
    'updated_at', OLD.updated_at
  );

  INSERT INTO content_versions (content_type, content_id, version_number, snapshot, changed_by)
  VALUES ('prompt_template', OLD.id, next_version_number('prompt_template', OLD.id), _snapshot, auth.uid());

  RETURN NEW;
END;
$$;

-- 6. Update RLS policy to allow NULL changed_by (service role inserts)
DROP POLICY IF EXISTS "Insert own versions" ON public.content_versions;
CREATE POLICY "Insert own versions"
  ON public.content_versions FOR INSERT
  WITH CHECK (changed_by = auth.uid() OR changed_by IS NULL);
