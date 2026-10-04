-- Live voice conversation exercises (exercise_type = 'real_time_conversation').
--
-- A realtime session is opened by /api/exercises/realtime/token and closed by
-- /api/exercises/realtime/evaluate. Its record is an exercise_media_submissions
-- row — same lifecycle (pending → processing → completed/failed), same RLS,
-- same teacher view — with no stored media: the transcript lives in stt_result.
-- The daily cap counts these rows, so an ungraded session still spends an attempt.

alter table public.exercise_media_submissions
  drop constraint if exists exercise_media_submissions_media_type_check;

alter table public.exercise_media_submissions
  add constraint exercise_media_submissions_media_type_check
  check (media_type in ('audio', 'video', 'conversation'));

create index if not exists exercise_media_submissions_user_exercise_type_created
  on public.exercise_media_submissions (user_id, exercise_id, media_type, created_at desc);
