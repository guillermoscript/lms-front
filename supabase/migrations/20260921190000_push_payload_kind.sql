-- Issue #825: a push carries the notification's `kind`.
--
-- `url` is an APP route ("/course/12") and most notifications have none. The
-- daily digest and the streak nudge store `action_url`, an absolute web link a
-- native router cannot open — so `metadata.kind` travels with the push and the
-- app decides where a tap on each kind lands. PR #826 did this in the old
-- send-push edge function, which #835 replaced with claim_pending_pushes();
-- the column is added here instead. The return type changes, so drop + create.

DROP FUNCTION IF EXISTS public.claim_pending_pushes(integer, interval);

CREATE OR REPLACE FUNCTION public.claim_pending_pushes(
  _max_notifications integer DEFAULT 25,
  _max_age interval DEFAULT interval '1 day'
)
RETURNS TABLE (
  notification_id bigint,
  title text,
  content text,
  priority text,
  url text,
  kind text,
  recipients integer,
  tokens text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  UPDATE public.user_notifications un
     SET push_sent = true
   WHERE un.push_sent = false
     AND un.created_at < now() - _max_age;

  RETURN QUERY
  WITH picked AS (
    SELECT p.notification_id
      FROM public.user_notifications p
     WHERE p.push_sent = false
     GROUP BY p.notification_id
     ORDER BY min(p.created_at), p.notification_id
     LIMIT greatest(_max_notifications, 0)
  ),
  claimed AS (
    UPDATE public.user_notifications un
       SET push_sent = true,
           push_sent_at = now()
     WHERE un.id IN (
             SELECT c.id
               FROM public.user_notifications c
              WHERE c.push_sent = false
                AND c.notification_id IN (SELECT picked.notification_id FROM picked)
                FOR UPDATE SKIP LOCKED
           )
       AND un.push_sent = false
    RETURNING un.notification_id, un.user_id
  )
  SELECT n.id,
         n.title,
         n.content,
         n.priority,
         n.metadata ->> 'url',
         n.metadata ->> 'kind',
         count(DISTINCT cl.user_id)::integer,
         coalesce(
           array_agg(DISTINCT t.token) FILTER (WHERE t.token IS NOT NULL),
           ARRAY[]::text[]
         )
    FROM claimed cl
    JOIN public.notifications n ON n.id = cl.notification_id
    LEFT JOIN public.notification_preferences np
           ON np.user_id = cl.user_id
    LEFT JOIN public.device_push_tokens t
           ON t.user_id = cl.user_id
          AND np.push_enabled IS DISTINCT FROM false
   GROUP BY n.id, n.title, n.content, n.priority, n.metadata;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_pushes(integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_pushes(integer, interval) TO service_role;

COMMENT ON FUNCTION public.claim_pending_pushes(integer, interval) IS
  'Issue #835: atomically claims pending user_notifications (marks them push_sent) for up to _max_notifications notifications and returns each (with metadata url and kind) and the device tokens of its non-opted-out recipients. Rows older than _max_age are marked sent without a push. service_role only.';
