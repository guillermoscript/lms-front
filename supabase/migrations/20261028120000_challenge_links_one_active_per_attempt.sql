-- One ACTIVE link per owner attempt (#1030): a double click on "share" must not
-- create two links. Deactivated links are not counted, so re-sharing works.
CREATE UNIQUE INDEX IF NOT EXISTS challenge_links_active_attempt_uidx
  ON public.challenge_links (owner_attempt_id)
  WHERE active AND owner_attempt_id IS NOT NULL;
