-- Add constraint to prevent both fields from being null
-- Standardize on 'task_instructions' (student-facing) and 'system_prompt' (AI instructions)

ALTER TABLE lessons_ai_tasks
  ADD CONSTRAINT lessons_ai_tasks_lesson_id_key UNIQUE (lesson_id);

ALTER TABLE lessons_ai_tasks
  DROP CONSTRAINT IF EXISTS check_has_task_data;

ALTER TABLE lessons_ai_tasks
  ADD CONSTRAINT check_has_task_data
  CHECK (task_instructions IS NOT NULL OR system_prompt IS NOT NULL);
