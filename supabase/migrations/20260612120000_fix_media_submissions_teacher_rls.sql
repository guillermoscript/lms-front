-- Fix cross-tenant leak in exercise_media_submissions RLS.
--
-- The original policies (migration 20260302200000_add_voice_exercises.sql) scoped tenant via
-- the `x-tenant-id` request header:
--
--   teachers_view_tenant_media_submissions  USING ( tenant_id = header('x-tenant-id') )
--
-- That header is client-settable on a direct PostgREST call, and the teacher policy had no
-- user/role predicate. SELECT policies are OR'd, so ANY authenticated user could read every
-- row of an arbitrary tenant by sending `x-tenant-id: <victim-tenant-uuid>`. The student
-- policy was safe (bound by `user_id = auth.uid()`), but it also relied on the spoofable
-- header for its tenant clause.
--
-- Fix: derive tenant scope from authoritative `tenant_users` membership (bound to auth.uid()),
-- never the header. Server-side writes still use the service-role admin client (bypass RLS).

drop policy if exists "students_own_media_submissions" on public.exercise_media_submissions;
drop policy if exists "teachers_view_tenant_media_submissions" on public.exercise_media_submissions;

-- Students: own rows only. user_id is globally unique and bound to the JWT.
create policy "students_own_media_submissions" on public.exercise_media_submissions
  for all
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

-- Teachers/admins: rows in tenants where they hold an active teacher/admin membership.
create policy "teachers_view_tenant_media_submissions" on public.exercise_media_submissions
  for select
  using (
    exists (
      select 1
      from public.tenant_users tu
      where tu.user_id = (select auth.uid())
        and tu.tenant_id = exercise_media_submissions.tenant_id
        and tu.role in ('teacher', 'admin')
        and tu.status = 'active'
    )
  );
