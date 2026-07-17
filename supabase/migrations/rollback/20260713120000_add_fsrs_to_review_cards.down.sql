-- Rollback for 20260713120000_add_fsrs_to_review_cards.sql
-- SM-2 columns (ease, interval_days, repetitions, due_at, last_reviewed_at)
-- were never removed, so dropping the FSRS columns restores the old shape.

alter table public.review_cards
  drop column if exists stability,
  drop column if exists difficulty,
  drop column if exists fsrs_state,
  drop column if exists lapses,
  drop column if exists learning_steps,
  drop column if exists elapsed_days;

comment on column public.review_cards.ease is null;
