-- Issue #870 (epic #867): the community tells people when something happens.
--
-- Nobody was told anything: a reply to my post, a reply to my comment, a
-- teacher's new discussion prompt in my course — no in-app notification, no
-- push, no email. People posted once and never came back.
--
-- This reuses the notification pipeline that already exists instead of adding
-- one: a `notifications` row + one `user_notifications` row per recipient, which
-- the web lists, the native app lists, pg_cron pushes every minute
-- (claim_pending_pushes, #835) and the daily digest summarises.
--
-- Decisions (docs/COMMUNITY_SPACES.md "Notifications (#870)" has the long form):
--
--   * ONE notification_type, 'community'; `metadata.kind` says which event:
--     community_reply | community_prompt | community_answer_accepted.
--     (community_mention is reserved for #876.) `community_post_id` links the
--     row to its post so hiding / deleting the post can retract it.
--
--   * Producers are AFTER triggers, not web actions: the web writes with the
--     service role, the native app and the MCP server write through RLS, and a
--     trigger is the one place all three pass. Every producer is SECURITY
--     DEFINER with `search_path = ''`, and its whole body is wrapped in an
--     EXCEPTION block that only raises a WARNING — a notification must never
--     be the reason a comment or a prompt fails to save. The actor is always
--     NEW.author_id, never auth.uid() (NULL on the service-role path).
--
--   * Replies are one row PER RECIPIENT (target_type 'user') and are BATCHED:
--     one unread reply notification per (recipient, post) whose count, title,
--     snippet and actor are updated in place ("(3) Post title"), and whose
--     user_notifications.created_at moves to the latest activity (except while
--     its push is still queued: created_at is the push queue's order). A push
--     is sent at most once per (recipient, post) every 15 minutes; replies in
--     between update the text of the one already queued or sent.
--
--   * Prompt pushes are rate-limited the same way per (student, course): a
--     teacher adding prompts to ten lessons in one sitting sends ten in-app
--     rows but one push every 15 minutes.
--
--   * A prompt is ONE shared row (target_type 'course') plus a set-based
--     fan-out: active students of the school with an ACTIVE ENROLLMENT in the
--     course (what the RLS course feed itself requires — it also spares plan
--     subscribers a notification for every course in the plan) who still have
--     access (has_course_access).
--
--   * created_by is NULL on every community row. "Teachers can view their
--     notifications" is `created_by = auth.uid()` with no tenant predicate, so
--     a replier recorded there could read the recipient's aggregated row. The
--     actor lives in metadata.actor_id / actor_name instead.
--
--   * Community rows are system-written: RESTRICTIVE policies stop every
--     client — staff included — from inserting or editing one. Only definer
--     code and the service role write them.
--
--   * Never notify: yourself; across a block (either direction); about a post
--     whose author the recipient blocked (RLS hides it from them); hidden
--     content (the comment, its post, the parent comment); a muted actor; a
--     recipient who left the school or lost access to the course; a school
--     whose plan has no community; a comment whose tenant differs from its
--     post's; a recipient who turned the category (or in-app) off.
--
--   * Retraction: hiding or deleting a post deletes every notification about
--     it; hiding or deleting a comment scrubs its text, author and snippet out
--     of the notification that names it and decrements the batch (or, when it
--     was the only reply or the accepted answer, also dismisses the row). No
--     removed words or deleted member's name stay readable by the recipient or
--     by the staff who can read the school's notifications. A new block
--     dismisses the blocker's community notifications from the blocked member
--     and about the blocked member's posts. Un-hiding restores nothing.
--
--   * No URL is stored. The web builds the link from the ids for the viewer's
--     role (lib/community/notifications.ts); the push carries the ids plus
--     tenant_id in its `data` so the app can do the same.
--
-- Deploy: apply to cloud BEFORE merging the web code — the notifications page
-- reads the new preference columns, and claim_pending_pushes /
-- get_daily_digest_candidates change shape (the old code ignores the new
-- columns, so migrating first is safe).

-- ---------------------------------------------------------------------------
-- 1. Type
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_notification_type_check CHECK (
    notification_type = ANY (ARRAY[
      'announcement', 'alert', 'info', 'success', 'warning', 'error',
      'certificate_issued', 'community'
    ])
  );

-- ---------------------------------------------------------------------------
-- 2. Post link
-- ---------------------------------------------------------------------------
-- target_course_id is set too, so deleting the course still cascades.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS community_post_id uuid
    REFERENCES public.community_posts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_community_post
  ON public.notifications (community_post_id)
  WHERE community_post_id IS NOT NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_community_post_is_community;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_community_post_is_community
  CHECK (community_post_id IS NULL OR notification_type = 'community');

COMMENT ON COLUMN public.notifications.community_post_id IS
  'Issue #870: the community post a notification_type = ''community'' row is about. Hiding the post dismisses the row; deleting it cascades.';

-- ---------------------------------------------------------------------------
-- 3. Community rows are system-written
-- ---------------------------------------------------------------------------
-- Permissive policies let tenant admins AND teachers insert and update the
-- school's notifications (the broadcast tool). RESTRICTIVE policies AND with
-- them, so no client can forge or rewrite a community notification — a teacher
-- editing "(3) replies" into a phishing line, or planting a row the batching
-- writer would pick up. Admin DELETE stays allowed.
DROP POLICY IF EXISTS "Community notifications are system-written" ON public.notifications;
CREATE POLICY "Community notifications are system-written"
  ON public.notifications
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (notification_type <> 'community' AND community_post_id IS NULL);

DROP POLICY IF EXISTS "Community notifications are system-updated" ON public.notifications;
CREATE POLICY "Community notifications are system-updated"
  ON public.notifications
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (notification_type <> 'community')
  WITH CHECK (notification_type <> 'community' AND community_post_id IS NULL);

-- A recipient updates their own delivery row to read or dismiss it — and was
-- allowed to update ANY column of it, notification_id included. Pointing one's
-- own row at another notification id made is_notification_recipient() true for
-- it, so any member could read any notification in the school: a digest, a
-- payment notice, and now a reply snippet from a course feed they are not in.
-- The client only ever writes these columns; delivery bookkeeping (push_sent,
-- email_sent, created_at) belongs to the server.
REVOKE UPDATE ON public.user_notifications FROM anon, authenticated;
GRANT UPDATE (in_app_read, in_app_read_at, dismissed, dismissed_at, action_taken, action_taken_at)
  ON public.user_notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Preferences
-- ---------------------------------------------------------------------------
-- Global per user, like the rest of the table. Default ON, as the issue asks.
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS community_replies boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS community_prompts boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.notification_preferences.community_replies IS
  'Issue #870: replies to my posts and comments, and my answer being accepted. false = no notification of this kind at all (in-app or push).';
COMMENT ON COLUMN public.notification_preferences.community_prompts IS
  'Issue #870: a new discussion prompt in a course I am enrolled in. false = no notification of this kind at all (in-app or push).';

-- claim_pending_pushes treats a MISSING row as push-on. The web now creates
-- rows (the community toggles), and a row created that way must not silently
-- opt its owner out of push. Existing rows keep whatever they hold.
ALTER TABLE public.notification_preferences
  ALTER COLUMN push_enabled SET DEFAULT true;

-- ---------------------------------------------------------------------------
-- 5. Index for the prompt fan-out (active students of one course)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_enrollments_course_active
  ON public.enrollments (course_id, user_id)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 6. Helpers
-- ---------------------------------------------------------------------------
-- All internal: revoked from every client role below. They call only helpers
-- that pin their own search_path (community_enabled, community_is_muted,
-- has_course_access) — never get_plan_features, which pins none and would
-- resolve its bare table names against this function's empty search_path.

CREATE OR REPLACE FUNCTION public.community_notification_excerpt(_text text, _max integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN char_length(t.v) > greatest(_max, 1)
      THEN rtrim(left(t.v, greatest(_max, 1) - 1)) || '…'
    ELSE t.v
  END
  FROM (SELECT btrim(regexp_replace(coalesce(_text, ''), '\s+', ' ', 'g')) AS v) t;
$$;

COMMENT ON FUNCTION public.community_notification_excerpt(text, integer) IS
  'Issue #870: whitespace collapsed to single spaces, trimmed, cut to _max characters with a trailing ellipsis.';

CREATE OR REPLACE FUNCTION public.community_notify_blocked(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.community_user_blocks b
            WHERE b.blocker_id = _a AND b.blocked_id = _b
         )
      OR EXISTS (
           SELECT 1 FROM public.community_user_blocks b
            WHERE b.blocker_id = _b AND b.blocked_id = _a
         );
$$;

COMMENT ON FUNCTION public.community_notify_blocked(uuid, uuid) IS
  'Issue #870: true when either member blocked the other (community_user_blocks is global).';

CREATE OR REPLACE FUNCTION public.community_notify_can_reach(_user uuid, _tenant uuid, _course integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tenant_users tu
     WHERE tu.tenant_id = _tenant
       AND tu.user_id = _user
       AND tu.status = 'active'
       AND (
         tu.role IN ('teacher', 'admin')
         OR _course IS NULL
         OR public.has_course_access(_user, _course)
       )
  );
$$;

COMMENT ON FUNCTION public.community_notify_can_reach(uuid, uuid, integer) IS
  'Issue #870: the member is active in the school and, for a course post, is staff or still has access to the course.';

CREATE OR REPLACE FUNCTION public.community_notify_wants(_user uuid, _category text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (
      SELECT np.in_app_enabled IS DISTINCT FROM false
         AND (CASE _category
                WHEN 'replies' THEN np.community_replies
                WHEN 'prompts' THEN np.community_prompts
              END) IS DISTINCT FROM false
        FROM public.notification_preferences np
       WHERE np.user_id = _user
    ),
    true
  );
$$;

COMMENT ON FUNCTION public.community_notify_wants(uuid, text) IS
  'Issue #870: no preferences row = yes. Otherwise in_app_enabled and the category column (replies | prompts) must not be false.';

-- Who a new comment notifies: the post author ('post') and the parent comment's
-- author ('comment'), one row each, 'comment' winning when they are the same
-- person. Ordered by user_id so concurrent writers take the per-recipient
-- advisory locks in the same order.
CREATE OR REPLACE FUNCTION public.community_reply_recipients(_comment_id uuid)
RETURNS TABLE (user_id uuid, reply_to text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  c record;
  p record;
BEGIN
  SELECT cc.id, cc.tenant_id, cc.post_id, cc.author_id, cc.parent_comment_id, cc.is_hidden
    INTO c
    FROM public.community_comments cc
   WHERE cc.id = _comment_id;
  IF NOT FOUND OR c.is_hidden THEN
    RETURN;
  END IF;

  SELECT cp.id, cp.tenant_id, cp.course_id, cp.author_id, cp.is_hidden
    INTO p
    FROM public.community_posts cp
   WHERE cp.id = c.post_id;
  IF NOT FOUND OR p.is_hidden OR p.tenant_id IS DISTINCT FROM c.tenant_id THEN
    RETURN;
  END IF;

  IF NOT public.community_enabled(p.tenant_id)
     OR public.community_is_muted(p.tenant_id, c.author_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (cand.uid) cand.uid, cand.kind
    FROM (
      SELECT p.author_id AS uid, 'post'::text AS kind, 2 AS rank
      UNION ALL
      SELECT pc.author_id, 'comment'::text, 1
        FROM public.community_comments pc
       WHERE pc.id = c.parent_comment_id
         AND pc.post_id = c.post_id
         AND NOT pc.is_hidden
    ) cand
   WHERE cand.uid <> c.author_id
     AND public.community_notify_can_reach(cand.uid, p.tenant_id, p.course_id)
     AND NOT public.community_notify_blocked(cand.uid, c.author_id)
     -- RLS hides a blocked member's posts from the blocker: no notification
     -- that names such a post and links to it.
     AND NOT EXISTS (
           SELECT 1 FROM public.community_user_blocks b
            WHERE b.blocker_id = cand.uid AND b.blocked_id = p.author_id
         )
     AND public.community_notify_wants(cand.uid, 'replies')
   ORDER BY cand.uid, cand.rank;
END;
$$;

COMMENT ON FUNCTION public.community_reply_recipients(uuid) IS
  'Issue #870: recipients of a reply notification for a comment (post author, parent comment author), after every never-notify rule (including a recipient who blocked the post''s author). Ordered by user_id.';

-- Who a new discussion prompt notifies. Set-based: one pass over the course's
-- active enrollments, each probe an index lookup.
CREATE OR REPLACE FUNCTION public.community_prompt_recipients(_post_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p record;
BEGIN
  SELECT cp.id, cp.tenant_id, cp.course_id, cp.author_id, cp.post_type, cp.is_hidden
    INTO p
    FROM public.community_posts cp
   WHERE cp.id = _post_id;
  IF NOT FOUND
     OR p.post_type <> 'discussion_prompt'
     OR p.course_id IS NULL
     OR p.is_hidden THEN
    RETURN;
  END IF;

  IF NOT public.community_enabled(p.tenant_id)
     OR public.community_is_muted(p.tenant_id, p.author_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.user_id
    FROM public.enrollments e
    JOIN public.tenant_users tu
      ON tu.tenant_id = p.tenant_id
     AND tu.user_id = e.user_id
     AND tu.role = 'student'
     AND tu.status = 'active'
    LEFT JOIN public.notification_preferences np
      ON np.user_id = e.user_id
   WHERE e.course_id = p.course_id
     AND e.status = 'active'
     AND e.tenant_id = p.tenant_id
     AND e.user_id <> p.author_id
     AND public.has_course_access(e.user_id, p.course_id)
     AND NOT EXISTS (
           SELECT 1 FROM public.community_user_blocks b
            WHERE b.blocker_id = e.user_id AND b.blocked_id = p.author_id
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.community_user_blocks b
            WHERE b.blocker_id = p.author_id AND b.blocked_id = e.user_id
         )
     AND np.in_app_enabled IS DISTINCT FROM false
     AND np.community_prompts IS DISTINCT FROM false;
END;
$$;

COMMENT ON FUNCTION public.community_prompt_recipients(uuid) IS
  'Issue #870: students notified of a course discussion prompt — active in the school, actively enrolled, with access, not blocked either way, prompts not turned off.';

-- ---------------------------------------------------------------------------
-- 7. Batching writer
-- ---------------------------------------------------------------------------
-- One unread reply notification per (recipient, post). The advisory lock makes
-- "find the open row, else insert" atomic against a concurrent reply for the
-- same pair; the lookup is pinned to the post's tenant, so a row planted with
-- another tenant is never adopted.
CREATE OR REPLACE FUNCTION public.community_upsert_reply_notification(
  _recipient uuid,
  _reply_to text,
  _comment_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c record;
  p record;
  v_open record;
  v_found boolean;
  v_actor_name text;
  v_actor_role text;
  v_staff boolean;
  v_staff_reply boolean;
  v_post_label text;
  v_snippet text;
  v_content text;
  v_cooldown boolean;
  v_count integer;
  v_id bigint;
BEGIN
  SELECT cc.id, cc.tenant_id, cc.post_id, cc.author_id, cc.content
    INTO c
    FROM public.community_comments cc
   WHERE cc.id = _comment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT cp.id, cp.tenant_id, cp.course_id, cp.lesson_id, cp.title, cp.content
    INTO p
    FROM public.community_posts cp
   WHERE cp.id = c.post_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('community_reply:' || _recipient::text || ':' || p.id::text, 0)
  );

  SELECT nullif(btrim(pr.full_name), '')
    INTO v_actor_name
    FROM public.profiles pr
   WHERE pr.id = c.author_id;

  SELECT tu.role
    INTO v_actor_role
    FROM public.tenant_users tu
   WHERE tu.tenant_id = p.tenant_id
     AND tu.user_id = c.author_id
     AND tu.status = 'active';

  v_staff := coalesce(v_actor_role IN ('teacher', 'admin'), false);
  v_post_label := coalesce(
    nullif(btrim(p.title), ''),
    public.community_notification_excerpt(p.content, 80)
  );
  v_snippet := public.community_notification_excerpt(c.content, 140);
  -- Stored text is what a push shows; the web renders its own copy from the
  -- metadata. No name → just the snippet.
  v_content := CASE WHEN v_actor_name IS NULL THEN v_snippet ELSE v_actor_name || ': ' || v_snippet END;

  SELECT n.id AS notification_id, n.metadata, un.id AS user_notification_id
    INTO v_open
    FROM public.notifications n
    JOIN public.user_notifications un
      ON un.notification_id = n.id
     AND un.user_id = _recipient
   WHERE n.community_post_id = p.id
     AND n.tenant_id = p.tenant_id
     AND n.notification_type = 'community'
     AND n.metadata ->> 'kind' = 'community_reply'
     AND un.in_app_read IS NOT TRUE
     AND un.dismissed IS NOT TRUE
   ORDER BY n.id DESC
   LIMIT 1;
  v_found := FOUND;

  -- A push for this (recipient, post) is still queued, or went out less than
  -- 15 minutes ago: this reply does not earn another one.
  v_cooldown := EXISTS (
    SELECT 1
      FROM public.notifications n
      JOIN public.user_notifications un
        ON un.notification_id = n.id
       AND un.user_id = _recipient
     WHERE n.community_post_id = p.id
       AND n.tenant_id = p.tenant_id
       AND n.notification_type = 'community'
       AND n.metadata ->> 'kind' = 'community_reply'
       AND (un.push_sent = false OR un.push_sent_at > now() - interval '15 minutes')
  );

  IF v_found THEN
    v_count := coalesce(
      CASE WHEN (v_open.metadata ->> 'count') ~ '^\d+$' THEN (v_open.metadata ->> 'count')::integer END,
      1
    ) + 1;
    v_staff_reply := v_staff OR (v_open.metadata ->> 'staff_reply') = 'true';

    UPDATE public.notifications n
       SET title = '(' || v_count || ') ' || v_post_label,
           content = v_content,
           priority = CASE WHEN v_staff_reply THEN 'high' ELSE 'normal' END,
           metadata = n.metadata || jsonb_build_object(
             'count', v_count,
             'comment_id', c.id,
             'actor_id', c.author_id,
             'actor_name', v_actor_name,
             'actor_role', v_actor_role,
             'reply_to', _reply_to,
             'snippet', v_snippet,
             'post_label', v_post_label,
             'staff_reply', v_staff_reply
           )
     WHERE n.id = v_open.notification_id;

    -- created_at is both the list's "latest activity" and claim_pending_pushes'
    -- queue order. While this row's push is still queued it keeps its place:
    -- moving it to now() on every reply would send a busy thread's push to the
    -- back of the queue again and again. The next reply after the push went
    -- out moves it.
    UPDATE public.user_notifications un
       SET created_at = CASE WHEN un.push_sent = false THEN un.created_at ELSE now() END,
           push_sent = CASE WHEN v_cooldown THEN un.push_sent ELSE false END,
           push_sent_at = CASE WHEN v_cooldown THEN un.push_sent_at ELSE NULL END
     WHERE un.id = v_open.user_notification_id;

    RETURN v_open.notification_id;
  END IF;

  INSERT INTO public.notifications (
    tenant_id, title, content, notification_type, priority,
    target_type, target_user_ids, target_course_id, community_post_id,
    delivery_channels, status, sent_at, created_by, metadata
  ) VALUES (
    p.tenant_id,
    v_post_label,
    v_content,
    'community',
    CASE WHEN v_staff THEN 'high' ELSE 'normal' END,
    'user',
    ARRAY[_recipient],
    p.course_id,
    p.id,
    ARRAY['in_app', 'push'],
    'sent',
    now(),
    NULL,
    jsonb_build_object(
      'kind', 'community_reply',
      'post_id', p.id,
      'course_id', p.course_id,
      'lesson_id', p.lesson_id,
      'comment_id', c.id,
      'count', 1,
      'actor_id', c.author_id,
      'actor_name', v_actor_name,
      'actor_role', v_actor_role,
      'reply_to', _reply_to,
      'snippet', v_snippet,
      'post_label', v_post_label,
      'staff_reply', v_staff
    )
  )
  RETURNING id INTO v_id;

  -- Inside the cooldown the row lands already "sent": in-app only.
  INSERT INTO public.user_notifications (notification_id, user_id, push_sent)
  VALUES (v_id, _recipient, v_cooldown);

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.community_upsert_reply_notification(uuid, text, uuid) IS
  'Issue #870 (internal): adds a comment to the recipient''s open reply notification for its post, or opens one. At most one push per (recipient, post) per 15 minutes.';

-- ---------------------------------------------------------------------------
-- 8. Triggers
-- ---------------------------------------------------------------------------

-- 8a. A comment notifies the post author and the parent comment's author.
CREATE OR REPLACE FUNCTION public.community_notify_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
BEGIN
  BEGIN
    FOR r IN
      SELECT rr.user_id, rr.reply_to
        FROM public.community_reply_recipients(NEW.id) rr
    LOOP
      PERFORM public.community_upsert_reply_notification(r.user_id, r.reply_to, NEW.id);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[#870 community_notify_on_comment] % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_notify_on_comment ON public.community_comments;
CREATE TRIGGER trg_community_notify_on_comment
  AFTER INSERT ON public.community_comments
  FOR EACH ROW
  WHEN (NOT NEW.is_hidden)
  EXECUTE FUNCTION public.community_notify_on_comment();

-- 8b. A course discussion prompt notifies the course's students.
CREATE OR REPLACE FUNCTION public.community_notify_on_prompt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id bigint;
  v_recipients integer;
  v_actor_name text;
  v_actor_role text;
  v_course_title text;
  v_post_label text;
BEGIN
  BEGIN
    SELECT co.title
      INTO v_course_title
      FROM public.courses co
     WHERE co.course_id = NEW.course_id
       AND co.tenant_id = NEW.tenant_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    SELECT nullif(btrim(pr.full_name), '')
      INTO v_actor_name
      FROM public.profiles pr
     WHERE pr.id = NEW.author_id;

    SELECT tu.role
      INTO v_actor_role
      FROM public.tenant_users tu
     WHERE tu.tenant_id = NEW.tenant_id
       AND tu.user_id = NEW.author_id
       AND tu.status = 'active';

    v_post_label := coalesce(
      nullif(btrim(NEW.title), ''),
      public.community_notification_excerpt(NEW.content, 80)
    );

    INSERT INTO public.notifications (
      tenant_id, title, content, notification_type, priority,
      target_type, target_course_id, community_post_id,
      delivery_channels, status, sent_at, created_by, metadata
    ) VALUES (
      NEW.tenant_id,
      coalesce(nullif(btrim(v_course_title), ''), v_post_label),
      v_post_label,
      'community',
      'normal',
      'course',
      NEW.course_id,
      NEW.id,
      ARRAY['in_app', 'push'],
      'sent',
      now(),
      NULL,
      jsonb_build_object(
        'kind', 'community_prompt',
        'post_id', NEW.id,
        'course_id', NEW.course_id,
        'lesson_id', NEW.lesson_id,
        'actor_id', NEW.author_id,
        'actor_name', v_actor_name,
        'actor_role', v_actor_role,
        'post_label', v_post_label,
        'course_title', v_course_title
      )
    )
    RETURNING id INTO v_id;

    -- One push per (student, course) every 15 minutes: a student with a
    -- prompt push for this course still queued, or sent less than 15 minutes
    -- ago, gets this one in-app only (landed already "sent").
    INSERT INTO public.user_notifications (notification_id, user_id, push_sent)
    SELECT v_id, u,
           EXISTS (
             SELECT 1
               FROM public.user_notifications un
               JOIN public.notifications n ON n.id = un.notification_id
              WHERE un.user_id = u
                AND un.created_at > now() - interval '1 day'
                AND (un.push_sent = false OR un.push_sent_at > now() - interval '15 minutes')
                AND n.id <> v_id
                AND n.tenant_id = NEW.tenant_id
                AND n.target_course_id = NEW.course_id
                AND n.notification_type = 'community'
                AND n.metadata ->> 'kind' = 'community_prompt'
           )
      FROM public.community_prompt_recipients(NEW.id) u;
    GET DIAGNOSTICS v_recipients = ROW_COUNT;

    -- Nobody to tell (no students yet, community off, muted author): leave no
    -- orphan row in the school's notification list.
    IF v_recipients = 0 THEN
      DELETE FROM public.notifications WHERE id = v_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[#870 community_notify_on_prompt] % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_notify_on_prompt ON public.community_posts;
CREATE TRIGGER trg_community_notify_on_prompt
  AFTER INSERT ON public.community_posts
  FOR EACH ROW
  WHEN (NEW.post_type = 'discussion_prompt' AND NEW.course_id IS NOT NULL AND NOT NEW.is_hidden)
  EXECUTE FUNCTION public.community_notify_on_prompt();

-- 8c. Hiding (soft-deleting / moderating) a post deletes every notification
-- about it, as a hard DELETE does through the FK cascade on community_post_id.
-- Dismissing would not be enough: the rows carry the post's title or excerpt
-- and reply snippets, which the recipient can still select and every teacher of
-- the school can read ("Staff can view tenant notifications") — while only
-- admins can read a hidden post. Its user_notifications rows cascade, queued
-- pushes included. Un-hiding restores nothing.
CREATE OR REPLACE FUNCTION public.community_retract_post_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    DELETE FROM public.notifications n
     WHERE n.community_post_id = NEW.id
       AND n.notification_type = 'community';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[#870 community_retract_post_notifications] % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_retract_post ON public.community_posts;
CREATE TRIGGER trg_community_retract_post
  AFTER UPDATE OF is_hidden ON public.community_posts
  FOR EACH ROW
  WHEN (NEW.is_hidden AND NOT OLD.is_hidden)
  EXECUTE FUNCTION public.community_retract_post_notifications();

-- 8d. Hiding or deleting a comment takes it back out of the notification that
-- names it: its text, author and snippet are scrubbed (content falls back to
-- the post label) and the batch loses one — or, when it was the only reply or
-- the accepted answer, the notification is also dismissed. Scrubbed, not just
-- dismissed: a dismissed row is still readable by its recipient and by every
-- teacher of the school, and neither may read a hidden comment; after account
-- deletion (#850) the member's name and words must not outlive them either.
-- Only the LATEST reply of a batch is named in metadata, so an earlier one
-- leaves the count as it is; none of its text was stored.
CREATE OR REPLACE FUNCTION public.community_retract_comment_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c record;
  r record;
  v_count integer;
  v_label text;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      c := OLD;
    ELSE
      c := NEW;
    END IF;

    -- The post itself is being deleted: its notifications cascade.
    IF NOT EXISTS (SELECT 1 FROM public.community_posts cp WHERE cp.id = c.post_id) THEN
      RETURN NULL;
    END IF;

    FOR r IN
      SELECT n.id, n.metadata
        FROM public.notifications n
       WHERE n.community_post_id = c.post_id
         AND n.tenant_id = c.tenant_id
         AND n.notification_type = 'community'
         AND n.metadata ->> 'comment_id' = c.id::text
         FOR UPDATE
    LOOP
      v_count := CASE WHEN (r.metadata ->> 'count') ~ '^\d+$' THEN (r.metadata ->> 'count')::integer ELSE 1 END;

      IF r.metadata ->> 'kind' = 'community_reply' AND v_count > 1 THEN
        v_count := v_count - 1;
        v_label := coalesce(r.metadata ->> 'post_label', '');
        UPDATE public.notifications n
           SET title = CASE WHEN v_count > 1 THEN '(' || v_count || ') ' || v_label ELSE v_label END,
               content = v_label,
               metadata = (n.metadata - ARRAY['comment_id', 'actor_id', 'actor_name', 'actor_role', 'snippet', 'reply_to'])
                          || jsonb_build_object('count', v_count)
         WHERE n.id = r.id;
      ELSE
        UPDATE public.notifications n
           SET content = coalesce(n.metadata ->> 'post_label', n.title),
               metadata = n.metadata - ARRAY['comment_id', 'actor_id', 'actor_name', 'actor_role', 'snippet', 'reply_to']
         WHERE n.id = r.id;
        UPDATE public.user_notifications un
           SET dismissed = true,
               dismissed_at = now(),
               push_sent = true
         WHERE un.notification_id = r.id
           AND un.dismissed IS NOT TRUE;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[#870 community_retract_comment_notifications] % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_retract_comment ON public.community_comments;
CREATE TRIGGER trg_community_retract_comment
  AFTER UPDATE OF is_hidden ON public.community_comments
  FOR EACH ROW
  WHEN (NEW.is_hidden AND NOT OLD.is_hidden)
  EXECUTE FUNCTION public.community_retract_comment_notifications();

-- Admin hard delete, and account deletion (#850) cascading through profiles.
DROP TRIGGER IF EXISTS trg_community_retract_comment_delete ON public.community_comments;
CREATE TRIGGER trg_community_retract_comment_delete
  AFTER DELETE ON public.community_comments
  FOR EACH ROW
  WHEN (NOT OLD.is_hidden)
  EXECUTE FUNCTION public.community_retract_comment_notifications();

-- 8e. Blocking someone takes their community notifications out of the
-- blocker's list, the same moment their posts and comments disappear: the ones
-- they caused, and the ones about their posts (someone else replying to the
-- blocker's comment on them) — RLS now hides those posts from the blocker.
CREATE OR REPLACE FUNCTION public.community_retract_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    UPDATE public.user_notifications un
       SET dismissed = true,
           dismissed_at = now(),
           push_sent = true
      FROM public.notifications n
     WHERE un.user_id = NEW.blocker_id
       AND un.dismissed IS NOT TRUE
       AND n.id = un.notification_id
       AND n.notification_type = 'community'
       AND (
         n.metadata ->> 'actor_id' = NEW.blocked_id::text
         OR EXISTS (
              SELECT 1 FROM public.community_posts cp
               WHERE cp.id = n.community_post_id
                 AND cp.author_id = NEW.blocked_id
            )
       );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[#870 community_retract_on_block] % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_retract_on_block ON public.community_user_blocks;
CREATE TRIGGER trg_community_retract_on_block
  AFTER INSERT ON public.community_user_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.community_retract_on_block();

-- ---------------------------------------------------------------------------
-- 9. Hook for accepted answers (#875 — not wired here)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_notify_answer_accepted(_comment_id uuid, _actor_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c record;
  p record;
  v_id bigint;
  v_post_label text;
  v_snippet text;
  v_actor_name text;
  v_actor_role text;
BEGIN
  BEGIN
    IF _comment_id IS NULL OR _actor_id IS NULL THEN
      RETURN NULL;
    END IF;

    SELECT cc.id, cc.tenant_id, cc.post_id, cc.author_id, cc.content, cc.is_hidden
      INTO c
      FROM public.community_comments cc
     WHERE cc.id = _comment_id;
    IF NOT FOUND OR c.is_hidden OR c.author_id = _actor_id THEN
      RETURN NULL;
    END IF;

    SELECT cp.id, cp.tenant_id, cp.course_id, cp.lesson_id, cp.author_id, cp.title, cp.content, cp.is_hidden
      INTO p
      FROM public.community_posts cp
     WHERE cp.id = c.post_id;
    IF NOT FOUND OR p.is_hidden OR p.tenant_id IS DISTINCT FROM c.tenant_id THEN
      RETURN NULL;
    END IF;

    IF NOT public.community_enabled(p.tenant_id)
       OR public.community_notify_blocked(c.author_id, _actor_id)
       -- The answer's author blocked the post's author: RLS hides the post.
       OR EXISTS (
            SELECT 1 FROM public.community_user_blocks b
             WHERE b.blocker_id = c.author_id AND b.blocked_id = p.author_id
          )
       OR NOT public.community_notify_can_reach(c.author_id, p.tenant_id, p.course_id)
       OR NOT public.community_notify_wants(c.author_id, 'replies') THEN
      RETURN NULL;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('community_accept:' || c.id::text, 0));

    SELECT n.id
      INTO v_id
      FROM public.notifications n
     WHERE n.community_post_id = p.id
       AND n.tenant_id = p.tenant_id
       AND n.notification_type = 'community'
       AND n.metadata ->> 'kind' = 'community_answer_accepted'
       AND n.metadata ->> 'comment_id' = c.id::text
     LIMIT 1;
    IF FOUND THEN
      RETURN v_id;
    END IF;

    SELECT nullif(btrim(pr.full_name), '') INTO v_actor_name FROM public.profiles pr WHERE pr.id = _actor_id;
    SELECT tu.role INTO v_actor_role
      FROM public.tenant_users tu
     WHERE tu.tenant_id = p.tenant_id AND tu.user_id = _actor_id AND tu.status = 'active';

    v_post_label := coalesce(nullif(btrim(p.title), ''), public.community_notification_excerpt(p.content, 80));
    v_snippet := public.community_notification_excerpt(c.content, 140);

    INSERT INTO public.notifications (
      tenant_id, title, content, notification_type, priority,
      target_type, target_user_ids, target_course_id, community_post_id,
      delivery_channels, status, sent_at, created_by, metadata
    ) VALUES (
      p.tenant_id,
      v_post_label,
      v_snippet,
      'community',
      'normal',
      'user',
      ARRAY[c.author_id],
      p.course_id,
      p.id,
      ARRAY['in_app', 'push'],
      'sent',
      now(),
      NULL,
      jsonb_build_object(
        'kind', 'community_answer_accepted',
        'post_id', p.id,
        'course_id', p.course_id,
        'lesson_id', p.lesson_id,
        'comment_id', c.id,
        'actor_id', _actor_id,
        'actor_name', v_actor_name,
        'actor_role', v_actor_role,
        'snippet', v_snippet,
        'post_label', v_post_label
      )
    )
    RETURNING id INTO v_id;

    INSERT INTO public.user_notifications (notification_id, user_id)
    VALUES (v_id, c.author_id);

    RETURN v_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[#870 community_notify_answer_accepted] % (%)', SQLERRM, SQLSTATE;
    RETURN NULL;
  END;
END;
$$;

COMMENT ON FUNCTION public.community_notify_answer_accepted(uuid, uuid) IS
  'Issue #870 hook for #875: notifies the comment''s author that _actor_id accepted it as the answer. Idempotent per comment; same never-notify rules as replies. It TRUSTS the caller on who may accept — #875''s definer trigger calls it after enforcing that. Never raises.';

-- ---------------------------------------------------------------------------
-- Privileges for everything above
-- ---------------------------------------------------------------------------
-- Supabase's default privileges grant EXECUTE on new public functions to anon
-- and authenticated. None of these is a client API: the helpers would let a
-- member probe other people's blocks and preferences, and the writer / hook
-- would let them forge notifications.
REVOKE ALL ON FUNCTION public.community_notification_excerpt(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_notify_blocked(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_notify_can_reach(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_notify_wants(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_reply_recipients(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_prompt_recipients(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_upsert_reply_notification(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_notify_answer_accepted(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_notify_on_comment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_notify_on_prompt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_retract_post_notifications() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_retract_comment_notifications() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_retract_on_block() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. claim_pending_pushes(): the push carries the ids the app needs
-- ---------------------------------------------------------------------------
-- A community push has no app `url`; the app routes on `kind` and needs the
-- post, comment, course and school to open the thread in the right tenant.
-- Body identical to 20260921190000 plus the `data` column. The return type
-- changes, so drop + create.
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
  data jsonb,
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
         jsonb_strip_nulls(jsonb_build_object(
           'tenant_id', n.tenant_id,
           'course_id', n.metadata -> 'course_id',
           'post_id', n.metadata -> 'post_id',
           'comment_id', n.metadata -> 'comment_id'
         )),
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
   GROUP BY n.id, n.tenant_id, n.title, n.content, n.priority, n.metadata;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_pushes(integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_pushes(integer, interval) TO service_role;

COMMENT ON FUNCTION public.claim_pending_pushes(integer, interval) IS
  'Issue #835: atomically claims pending user_notifications (marks them push_sent) for up to _max_notifications notifications and returns each (with metadata url and kind, and a data object of tenant_id/course_id/post_id/comment_id, #870) and the device tokens of its non-opted-out recipients. Rows older than _max_age are marked sent without a push. service_role only.';

-- ---------------------------------------------------------------------------
-- 11. get_daily_digest_candidates(): unread community replies
-- ---------------------------------------------------------------------------
-- The digest mentions reply notifications with activity in the last day
-- instead of emailing per event. A student whose only news is community
-- replies is now a candidate too. Body and keyset cursor are carried over
-- verbatim from 20260726140100; the return type gains a trailing column, so
-- drop + create.
DROP FUNCTION IF EXISTS public.get_daily_digest_candidates(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.get_daily_digest_candidates(
    _after_tenant_id uuid DEFAULT NULL,
    _after_user_id uuid DEFAULT NULL,
    _limit integer DEFAULT 500
)
RETURNS TABLE (
    tenant_id uuid,
    user_id uuid,
    email text,
    full_name text,
    due_cards bigint,
    goals_pending bigint,
    current_streak integer,
    last_activity_date date,
    community_replies bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        tu.tenant_id,
        tu.user_id,
        au.email::text,
        p.full_name,
        COALESCE(rc.due_count, 0) AS due_cards,
        COALESCE(sg.pending_count, 0) AS goals_pending,
        COALESCE(gp.current_streak, 0) AS current_streak,
        gp.last_activity_date,
        COALESCE(cr.c, 0) AS community_replies
    FROM tenant_users tu
    JOIN auth.users au ON au.id = tu.user_id
    LEFT JOIN profiles p ON p.id = tu.user_id
    LEFT JOIN gamification_profiles gp
        ON gp.user_id = tu.user_id AND gp.tenant_id = tu.tenant_id
    LEFT JOIN LATERAL (
        SELECT count(*) AS due_count
        FROM review_cards rc
        WHERE rc.user_id = tu.user_id
          AND rc.tenant_id = tu.tenant_id
          AND rc.suspended = false
          AND rc.due_at <= now()
    ) rc ON true
    LEFT JOIN LATERAL (
        SELECT count(*) AS pending_count
        FROM study_goals sg
        WHERE sg.user_id = tu.user_id
          AND sg.tenant_id = tu.tenant_id
          AND sg.week_start = (date_trunc('week', (now() AT TIME ZONE 'utc')))::date
          AND sg.done = false
    ) sg ON true
    -- Issue #870: replies (a batched row counts its replies) and accepted
    -- answers still unread, with activity inside the last day.
    LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(
                 CASE WHEN n.metadata ->> 'count' ~ '^\d+$' THEN (n.metadata ->> 'count')::integer ELSE 1 END
               ), 0) AS c
        FROM user_notifications un
        JOIN notifications n ON n.id = un.notification_id
        WHERE un.user_id = tu.user_id
          AND un.in_app_read = false
          AND un.dismissed IS NOT TRUE
          AND n.tenant_id = tu.tenant_id
          AND n.notification_type = 'community'
          AND n.metadata ->> 'kind' IN ('community_reply', 'community_answer_accepted')
          AND un.created_at > now() - interval '1 day'
    ) cr ON true
    WHERE tu.role = 'student'
      AND tu.status = 'active'
      AND (
        COALESCE(rc.due_count, 0) > 0
        OR COALESCE(sg.pending_count, 0) > 0
        -- Superset of "streak at risk" across all tenant timezones; the exact
        -- local-day comparison happens in isStreakAtRisk(). Was
        -- `= CURRENT_DATE - 1` (issue #549 §3).
        OR (COALESCE(gp.current_streak, 0) >= 3
            AND gp.last_activity_date >= CURRENT_DATE - 2)
        OR COALESCE(cr.c, 0) > 0
      )
      -- Keyset cursor from issue #548, carried over unchanged.
      AND (
        _after_tenant_id IS NULL
        OR (tu.tenant_id, tu.user_id)
             > (_after_tenant_id, COALESCE(_after_user_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    ORDER BY tu.tenant_id, tu.user_id
    LIMIT LEAST(GREATEST(COALESCE(_limit, 500), 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) TO service_role;

COMMENT ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) IS
  'Daily-digest candidates, keyset-paginated on (tenant_id, user_id). Callers must page until an empty result: a short page may be the PostgREST row cap, not the end of the set (#548). community_replies = unread community replies/accepted answers with activity in the last day (#870).';
