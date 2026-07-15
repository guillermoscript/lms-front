-- Checkpoint AI-evaluation quotas + attempt-policy tightening (issue #392).
--
-- 1. Numeric monthly allowances for checkpoint AI evaluations live in
--    platform_plans.limits so get_plan_features() exposes them without a new
--    accounting table; usage is counted from lesson_checkpoint_attempts
--    (evaluator_type = 'ai') at enforcement time.
-- 2. The student insert policy on lesson_checkpoint_attempts additionally
--    requires an active enrollment and an enabled checkpoint, matching the
--    read policy on lesson_checkpoints.

update public.platform_plans
set limits = limits || case slug
  when 'free'       then '{"checkpoint_ai_evals_per_month": 0,     "checkpoint_ai_evals_per_student_month": 0}'::jsonb
  when 'starter'    then '{"checkpoint_ai_evals_per_month": 0,     "checkpoint_ai_evals_per_student_month": 0}'::jsonb
  when 'pro'        then '{"checkpoint_ai_evals_per_month": 500,   "checkpoint_ai_evals_per_student_month": 50}'::jsonb
  when 'business'   then '{"checkpoint_ai_evals_per_month": 2000,  "checkpoint_ai_evals_per_student_month": 100}'::jsonb
  when 'enterprise' then '{"checkpoint_ai_evals_per_month": 10000, "checkpoint_ai_evals_per_student_month": 250}'::jsonb
  else '{}'::jsonb
end
where slug in ('free', 'starter', 'pro', 'business', 'enterprise');

drop policy if exists lesson_checkpoint_attempts_students_insert_own_rows
  on public.lesson_checkpoint_attempts;

create policy lesson_checkpoint_attempts_students_insert_own_rows
  on public.lesson_checkpoint_attempts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.lesson_checkpoints c
      where c.id = lesson_checkpoint_attempts.checkpoint_id
        and c.tenant_id = lesson_checkpoint_attempts.tenant_id
        and c.lesson_id = lesson_checkpoint_attempts.lesson_id
        and c.exercise_id = lesson_checkpoint_attempts.exercise_id
        and c.is_enabled
    )
    and exists (
      select 1 from public.enrollments e
      where e.user_id = (select auth.uid())
        and e.course_id = lesson_checkpoint_attempts.course_id
        and e.status = 'active'
    )
  );
