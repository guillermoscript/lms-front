-- Add AI task fields to lessons table
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS ai_task_description TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS ai_task_instructions TEXT;
