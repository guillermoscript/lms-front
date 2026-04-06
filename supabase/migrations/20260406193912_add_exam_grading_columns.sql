-- =============================================================================
-- Add missing columns to exam_questions for AI grading
--
-- The gradeExamWithAI server action selects points, correct_answer, and
-- grading_rubric but these columns don't exist yet. Without them the query
-- fails and AI grading silently returns "Exam not found".
-- =============================================================================

-- Points per question (default 10)
ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 10;

-- Correct answer text for true/false and free-text reference answers
ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS correct_answer TEXT;

-- Rubric for manual/AI grading of free-text questions
ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS grading_rubric TEXT;

-- Also add evaluated_at to exam_submissions if missing (used by save_exam_feedback RPC)
ALTER TABLE public.exam_submissions
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ;
