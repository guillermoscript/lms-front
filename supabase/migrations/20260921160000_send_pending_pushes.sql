-- Issue #835: push notifications are actually sent.
--
-- `supabase/functions/send-push` held the Expo send logic, but nothing ever
-- invoked it, so every `user_notifications` row stayed `push_sent = false` and
-- no push ever reached a device. Notifications are written from server
-- actions, crons and SQL triggers alike, so calling a sender from each writer
-- would always miss some. Instead `/api/cron/send-pushes` sweeps pending rows
-- every minute (pg_cron → invoke_cron_route(), #660) and sends each one once.
--
-- 1. Backfill: every existing row is marked sent, so the first sweep does not
--    push the whole history. `push_sent_at` stays NULL — nothing was pushed.
-- 2. A partial index keeps the sweep a scan of the (small) pending set.
-- 3. claim_pending_pushes() claims rows atomically and hands back, per
--    notification, the device tokens to push to.
-- 4. Schedule, plus a daily prune of this route's cron_runs rows.

-- ---------------------------------------------------------------------------
-- 1. Backfill
-- ---------------------------------------------------------------------------
UPDATE public.user_notifications
   SET push_sent = true
 WHERE push_sent IS DISTINCT FROM true;

-- ---------------------------------------------------------------------------
-- 2. Index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_notifications_push_pending
  ON public.user_notifications (notification_id, created_at)
  WHERE push_sent = false;

-- ---------------------------------------------------------------------------
-- 3. Claim
-- ---------------------------------------------------------------------------
-- Claiming IS marking sent: rows are flipped to push_sent = true in the same
-- statement that picks them (FOR UPDATE SKIP LOCKED + re-checked predicate), so
-- two overlapping runs can never both claim a row, and a claimed row is never
-- re-scanned whatever happens to the send afterwards (at-most-once, the same
-- guarantee the edge function gave). Rows for users who opted out
-- (`notification_preferences.push_enabled = false`) or have no device are
-- claimed too — they just contribute no token.
--
-- Rows older than `_max_age` are never pushed: they are marked sent with
-- `push_sent_at` left NULL, so a stuck backlog (a scheduler that was down for a
-- week) cannot flood devices with stale news when it comes back.
--
-- One row per notification, never one per recipient, so the result stays far
-- below PostgREST's row cap however many students an announcement reached.
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
  'Issue #835: atomically claims pending user_notifications (marks them push_sent) for up to _max_notifications notifications and returns each with the device tokens of its non-opted-out recipients. Rows older than _max_age are marked sent without a push. service_role only.';

-- ---------------------------------------------------------------------------
-- 4. Schedule
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'send-pushes-every-minute',
      '* * * * *',
      $cron$SELECT public.invoke_cron_route('send-pushes')$cron$
    );
    -- A run a minute is ~1,440 cron_runs rows a day. Keep a week of them;
    -- other routes' rows are left alone (billing-health reads them).
    PERFORM cron.schedule(
      'prune-send-pushes-cron-runs',
      '30 4 * * *',
      $cron$DELETE FROM public.cron_runs WHERE route = 'send-pushes' AND requested_at < now() - interval '7 days'$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed; send-pushes has no scheduler';
  END IF;
END $$;
