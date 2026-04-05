-- =============================================================================
-- Fix notifications and subscriptions profile FK hints
--
-- notifications.created_by and subscriptions.user_id have FKs to auth.users,
-- but the code joins with profiles using those FK names as hints.
-- PostgREST can't resolve the join → PGRST200 error.
--
-- Fix: Add FKs to profiles.id (same UUID as auth.users.id).
-- =============================================================================

-- notifications.created_by → profiles.id
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_created_by_profile_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);

-- subscriptions.user_id → profiles.id
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_profile_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);
