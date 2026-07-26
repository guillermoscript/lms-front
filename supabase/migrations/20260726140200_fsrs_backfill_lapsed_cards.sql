-- =============================================================================
-- FSRS backfill: seed the cards the first pass skipped
-- Issue #549 §4 (epic #540). Completes 20260713120000_add_fsrs_to_review_cards.
--
-- The original seed ran `where repetitions > 0 and stability is null`. But the
-- SM-2 implementation it replaced reset repetitions to 0 on a lapse:
--
--   case "again": { interval_days: 0, repetitions: 0, ease: ease - 0.2 }
--
-- so `repetitions > 0` selects exactly the cards that were NOT struggling and
-- skips every card whose most recent rating was "Again" — the ones carrying the
-- lowest ease and the highest FSRS difficulty. cardFromRow() then returns
-- createEmptyCard() for each of them: lapses reset to 0, difficulty reset to the
-- default prior, review history discarded. The original comment claimed
-- "Never-reviewed cards stay New"; lapsed cards had silently joined them.
--
-- Widened to `repetitions > 0 OR last_reviewed_at IS NOT NULL`. The
-- `stability is null` guard is what keeps this re-runnable and is why rows the
-- first pass already seeded are left completely alone.
--
-- Two refinements beyond a straight predicate widening, both documented
-- approximations in the same spirit as the original seed (FSRS self-corrects on
-- subsequent reviews):
--   * lapsed cards land in state 3 (Relearning), not 2 (Review) — that is what
--     a card whose last rating was "Again" actually is;
--   * they get lapses = 1, since a reset repetitions count is direct evidence
--     of at least one lapse and 0 would understate difficulty to the scheduler.
--
-- `ease` is the retained SM-2 column the 20260713120000 comment kept precisely
-- for this; difficulty uses the same linear map (ease 1.3..3.7 -> 10..1).
-- =============================================================================

UPDATE public.review_cards
SET fsrs_state = CASE WHEN repetitions > 0 THEN 2 ELSE 3 END,
    stability  = GREATEST(interval_days, 0.1),
    difficulty = LEAST(10, GREATEST(1, 10 - (ease - 1.3) * 3.75)),
    lapses     = CASE WHEN repetitions > 0 THEN lapses ELSE GREATEST(lapses, 1) END
WHERE (repetitions > 0 OR last_reviewed_at IS NOT NULL)
  AND stability IS NULL;

COMMENT ON COLUMN public.review_cards.stability IS
  'FSRS stability. Seeded from SM-2 interval_days for pre-migration cards, '
  'including lapsed ones (repetitions = 0 with a last_reviewed_at) — see '
  'issue #549 for why the first backfill missed those.';
