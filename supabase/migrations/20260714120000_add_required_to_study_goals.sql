-- #391: mandatory retrieval practice in weekly study plans.
-- Additive flag; retrieval-practice goals (kind 'practice'/'review') are
-- inserted with required = true by default at the application layer, and the
-- study-plan widget gates week completion on required goals being done.
alter table public.study_goals
  add column required boolean not null default false;
