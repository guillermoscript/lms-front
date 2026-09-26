-- #858 — a coding challenge restores the student's own code.
--
-- exercise_code_student_submissions only held `submission_code`: one file's
-- text, which is what the native app writes (the active file). The web editor
-- is a whole Sandpack project, so it also needs every file the student changed.
--
-- `files`       Record<path, code> of the files the student changed or added.
--               NULL on rows written by clients that only know one file.
-- `updated_at`  the web autosaves into one row; readers order by this, not
--               created_at, so the newest code wins whichever client wrote it.
--
-- No tenant_id, on purpose: rows are scoped through exercise_id and user_id,
-- same as before.

ALTER TABLE public.exercise_code_student_submissions
  ADD COLUMN IF NOT EXISTS files jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.exercise_code_student_submissions
  SET updated_at = COALESCE(created_at, now());

-- Students write this table directly (RLS: own rows), so bound what they store.
ALTER TABLE public.exercise_code_student_submissions
  ADD CONSTRAINT exercise_code_student_submissions_files_shape
    CHECK (files IS NULL OR (jsonb_typeof(files) = 'object' AND pg_column_size(files) <= 262144)),
  ADD CONSTRAINT exercise_code_student_submissions_code_size
    CHECK (length(submission_code) <= 262144);

DROP TRIGGER IF EXISTS update_exercise_code_student_submissions_updated_at
  ON public.exercise_code_student_submissions;
CREATE TRIGGER update_exercise_code_student_submissions_updated_at
  BEFORE UPDATE ON public.exercise_code_student_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS exercise_code_student_submissions_latest_idx
  ON public.exercise_code_student_submissions (exercise_id, user_id, updated_at DESC);
