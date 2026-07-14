-- #393 mastery-gated interleaving: distinguish mixed (interleaved) practice
-- rows from focused single-topic rows. Mixed sessions are split into one row
-- per topic at record time, so per-topic aggregation (weak spots, exam
-- readiness) keeps working unchanged; `mode` marks rows that came from a
-- mixed session for analytics and first-mixed detection.
ALTER TABLE public.practice_attempts
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'focused'
    CHECK (mode IN ('focused', 'mixed'));

COMMENT ON COLUMN public.practice_attempts.mode IS
  'How the attempt was practiced: focused (single-topic session) or mixed (interleaved session split into per-topic rows).';
