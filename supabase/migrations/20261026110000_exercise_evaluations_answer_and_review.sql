-- F5 (exercises): keep what the student submitted, and let a teacher regrade it.
--
-- submission_text / submission_metadata: the answer the AI graded (written and
-- code exercises, artifacts). Older rows stay NULL; nothing was stored before.
-- teacher_*: a teacher's override of that grade. The AI score in `score` is
-- kept as is, so the gap between the two is what a grading test checks.
--
-- Writes stay server-side (service role after a staff check); no UPDATE policy
-- is added. Students already read their own rows, which now includes the
-- teacher's grade and note on them.

ALTER TABLE public.exercise_evaluations
  ADD COLUMN submission_text text,
  ADD COLUMN submission_metadata jsonb,
  ADD COLUMN teacher_score numeric(5,2) CHECK (teacher_score IS NULL OR (teacher_score >= 0 AND teacher_score <= 100)),
  ADD COLUMN teacher_passed boolean,
  ADD COLUMN teacher_feedback text CHECK (teacher_feedback IS NULL OR char_length(teacher_feedback) <= 5000),
  ADD COLUMN teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz;

CREATE INDEX exercise_evaluations_exercise_recent_idx
  ON public.exercise_evaluations (tenant_id, exercise_id, created_at DESC);
