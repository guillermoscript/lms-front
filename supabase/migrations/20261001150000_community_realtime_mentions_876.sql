-- Issue #876 (epic #867): a live community feed, and @mentions.
--
-- A. Realtime
--
--   community_posts and community_comments join the `supabase_realtime`
--   publication, so the web feed can show "N new posts" and an open thread can
--   append new comments without a reload.
--
--   Postgres Changes runs every event through the SUBSCRIBER's RLS (their JWT:
--   tenant_id claim, course enrollment, blocks, is_hidden), so a member of one
--   school never receives another school's rows, a student never receives a
--   course feed they are not enrolled in, and hidden rows and blocked authors
--   are never delivered. The web client narrows each channel further (tenant_id
--   for the school feed, course_id for a course feed, post_id for a thread) and
--   treats an event only as a signal: it re-reads through the same server path
--   as the first page (getFeedPage / getComments), never renders the payload.
--
--   community_reactions is deliberately NOT published. Its SELECT policy is
--   tenant-wide ("Users can view reactions in their tenant"), so a subscriber
--   filtering on tenant_id would receive who reacted to posts in courses they
--   cannot open. The issue marks live reactions optional; counts stay
--   optimistic as before.
--
-- B. @mentions
--
--   A mention is markdown written by the composer: `[@Ana Pérez](mention:<uuid>)`.
--   It renders as a highlighted name on the web (community-markdown.tsx) and as
--   plain link text anywhere else. The DATABASE decides who was mentioned — an
--   AFTER trigger parses posts and comments on insert and on a content edit,
--   because the web (service role), the native app and the MCP server (RLS) all
--   write there and a trigger is the one place all three pass (#870's rule).
--
--   * community_mentions records one row per (post | comment, mentioned user),
--     only for people who can see that content: active in the school; for a
--     course post, staff or a student with an active enrollment AND access (what
--     the course feed's RLS and the web's resolveReachablePost require); not
--     blocked by or blocking the author; not someone who blocked the post's
--     author (RLS hides the post from them). Never the author. At most 10
--     distinct people per text, first come first served. A uuid that is not an
--     eligible member is simply not a mention — nothing is recorded, nobody is
--     told.
--
--   * Each new mention notifies through the #870 pipeline: notification_type
--     'community', metadata.kind 'community_mention', one row per recipient, a
--     push at most once per (recipient, post) every 15 minutes. Skipped when the
--     school has no community, the author is muted, the recipient turned the new
--     `community_mentions` preference (or in-app) off, or the recipient already
--     gets a reply notification for this very comment (post author, parent
--     comment author) — one event, one notification.
--
--   * Retraction reuses #870's triggers: hiding/deleting the post deletes its
--     notifications; hiding/deleting the comment scrubs and dismisses the one
--     naming it (it matches metadata.comment_id); a new block dismisses the
--     blocker's notifications from the blocked member. An edit that takes a
--     mention out of a post deletes that mention and its notification.
--
--   * community_mention_candidates() is the composer's autocomplete: members of
--     the caller's school who can see the post/feed, by name, at most 8. It is
--     tenant-scoped by an explicit id the caller must belong to, not the JWT
--     claim, so it answers for the school on screen.
--
-- Deploy: apply before merging the web code (the notifications page reads the
-- new preference column). Nothing here changes an existing function's shape.

-- ---------------------------------------------------------------------------
-- 1. Realtime publication
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE '#876: no supabase_realtime publication here; skipping';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'community_posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'community_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Mentions table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  -- NULL: the mention is in the post itself.
  comment_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_mentions_not_self CHECK (mentioned_user_id <> author_id),
  CONSTRAINT community_mentions_unique UNIQUE NULLS NOT DISTINCT (post_id, comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_mentions_mentioned
  ON public.community_mentions (mentioned_user_id, tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_mentions_comment
  ON public.community_mentions (comment_id)
  WHERE comment_id IS NOT NULL;

COMMENT ON TABLE public.community_mentions IS
  'Issue #876: who a community post or comment @mentioned. Written only by the community_sync_mentions triggers, and only for members who can see the content. comment_id NULL = mentioned in the post.';

ALTER TABLE public.community_mentions ENABLE ROW LEVEL SECURITY;

-- System-written: no client writes, whatever their role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.community_mentions FROM anon, authenticated;
REVOKE ALL ON public.community_mentions FROM anon;

DROP POLICY IF EXISTS "Members see mentions they made or received" ON public.community_mentions;
CREATE POLICY "Members see mentions they made or received"
  ON public.community_mentions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.get_tenant_id())
    AND (SELECT auth.uid()) IN (mentioned_user_id, author_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Preference
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS community_mentions boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.notification_preferences.community_mentions IS
  'Issue #876: someone @mentioned me in a post or comment. false = no notification of this kind at all (in-app or push).';

-- #870's helper gains the 'mentions' category; body otherwise unchanged.
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
                WHEN 'mentions' THEN np.community_mentions
              END) IS DISTINCT FROM false
        FROM public.notification_preferences np
       WHERE np.user_id = _user
    ),
    true
  );
$$;

COMMENT ON FUNCTION public.community_notify_wants(uuid, text) IS
  'Issue #870/#876: no preferences row = yes. Otherwise in_app_enabled and the category column (replies | prompts | mentions) must not be false.';

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------

-- Who may be mentioned in (and so told about) content in this school/course
-- written by _author on a post by _post_author.
CREATE OR REPLACE FUNCTION public.community_mention_eligible(
  _user uuid,
  _tenant uuid,
  _course integer,
  _author uuid,
  _post_author uuid
)
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
                OR (
                  EXISTS (
                    SELECT 1 FROM public.enrollments e
                     WHERE e.user_id = _user
                       AND e.course_id = _course
                       AND e.tenant_id = _tenant
                       AND e.status = 'active'
                  )
                  AND public.has_course_access(_user, _course)
                )
              )
         )
     AND NOT public.community_notify_blocked(_user, _author)
     -- RLS hides a blocked member's posts from the blocker.
     AND NOT EXISTS (
           SELECT 1 FROM public.community_user_blocks b
            WHERE b.blocker_id = _user AND b.blocked_id = _post_author
         );
$$;

COMMENT ON FUNCTION public.community_mention_eligible(uuid, uuid, integer, uuid, uuid) IS
  'Issue #876: _user can see content by _author on a post by _post_author in this school (and course): active member; for a course, staff or actively enrolled with access; no block with the author either way; has not blocked the post author.';

-- The distinct user ids a text mentions, in order of first appearance, at most
-- _max. Only the composer's exact form counts.
CREATE OR REPLACE FUNCTION public.community_parse_mentions(_content text, _max integer DEFAULT 10)
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(m.uid ORDER BY m.first_at), '{}')
    FROM (
      SELECT lower(t.x[1])::uuid AS uid, min(t.ord) AS first_at
        FROM regexp_matches(
               coalesce(_content, ''),
               '\[@[^\]\n]{1,100}\]\(mention:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)',
               'g'
             ) WITH ORDINALITY AS t(x, ord)
       GROUP BY 1
       ORDER BY 2
       LIMIT greatest(_max, 0)
    ) m;
$$;

COMMENT ON FUNCTION public.community_parse_mentions(text, integer) IS
  'Issue #876: user ids of `[@Name](mention:<uuid>)` tokens in a text, distinct, in order of appearance, at most _max.';

-- ---------------------------------------------------------------------------
-- 5. Notification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_notify_mention(_mention_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m record;
  p record;
  v_content_src text;
  v_actor_name text;
  v_actor_role text;
  v_staff boolean;
  v_post_label text;
  v_title_label text;
  v_snippet text;
  v_cooldown boolean;
  v_id bigint;
BEGIN
  BEGIN
    SELECT cm.id, cm.tenant_id, cm.post_id, cm.comment_id, cm.mentioned_user_id, cm.author_id
      INTO m
      FROM public.community_mentions cm
     WHERE cm.id = _mention_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    SELECT cp.id, cp.tenant_id, cp.course_id, cp.lesson_id, cp.title, cp.content, cp.milestone_data
      INTO p
      FROM public.community_posts cp
     WHERE cp.id = m.post_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    IF m.comment_id IS NULL THEN
      v_content_src := p.content;
    ELSE
      SELECT cc.content INTO v_content_src FROM public.community_comments cc WHERE cc.id = m.comment_id;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('community_mention:' || m.mentioned_user_id::text || ':' || p.id::text, 0));

    SELECT nullif(btrim(pr.full_name), '') INTO v_actor_name FROM public.profiles pr WHERE pr.id = m.author_id;
    SELECT tu.role INTO v_actor_role
      FROM public.tenant_users tu
     WHERE tu.tenant_id = p.tenant_id AND tu.user_id = m.author_id AND tu.status = 'active';
    v_staff := coalesce(v_actor_role IN ('teacher', 'admin'), false);

    v_post_label := public.community_notification_post_label(p.title, p.content, p.milestone_data);
    v_title_label := coalesce(v_post_label, public.community_notification_place_label(p.tenant_id, p.course_id));
    -- The raw token reads badly in a push; show the name it carries.
    v_snippet := public.community_notification_excerpt(
      regexp_replace(coalesce(v_content_src, ''), '\[(@[^\]\n]{1,100})\]\(mention:[0-9a-fA-F-]{36}\)', '\1', 'g'),
      140
    );

    -- A mention push for this (recipient, post) is still queued or went out in
    -- the last 15 minutes: this one is in-app only.
    v_cooldown := EXISTS (
      SELECT 1
        FROM public.notifications n
        JOIN public.user_notifications un
          ON un.notification_id = n.id
         AND un.user_id = m.mentioned_user_id
       WHERE n.community_post_id = p.id
         AND n.tenant_id = p.tenant_id
         AND n.notification_type = 'community'
         AND n.metadata ->> 'kind' = 'community_mention'
         AND (un.push_sent = false OR un.push_sent_at > now() - interval '15 minutes')
    );

    INSERT INTO public.notifications (
      tenant_id, title, content, notification_type, priority,
      target_type, target_user_ids, target_course_id, community_post_id,
      delivery_channels, status, sent_at, created_by, metadata
    ) VALUES (
      p.tenant_id,
      v_title_label,
      CASE WHEN v_actor_name IS NULL THEN v_snippet ELSE v_actor_name || ': ' || v_snippet END,
      'community',
      CASE WHEN v_staff THEN 'high' ELSE 'normal' END,
      'user',
      ARRAY[m.mentioned_user_id],
      p.course_id,
      p.id,
      ARRAY['in_app', 'push'],
      'sent',
      now(),
      NULL,
      jsonb_build_object(
        'kind', 'community_mention',
        'mention_id', m.id,
        'target', CASE WHEN m.comment_id IS NULL THEN 'post' ELSE 'comment' END,
        'post_id', p.id,
        'course_id', p.course_id,
        'lesson_id', p.lesson_id,
        'comment_id', m.comment_id,
        'actor_id', m.author_id,
        'actor_name', v_actor_name,
        'actor_role', v_actor_role,
        'snippet', v_snippet,
        'post_label', v_post_label
      )
    )
    RETURNING id INTO v_id;

    INSERT INTO public.user_notifications (notification_id, user_id, push_sent)
    VALUES (v_id, m.mentioned_user_id, v_cooldown);

    RETURN v_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[#876 community_notify_mention] % (%)', SQLERRM, SQLSTATE;
    RETURN NULL;
  END;
END;
$$;

COMMENT ON FUNCTION public.community_notify_mention(uuid) IS
  'Issue #876 (internal): tells a mentioned member (kind community_mention). One row per mention; at most one push per (recipient, post) per 15 minutes. Never raises.';

-- ---------------------------------------------------------------------------
-- 6. Sync (insert + edit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_sync_mentions(_post_id uuid, _comment_id uuid, _is_insert boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p record;
  c record;
  v_author uuid;
  v_content text;
  v_wanted uuid[];
  v_new uuid[];
  v_reply_recipients uuid[] := '{}';
  v_notify boolean;
  v_mention_id uuid;
  u uuid;
BEGIN
  SELECT cp.id, cp.tenant_id, cp.course_id, cp.author_id, cp.content, cp.is_hidden
    INTO p
    FROM public.community_posts cp
   WHERE cp.id = _post_id;
  IF NOT FOUND OR p.is_hidden THEN
    RETURN;
  END IF;

  IF _comment_id IS NULL THEN
    v_author := p.author_id;
    v_content := p.content;
  ELSE
    SELECT cc.id, cc.tenant_id, cc.author_id, cc.content, cc.is_hidden
      INTO c
      FROM public.community_comments cc
     WHERE cc.id = _comment_id
       AND cc.post_id = _post_id;
    IF NOT FOUND OR c.is_hidden OR c.tenant_id IS DISTINCT FROM p.tenant_id THEN
      RETURN;
    END IF;
    v_author := c.author_id;
    v_content := c.content;
  END IF;

  SELECT coalesce(array_agg(x.uid), '{}')
    INTO v_wanted
    FROM unnest(public.community_parse_mentions(v_content, 10)) AS x(uid)
   WHERE x.uid <> v_author
     AND public.community_mention_eligible(x.uid, p.tenant_id, p.course_id, v_author, p.author_id);

  -- An edit that took a mention out takes it (and what it told) back.
  IF NOT _is_insert THEN
    DELETE FROM public.notifications n
     WHERE n.community_post_id = p.id
       AND n.tenant_id = p.tenant_id
       AND n.notification_type = 'community'
       AND n.metadata ->> 'kind' = 'community_mention'
       AND n.metadata ->> 'mention_id' IN (
             SELECT cm.id::text
               FROM public.community_mentions cm
              WHERE cm.post_id = p.id
                AND cm.comment_id IS NOT DISTINCT FROM _comment_id
                AND NOT (cm.mentioned_user_id = ANY (v_wanted))
           );
    DELETE FROM public.community_mentions cm
     WHERE cm.post_id = p.id
       AND cm.comment_id IS NOT DISTINCT FROM _comment_id
       AND NOT (cm.mentioned_user_id = ANY (v_wanted));
  END IF;

  IF cardinality(v_wanted) = 0 THEN
    RETURN;
  END IF;

  WITH ins AS (
    INSERT INTO public.community_mentions (tenant_id, post_id, comment_id, mentioned_user_id, author_id)
    SELECT p.tenant_id, p.id, _comment_id, w.uid, v_author
      FROM unnest(v_wanted) AS w(uid)
    ON CONFLICT DO NOTHING
    RETURNING mentioned_user_id
  )
  SELECT coalesce(array_agg(ins.mentioned_user_id), '{}') INTO v_new FROM ins;

  IF cardinality(v_new) = 0 THEN
    RETURN;
  END IF;

  v_notify := public.community_enabled(p.tenant_id)
              AND NOT public.community_is_muted(p.tenant_id, v_author);
  IF NOT v_notify THEN
    RETURN;
  END IF;

  -- The post author and the parent comment's author already hear about this
  -- comment as a reply (#870): one event, one notification.
  IF _comment_id IS NOT NULL THEN
    SELECT coalesce(array_agg(rr.user_id), '{}')
      INTO v_reply_recipients
      FROM public.community_reply_recipients(_comment_id) rr;
  END IF;

  FOREACH u IN ARRAY v_new LOOP
    CONTINUE WHEN u = ANY (v_reply_recipients);
    CONTINUE WHEN NOT public.community_notify_wants(u, 'mentions');
    SELECT cm.id INTO v_mention_id
      FROM public.community_mentions cm
     WHERE cm.post_id = p.id
       AND cm.comment_id IS NOT DISTINCT FROM _comment_id
       AND cm.mentioned_user_id = u;
    PERFORM public.community_notify_mention(v_mention_id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.community_sync_mentions(uuid, uuid, boolean) IS
  'Issue #876 (internal): records the eligible mentions in a post (comment NULL) or comment and notifies the new ones; on an edit, removes mentions (and their notifications) no longer in the text.';

CREATE OR REPLACE FUNCTION public.community_mentions_on_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM public.community_sync_mentions(NEW.id, NULL, TG_OP = 'INSERT');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[#876 community_mentions_on_post] % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_mentions_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM public.community_sync_mentions(NEW.post_id, NEW.id, TG_OP = 'INSERT');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[#876 community_mentions_on_comment] % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

-- Only text that can hold a mention wakes the parser. Milestones are system
-- posts with no author text worth parsing.
DROP TRIGGER IF EXISTS trg_community_mentions_on_post ON public.community_posts;
CREATE TRIGGER trg_community_mentions_on_post
  AFTER INSERT ON public.community_posts
  FOR EACH ROW
  WHEN (NOT NEW.is_hidden AND NEW.post_type <> 'milestone' AND strpos(NEW.content, '](mention:') > 0)
  EXECUTE FUNCTION public.community_mentions_on_post();

DROP TRIGGER IF EXISTS trg_community_mentions_on_post_edit ON public.community_posts;
CREATE TRIGGER trg_community_mentions_on_post_edit
  AFTER UPDATE OF content ON public.community_posts
  FOR EACH ROW
  WHEN (NOT NEW.is_hidden AND NEW.post_type <> 'milestone' AND OLD.content IS DISTINCT FROM NEW.content)
  EXECUTE FUNCTION public.community_mentions_on_post();

DROP TRIGGER IF EXISTS trg_community_mentions_on_comment ON public.community_comments;
CREATE TRIGGER trg_community_mentions_on_comment
  AFTER INSERT ON public.community_comments
  FOR EACH ROW
  WHEN (NOT NEW.is_hidden AND strpos(NEW.content, '](mention:') > 0)
  EXECUTE FUNCTION public.community_mentions_on_comment();

DROP TRIGGER IF EXISTS trg_community_mentions_on_comment_edit ON public.community_comments;
CREATE TRIGGER trg_community_mentions_on_comment_edit
  AFTER UPDATE OF content ON public.community_comments
  FOR EACH ROW
  WHEN (NOT NEW.is_hidden AND OLD.content IS DISTINCT FROM NEW.content)
  EXECUTE FUNCTION public.community_mentions_on_comment();

-- ---------------------------------------------------------------------------
-- 7. Autocomplete
-- ---------------------------------------------------------------------------
-- Candidates for "@…" in a composer: members of _tenant_id who can see what
-- is being written — a reply on _post_id, else a new post in _course_id (NULL
-- = the school feed). The caller must be able to see it too, or nothing comes
-- back. Name match is case-insensitive substring; prefix matches first.
CREATE OR REPLACE FUNCTION public.community_mention_candidates(
  _tenant_id uuid,
  _course_id integer DEFAULT NULL,
  _post_id uuid DEFAULT NULL,
  _query text DEFAULT '',
  _limit integer DEFAULT 8
)
RETURNS TABLE (user_id uuid, full_name text, avatar_url text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_caller uuid := auth.uid();
  v_course integer := _course_id;
  v_post_author uuid;
  v_q text;
BEGIN
  IF v_caller IS NULL OR _tenant_id IS NULL THEN
    RETURN;
  END IF;

  IF _post_id IS NOT NULL THEN
    SELECT cp.course_id, cp.author_id
      INTO v_course, v_post_author
      FROM public.community_posts cp
     WHERE cp.id = _post_id
       AND cp.tenant_id = _tenant_id
       AND NOT cp.is_hidden;
    IF NOT FOUND THEN
      RETURN;
    END IF;
  ELSE
    v_post_author := v_caller;
    IF v_course IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.courses co WHERE co.course_id = v_course AND co.tenant_id = _tenant_id
    ) THEN
      RETURN;
    END IF;
  END IF;

  IF NOT public.community_mention_eligible(v_caller, _tenant_id, v_course, v_caller, v_post_author) THEN
    RETURN;
  END IF;

  v_q := left(btrim(coalesce(_query, '')), 50);
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT tu.user_id, btrim(pr.full_name), pr.avatar_url, tu.role::text
    FROM public.tenant_users tu
    JOIN public.profiles pr ON pr.id = tu.user_id
   WHERE tu.tenant_id = _tenant_id
     AND tu.status = 'active'
     AND tu.user_id <> v_caller
     AND nullif(btrim(pr.full_name), '') IS NOT NULL
     AND pr.full_name ILIKE '%' || v_q || '%'
     AND public.community_mention_eligible(tu.user_id, _tenant_id, v_course, v_caller, v_post_author)
   ORDER BY (btrim(pr.full_name) ILIKE v_q || '%') DESC, lower(btrim(pr.full_name)), tu.user_id
   LIMIT least(greatest(coalesce(_limit, 8), 1), 8);
END;
$$;

COMMENT ON FUNCTION public.community_mention_candidates(uuid, integer, uuid, text, integer) IS
  'Issue #876: @mention autocomplete. Members of _tenant_id who can see a reply on _post_id (else a new post in _course_id, NULL = school feed), excluding the caller and anyone blocked either way; empty unless the caller can see it too. At most 8.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.community_mention_eligible(uuid, uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_parse_mentions(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_notify_mention(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_sync_mentions(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_mentions_on_post() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_mentions_on_comment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_mention_candidates(uuid, integer, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_mention_candidates(uuid, integer, uuid, text, integer) TO authenticated;
