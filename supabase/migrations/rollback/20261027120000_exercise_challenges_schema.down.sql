-- Rollback for 20261027120000_exercise_challenges_schema.sql.
-- Destroys all challenge links and attempts.
DROP FUNCTION IF EXISTS public.get_challenge_ranking(bigint);
ALTER TABLE IF EXISTS public.challenge_links DROP CONSTRAINT IF EXISTS challenge_links_owner_attempt_fk;
DROP TABLE IF EXISTS public.challenge_attempts;
DROP TABLE IF EXISTS public.challenge_links;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS is_challengeable;
