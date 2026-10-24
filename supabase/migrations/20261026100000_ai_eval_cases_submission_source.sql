-- F5: a case saved from a teacher-reviewed student submission.
-- The expected result is the teacher's own grade, so it counts as verified;
-- the source only records where the answers came from.

ALTER TABLE public.ai_eval_cases DROP CONSTRAINT ai_eval_cases_source_check;
ALTER TABLE public.ai_eval_cases ADD CONSTRAINT ai_eval_cases_source_check
  CHECK (source IN ('preview', 'real_chat', 'generated', 'teacher', 'submission'));
