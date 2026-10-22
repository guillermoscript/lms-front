-- Access-grant hardening (audit 2026-10-22).
-- Course access may only be created by: the transaction trigger (server-written
-- 'successful' rows), grant_free_*/self_enroll_* RPCs (they validate the caller),
-- or service-role code. None of those need these functions open to clients.

-- 1. enroll_user / handle_new_subscription are SECURITY DEFINER with no caller,
--    tenant or payment check. They were executable by anon/authenticated:
--    rpc('enroll_user', { _user_id, _product_id }) granted any product's courses.
REVOKE ALL ON FUNCTION public.enroll_user(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_user(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_subscription(uuid, integer, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_subscription(uuid, integer, integer, timestamptz)
  TO service_role;

-- The transaction trigger is the legitimate caller and fires as whoever wrote the
-- row (a staff session approving a payment is not service_role). Run it as its
-- owner so the revokes above never break a purchase.
ALTER FUNCTION public.trigger_manage_transactions() SECURITY DEFINER;
ALTER FUNCTION public.trigger_manage_transactions() SET search_path = '';
REVOKE ALL ON FUNCTION public.trigger_manage_transactions() FROM PUBLIC, anon, authenticated;

-- 2. A student could INSERT their own 'active' subscription (any plan, any end
--    date) and then call self_enroll_subscription_course. Subscriptions are
--    written only by server code and SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Users can create own subscriptions" ON public.subscriptions;

-- 3. Defence in depth: RLS already blocks client writes to entitlements, so the
--    table grants must not be the only thing standing in the way.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.entitlements FROM anon, authenticated;
REVOKE ALL ON public.payment_requests FROM anon;

-- 4. Reads that ignored the access gate.
-- lessons_ai_tasks (system prompts) and lessons_ai_task_messages (every student's
-- chat) had USING (true) for role public: anon, any tenant.
DROP POLICY IF EXISTS "Enable read access for all users" ON public.lessons_ai_tasks;
DROP POLICY IF EXISTS "Public read access for tasks" ON public.lessons_ai_tasks;
CREATE POLICY lessons_ai_tasks_select ON public.lessons_ai_tasks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = lessons_ai_tasks.lesson_id
      AND (public.is_staff_of(l.tenant_id)
           OR public.has_course_access((SELECT auth.uid()), l.course_id::integer))
  ));

DROP POLICY IF EXISTS "Enable read access for all users" ON public.lessons_ai_task_messages;

DROP POLICY IF EXISTS "Authenticated users can view exercise files" ON public.exercise_files;
CREATE POLICY exercise_files_select ON public.exercise_files
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exercises x
    WHERE x.id = exercise_files.exercise_id
      AND (public.is_staff_of(x.tenant_id)
           OR public.has_course_access((SELECT auth.uid()), x.course_id::integer))
  ));
