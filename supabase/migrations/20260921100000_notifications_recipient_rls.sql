-- A notification is readable by whoever it was sent to, and by the school's
-- staff — not by every member of the school (#827).
--
-- "Users can view tenant notifications" was `tenant_id = get_tenant_id()`:
-- nothing about who the row is FOR. Any member's token could read every
-- notification in the school directly, including `target_type = 'user'` rows —
-- the daily digest and the streak nudge (first name, streak, due cards, pending
-- goals), payment-request and plan-change notices. The web never showed them,
-- because it lists through the caller's own `user_notifications` rows; the
-- table itself was open.
--
-- Being a recipient IS having a `user_notifications` row: every sender fans out
-- one per user, and that is what the web and the push function both read.
--
-- The recipient test goes through a SECURITY DEFINER function, not an inline
-- EXISTS: `user_notifications` already has an admin policy that reads
-- `notifications`, so a policy here that reads `user_notifications` under RLS
-- would recurse (42P17).

CREATE OR REPLACE FUNCTION public.is_notification_recipient(_notification_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_notifications un
    WHERE un.notification_id = _notification_id
      AND un.user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_notification_recipient(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_notification_recipient(bigint) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can view tenant notifications" ON public.notifications;

CREATE POLICY "Recipients can view their notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.get_tenant_id())
    AND public.is_notification_recipient(id)
  );

-- Same audience the UPDATE policy already trusts with the school's rows.
CREATE POLICY "Staff can view tenant notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.get_tenant_id())
    AND (SELECT public.get_tenant_role()) = ANY (ARRAY['admin'::text, 'teacher'::text])
  );
