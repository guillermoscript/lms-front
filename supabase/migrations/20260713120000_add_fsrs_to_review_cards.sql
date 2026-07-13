-- FSRS scheduler state for review_cards (Epic #388, issue #389).
-- Additive only: SM-2 columns (ease) are kept during the transition; existing
-- columns are reused as FSRS fields (due_at = due, repetitions = reps,
-- interval_days = scheduled_days, last_reviewed_at = last_review).
-- fsrs_state mirrors the ts-fsrs State enum: 0 New, 1 Learning, 2 Review, 3 Relearning.

alter table public.review_cards
  add column if not exists stability      double precision,
  add column if not exists difficulty     double precision,
  add column if not exists fsrs_state     smallint not null default 0
    check (fsrs_state between 0 and 3),
  add column if not exists lapses         integer not null default 0,
  add column if not exists learning_steps integer not null default 0,
  add column if not exists elapsed_days   double precision not null default 0;

comment on column public.review_cards.fsrs_state is
  'ts-fsrs State enum: 0 New, 1 Learning, 2 Review, 3 Relearning';
comment on column public.review_cards.ease is
  'Legacy SM-2 ease factor; unused since the FSRS migration, kept for rollback';

-- Seed FSRS state for cards that already have SM-2 history. No per-review log
-- exists to fit from, so this is a documented approximation (stability ~= the
-- current interval; difficulty mapped linearly from ease 1.3..3.7 -> 10..1);
-- FSRS self-corrects on subsequent reviews. Never-reviewed cards stay New.
update public.review_cards
set fsrs_state = 2, -- Review
    stability  = greatest(interval_days, 0.1),
    difficulty = least(10, greatest(1, 10 - (ease - 1.3) * 3.75))
where repetitions > 0
  and stability is null;
