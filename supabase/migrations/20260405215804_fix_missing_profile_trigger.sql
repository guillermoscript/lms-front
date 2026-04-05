-- =============================================================================
-- Fix missing profile trigger + backfill profiles for existing users
--
-- Root cause of LMS-FRONT-7H ("Failed to create course"):
--   The `handle_new_user()` function exists but the trigger
--   `on_auth_user_created` was never created via migrations.
--   Combined with the new FK `courses_author_profile_fkey`
--   (courses.author_id → profiles.id), any user without a profile
--   row cannot create courses.
--
-- Fixes:
--   1. Backfill missing profiles for all auth.users
--   2. Create the trigger (idempotent) so new signups always get a profile
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Backfill: insert profiles for any auth.users that don't have one
-- ---------------------------------------------------------------------------

INSERT INTO public.profiles (id, full_name, avatar_url)
SELECT
  u.id,
  u.raw_user_meta_data->>'full_name',
  u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;


-- ---------------------------------------------------------------------------
-- 2. Ensure the trigger exists (DROP + CREATE for idempotency)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
