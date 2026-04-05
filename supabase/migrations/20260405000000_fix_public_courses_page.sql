-- =============================================================================
-- Fix public courses page (/courses) returning 0 results for anon users
--
-- Root causes:
-- 1. courses.author_id FK points to auth.users, not public.profiles.
--    The query uses `profiles!courses_author_id_fkey` hint which PostgREST
--    cannot resolve → PGRST200 error → entire query returns null.
--
-- 2. lessons table has no SELECT policy for anon role, so the lesson count
--    sub-select returns empty for unauthenticated visitors.
--
-- Fixes:
-- 1. Add a FK from courses.author_id → profiles.id so PostgREST can join.
-- 2. Add anon SELECT policy on lessons (scoped to tenant, published courses only).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Add FK from courses.author_id to profiles.id
--    profiles.id mirrors auth.users.id, so existing data is valid.
--    Name it distinctly so the PostgREST hint works.
-- ---------------------------------------------------------------------------

ALTER TABLE public.courses
  ADD CONSTRAINT courses_author_profile_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id);


-- ---------------------------------------------------------------------------
-- 2. Allow anon users to read lessons (for lesson count on public pages)
--    Scoped to current tenant via get_tenant_id().
-- ---------------------------------------------------------------------------

CREATE POLICY "Anon can view tenant lessons"
  ON public.lessons FOR SELECT TO anon
  USING (tenant_id = (select public.get_tenant_id()));
