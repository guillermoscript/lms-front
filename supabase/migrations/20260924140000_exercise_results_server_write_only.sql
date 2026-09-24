-- Issue #843: a student can no longer grade their own exercises.
--
-- `exercise_completions` had "Students can manage own exercise completions"
-- (FOR ALL … WITH CHECK auth.uid() = user_id), so any student could INSERT a
-- completion with any score for any exercise straight from supabase-js. The
-- AFTER INSERT trigger then awarded the XP and the row counted toward
-- certificates. The web code challenge relied on the hole: "Run & Verify"
-- waited two seconds and wrote score = 100 from the browser.
--
-- `exercise_evaluations` had the same hole one table over:
-- `students_insert_own_evaluations` let a student insert `passed = true`, and
-- the lesson-checkpoint "external" sync trusts the newest evaluation.
--
-- Both tables are now server-write-only, like `transactions` (#538). Every
-- writer runs on the server with the service-role client:
--   * POST /api/exercises/evaluate          text + code (web, native, MCP)
--   * POST /api/exercises/artifact/evaluate artifact
--   * POST /api/exercises/media/analyze     audio / video
--   * POST /api/exercises/realtime/evaluate real-time conversation
--   * POST /api/chat/exercises/student      the in-app tutor's markExerciseCompleted
--   * POST /api/lesson-checkpoints/…/attempt
-- Students and staff keep their SELECT policies.
--
-- `exercise_completions` also never had a unique key, although three routes
-- assumed one: a second passing attempt inserted a second row and a second
-- +50 XP. Duplicates are folded into the earliest row (keeping the best
-- score), and (exercise_id, user_id) is now unique so writers can insert
-- ON CONFLICT DO NOTHING. Deleting a duplicate does not touch XP: the only
-- trigger on the table is AFTER INSERT.

-- 1) exercise_completions: read-only for clients ------------------------------

DROP POLICY IF EXISTS "Students can manage own exercise completions" ON public.exercise_completions;

CREATE POLICY "Students can view own exercise completions"
  ON public.exercise_completions FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.exercise_completions FROM authenticated;

-- 2) exercise_evaluations: read-only for clients ------------------------------

DROP POLICY IF EXISTS students_insert_own_evaluations ON public.exercise_evaluations;
DROP POLICY IF EXISTS students_own_evaluations ON public.exercise_evaluations;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.exercise_evaluations FROM authenticated, anon;

-- 3) one completion per student per exercise ---------------------------------

CREATE TEMP TABLE _exercise_completion_keep ON COMMIT DROP AS
SELECT DISTINCT ON (exercise_id, user_id)
       id AS keep_id,
       exercise_id,
       user_id,
       max(score) OVER (PARTITION BY exercise_id, user_id) AS best_score
FROM public.exercise_completions
ORDER BY exercise_id, user_id, completed_at ASC NULLS LAST, id ASC;

UPDATE public.exercise_completions c
SET score = k.best_score
FROM _exercise_completion_keep k
WHERE c.id = k.keep_id
  AND c.score IS DISTINCT FROM k.best_score;

DELETE FROM public.exercise_completions c
USING _exercise_completion_keep k
WHERE c.exercise_id = k.exercise_id
  AND c.user_id = k.user_id
  AND c.id <> k.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS exercise_completions_exercise_user_key
  ON public.exercise_completions (exercise_id, user_id);
