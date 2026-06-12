-- Tighten three RLS surfaces found in the post-#327 same-class audit.
--
-- 1) exercise_evaluations.students_own_evaluations was FOR ALL, so a student could
--    UPDATE/DELETE their own AI evaluation rows via direct PostgREST (set passed=true,
--    raise score, or delete failed attempts — which also skews the attempt_number
--    trigger and the artifact-route 1-hour rate-limit that count these rows).
--    Students need SELECT (exercise history page) and INSERT (lib/ai/tools.ts
--    markExerciseCompleted inserts under the student's RLS-scoped client — the
--    earlier migration comment claiming all writes use the admin client was wrong
--    for that path; artifact/evaluate and media/analyze do use the admin client).
--    The INSERT with check now also pins tenant_id to a tenant the student actually
--    belongs to, closing a spoofed-tenant_id insert that would pollute another
--    tenant's teacher view.
--
-- 2) exercise_media_submissions.students_own_media_submissions was FOR ALL too.
--    Every write path (upload-url INSERT, analyze UPDATEs) uses the service-role
--    admin client, so students only need SELECT.
--
-- 3) landing_pages "Tenant admins can manage landing pages" (20260308210000) had
--    no role predicate despite the name — any tenant member (students included)
--    could INSERT/UPDATE/DELETE their school's landing pages. The tenant_id JWT
--    claim is not client-settable, so this was intra-tenant privilege escalation,
--    not a cross-tenant leak. Scope it to active admins via tenant_users.

-- 1) exercise_evaluations -----------------------------------------------------

drop policy if exists students_own_evaluations on public.exercise_evaluations;

create policy students_read_own_evaluations on public.exercise_evaluations
  for select
  using ( user_id = (select auth.uid()) );

create policy students_insert_own_evaluations on public.exercise_evaluations
  for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.tenant_users tu
      where tu.user_id = (select auth.uid())
        and tu.tenant_id = exercise_evaluations.tenant_id
        and tu.status = 'active'
    )
  );

-- Pin the trigger function's search path (Supabase advisor: mutable search_path).
alter function public.set_exercise_evaluation_attempt_number() set search_path = '';

-- 2) exercise_media_submissions ----------------------------------------------

drop policy if exists "students_own_media_submissions" on public.exercise_media_submissions;

create policy "students_read_own_media_submissions" on public.exercise_media_submissions
  for select
  using ( user_id = (select auth.uid()) );

-- 3) landing_pages -------------------------------------------------------------

drop policy if exists "Tenant admins can manage landing pages" on public.landing_pages;

create policy "Tenant admins can manage landing pages" on public.landing_pages
  for all
  using (
    exists (
      select 1
      from public.tenant_users tu
      where tu.user_id = (select auth.uid())
        and tu.tenant_id = landing_pages.tenant_id
        and tu.role = 'admin'
        and tu.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.tenant_users tu
      where tu.user_id = (select auth.uid())
        and tu.tenant_id = landing_pages.tenant_id
        and tu.role = 'admin'
        and tu.status = 'active'
    )
  );
