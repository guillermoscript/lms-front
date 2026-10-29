-- One ACTIVE open link (no owner attempt) per exercise + creator (#1043): the
-- MCP/AI tool is idempotent, and two concurrent calls must not create two links.
-- The 23505 recovery path in lib/challenges/links.ts returns the existing one.
CREATE UNIQUE INDEX IF NOT EXISTS challenge_links_active_open_uidx
  ON public.challenge_links (exercise_id, created_by)
  WHERE active AND owner_attempt_id IS NULL AND created_by IS NOT NULL;
