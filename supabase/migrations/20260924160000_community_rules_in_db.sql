-- Issue #846: the community's rules live in the database, and a member can
-- report content and block an author.
--
-- Every rule lived in app/actions/community.ts, which writes with the service
-- role. The RLS policies underneath only checked author = auth.uid() and the
-- tenant, so the native app (and anyone holding a student JWT) wrote around
-- all of it:
--   * poll votes: nothing maintained community_poll_options.vote_count (the
--     action bumped it by hand), so a vote cast through RLS never counted
--   * a muted member could still post, comment, react and vote
--   * a legacy INSERT policy on community_comments ("Authenticated users can
--     create comments on unlocked posts") was never dropped when its stricter
--     replacement landed, and permissive policies OR together, so the
--     enrollment check for course posts never applied
--   * comments were accepted on hidden (removed) posts, and a reply could
--     name a parent comment from another post
--   * an author could UPDATE any column of their own post or comment,
--     including is_hidden — un-removing what a moderator removed — and
--     is_pinned / is_locked / the counters
--   * a student could insert a pinned, locked, graded, milestone or
--     discussion_prompt post, post to a course they cannot reach, or post
--     while the school turned student school-feed posts / polls off
--   * the plan gate (get_plan_features -> features.community) was only in the
--     page, so a school on a plan without community could still be written to
--   * a report could be filed pre-"reviewed", or name another school's content
--
-- The web actions keep their checks (they give the friendly error), but the
-- database is now the authority. Reads are unchanged, except that a member no
-- longer sees posts and comments by an author they blocked.
--
-- Blocking (App Store guideline 1.2) is per person, not per school: profiles
-- are global, and someone you blocked in one school is someone you do not
-- want to see in another. Only the blocker can see their own block rows; the
-- blocked member is never told. Teachers and admins keep seeing everything:
-- they moderate what they are shown, and hide content instead of blocking.
--
-- Moderation (pin, lock, hide, mute, reviewing reports) stays on the
-- service-role path in app/actions/admin/community.ts.

-- 1) helpers -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.community_is_muted(_tenant_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_user_mutes m
    WHERE m.tenant_id = _tenant_id
      AND m.user_id = _user_id
      AND (m.muted_until IS NULL OR m.muted_until > now())
  );
$$;

COMMENT ON FUNCTION public.community_is_muted(uuid, uuid) IS
  'True while the member has an active community mute in the tenant (NULL muted_until = indefinite).';

-- The plan gate the community pages show as an upgrade nudge.
CREATE OR REPLACE FUNCTION public.community_enabled(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((get_plan_features(_tenant_id) -> 'features' ->> 'community')::boolean, false);
$$;

COMMENT ON FUNCTION public.community_enabled(uuid) IS
  'The tenant''s plan includes the community (get_plan_features -> features.community).';

-- A tenant_settings toggle ({ "enabled": false } turns it off; a missing row is on),
-- read the same way the web actions read it.
CREATE OR REPLACE FUNCTION public.community_setting_on(_tenant_id uuid, _key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM tenant_settings s
    WHERE s.tenant_id = _tenant_id
      AND s.setting_key = _key
      AND s.setting_value ->> 'enabled' = 'false'
  );
$$;

-- The caller may write to this tenant's community at all: it is their JWT
-- tenant, the plan includes the community, and they are not muted there.
CREATE OR REPLACE FUNCTION public.community_can_write(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _tenant_id = get_tenant_id()
     AND community_enabled(_tenant_id)
     AND NOT community_is_muted(_tenant_id, auth.uid());
$$;

-- The post exists in the tenant, has not been removed, and the caller can
-- reach its course (staff always can). With _for_reply it must also be unlocked.
CREATE OR REPLACE FUNCTION public.community_post_accepts(
  _post_id uuid,
  _tenant_id uuid,
  _for_reply boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_posts p
    WHERE p.id = _post_id
      AND p.tenant_id = _tenant_id
      AND NOT p.is_hidden
      AND (NOT _for_reply OR NOT p.is_locked)
      AND (
        p.course_id IS NULL
        OR get_tenant_role() IN ('teacher', 'admin')
        OR has_course_access(auth.uid(), p.course_id)
      )
  );
$$;

-- Where a new post may go: the school feed (unless the school turned student
-- posts off), or a course of this tenant the caller can reach. A lesson must
-- belong to the post's course.
CREATE OR REPLACE FUNCTION public.community_post_target_ok(
  _tenant_id uuid,
  _course_id integer,
  _lesson_id integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN _course_id IS NULL THEN
        _lesson_id IS NULL
        AND (
          get_tenant_role() IN ('teacher', 'admin')
          OR community_setting_on(_tenant_id, 'community_student_posts_school_feed')
        )
      ELSE
        EXISTS (
          SELECT 1 FROM courses c
          WHERE c.course_id = _course_id AND c.tenant_id = _tenant_id
        )
        AND (
          get_tenant_role() IN ('teacher', 'admin')
          OR has_course_access(auth.uid(), _course_id)
        )
        AND (
          _lesson_id IS NULL
          OR EXISTS (
            SELECT 1 FROM lessons l
            WHERE l.id = _lesson_id AND l.course_id = _course_id
          )
        )
    END;
$$;

-- A reply's parent is a visible comment on the same post. A function, since a
-- community_comments policy cannot query community_comments (42P17).
CREATE OR REPLACE FUNCTION public.community_reply_parent_ok(_parent_id uuid, _post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_comments c
    WHERE c.id = _parent_id AND c.post_id = _post_id AND NOT c.is_hidden
  );
$$;

-- 2) blocks ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.community_user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT community_user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

COMMENT ON TABLE public.community_user_blocks IS
  'A member hides another member''s community posts and comments from themselves. Global (profiles are), private to the blocker.';

ALTER TABLE public.community_user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_user_blocks FROM anon;
REVOKE UPDATE, TRUNCATE ON public.community_user_blocks FROM authenticated;

CREATE POLICY "Members see their own blocks"
  ON public.community_user_blocks FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

CREATE POLICY "Members block others"
  ON public.community_user_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (SELECT auth.uid()));

CREATE POLICY "Members unblock"
  ON public.community_user_blocks FOR DELETE TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.community_viewer_blocked(_author_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_user_blocks b
    WHERE b.blocker_id = auth.uid() AND b.blocked_id = _author_id
  );
$$;

-- Restrictive: ANDed with every SELECT policy on the table.
CREATE POLICY "Blocked authors are hidden from the blocker"
  ON public.community_posts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    get_tenant_role() IN ('teacher', 'admin')
    OR is_super_admin()
    OR NOT community_viewer_blocked(author_id)
  );

CREATE POLICY "Blocked authors are hidden from the blocker"
  ON public.community_comments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    get_tenant_role() IN ('teacher', 'admin')
    OR is_super_admin()
    OR NOT community_viewer_blocked(author_id)
  );

-- 3) community_posts ---------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.community_posts;

CREATE POLICY "Members can create posts"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND community_can_write(tenant_id)
    AND NOT is_pinned
    AND NOT is_locked
    AND NOT is_hidden
    AND comment_count = 0
    AND reaction_count = 0
    AND (
      get_tenant_role() IN ('teacher', 'admin')
      OR (
        post_type IN ('standard', 'poll')
        AND NOT is_graded
        AND milestone_type IS NULL
        AND milestone_data IS NULL
        AND (post_type <> 'poll' OR community_setting_on(tenant_id, 'community_student_polls'))
      )
    )
    AND community_post_target_ok(tenant_id, course_id, lesson_id)
  );

-- Authors edit what they wrote; moderation columns and counters are the
-- service role's (admin actions) and the triggers'.
REVOKE UPDATE ON public.community_posts FROM authenticated;
GRANT UPDATE (title, content, media_urls, updated_at) ON public.community_posts TO authenticated;

-- 4) community_comments ------------------------------------------------------

-- Both names: the stricter one never replaced the original (see header).
DROP POLICY IF EXISTS "Authenticated users can create comments on unlocked posts" ON public.community_comments;
DROP POLICY IF EXISTS "Users can create comments on unlocked posts" ON public.community_comments;

CREATE POLICY "Members can comment on open posts"
  ON public.community_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND community_can_write(tenant_id)
    AND NOT is_hidden
    AND community_post_accepts(post_id, tenant_id, true)
    AND (
      parent_comment_id IS NULL
      OR community_reply_parent_ok(parent_comment_id, post_id)
    )
  );

REVOKE UPDATE ON public.community_comments FROM authenticated;
GRANT UPDATE (content, updated_at) ON public.community_comments TO authenticated;

-- 5) community_reactions -----------------------------------------------------

DROP POLICY IF EXISTS "Users can create own reactions" ON public.community_reactions;

CREATE POLICY "Members can react to visible content"
  ON public.community_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND community_can_write(tenant_id)
    AND (
      post_id IS NULL
      OR community_post_accepts(post_id, tenant_id, false)
    )
    AND (
      comment_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.community_comments c
        WHERE c.id = community_reactions.comment_id
          AND c.tenant_id = community_reactions.tenant_id
          AND NOT c.is_hidden
          AND community_post_accepts(c.post_id, c.tenant_id, false)
      )
    )
  );

REVOKE UPDATE ON public.community_reactions FROM authenticated;

-- 6) polls -------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can cast own vote" ON public.community_poll_votes;

CREATE POLICY "Members can vote once on open polls"
  ON public.community_poll_votes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND community_can_write(tenant_id)
    AND community_post_accepts(post_id, tenant_id, false)
    AND EXISTS (
      SELECT 1
      FROM public.community_poll_options o
      JOIN public.community_posts p ON p.id = o.post_id
      WHERE o.id = community_poll_votes.option_id
        AND o.post_id = community_poll_votes.post_id
        AND p.post_type = 'poll'
    )
  );

REVOKE UPDATE, DELETE ON public.community_poll_votes FROM authenticated;

-- Options: staff, or the member who wrote the poll. Always start at zero votes.
DROP POLICY IF EXISTS "Teachers and admins can create poll options" ON public.community_poll_options;

CREATE POLICY "Poll authors and staff can add options"
  ON public.community_poll_options FOR INSERT TO authenticated
  WITH CHECK (
    vote_count = 0
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_poll_options.post_id
        AND p.tenant_id = get_tenant_id()
        AND p.post_type = 'poll'
        AND (
          p.author_id = (SELECT auth.uid())
          OR get_tenant_role() IN ('teacher', 'admin')
        )
    )
  );

REVOKE UPDATE, DELETE ON public.community_poll_options FROM authenticated;

-- vote_count follows community_poll_votes, whoever writes the vote.
CREATE OR REPLACE FUNCTION public.update_community_poll_vote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE community_poll_options
      SET vote_count = vote_count + 1
      WHERE id = NEW.option_id;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    UPDATE community_poll_options
      SET vote_count = GREATEST(vote_count - 1, 0)
      WHERE id = OLD.option_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_poll_vote_count ON public.community_poll_votes;
CREATE TRIGGER trg_community_poll_vote_count
  AFTER INSERT OR DELETE OR UPDATE OF option_id ON public.community_poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.update_community_poll_vote_count();

-- Votes cast through RLS never counted; recount every option from the votes.
UPDATE public.community_poll_options o
SET vote_count = (
  SELECT count(*) FROM public.community_poll_votes v WHERE v.option_id = o.id
)
WHERE o.vote_count IS DISTINCT FROM (
  SELECT count(*) FROM public.community_poll_votes v WHERE v.option_id = o.id
);

-- 7) reports (community_flags) -----------------------------------------------

ALTER TABLE public.community_flags
  ADD CONSTRAINT community_flags_one_target
  CHECK ((post_id IS NULL) <> (comment_id IS NULL));

DROP POLICY IF EXISTS "Authenticated users can create flags" ON public.community_flags;

-- A report is always filed pending, about content the reporter can see. Muted
-- members can still report.
CREATE POLICY "Members can report content they can see"
  ON public.community_flags FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND tenant_id = get_tenant_id()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND char_length(btrim(reason)) BETWEEN 1 AND 1000
    AND (
      post_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.community_posts p
        WHERE p.id = community_flags.post_id
          AND p.tenant_id = community_flags.tenant_id
      )
    )
    AND (
      comment_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.community_comments c
        WHERE c.id = community_flags.comment_id
          AND c.tenant_id = community_flags.tenant_id
      )
    )
  );

-- Reviewing happens on the service-role path (reviewFlag).
DROP POLICY IF EXISTS "Admins can update flags" ON public.community_flags;
REVOKE UPDATE, DELETE ON public.community_flags FROM authenticated;
