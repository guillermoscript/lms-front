-- Issue #875 (epic #867): questions with an accepted answer.
--
-- Students use the course community mostly to ask questions, but nothing said
-- whether a question had been answered, so the next student with the same
-- doubt read the whole thread or asked again.
--
--   * post_type gains 'question'. Students may post one wherever they may post
--     a standard post ("Members can create posts" is recreated with it).
--   * community_posts.accepted_comment_id names the accepted answer;
--     accepted_by / accepted_at record who accepted it and when. The trigger
--     writes those two — a client never does.
--   * Who may accept (or un-accept): the question's author, or an ACTIVE
--     teacher/admin of the post's school (tenant_users, not the JWT claim).
--     The answer must be a visible TOP-LEVEL comment of that same post, in the
--     same school. A muted member cannot accept. A reply is a follow-up in a
--     conversation, not an answer to the question.
--   * One rule, every writer. The BEFORE trigger is the authority for the
--     native app and the MCP server (RLS path: the actor is auth.uid(), which
--     it stamps into accepted_by) and for the web (service role: the action
--     says who accepted by writing accepted_by, and the trigger holds that
--     person to the same rule). authenticated gets UPDATE on
--     accepted_comment_id only; the existing "Authors and staff can update
--     posts" policy already limits the row to its author and the school's
--     staff, and the trigger narrows that to the rule above.
--   * System clears (the accepted comment is hidden or deleted) run from other
--     triggers (pg_trigger_depth() > 1) and are always allowed: they only ever
--     clear.
--   * Accepting fires community_on_answer_accepted() (AFTER UPDATE), which
--     notifies the answer's author through #870's hook. It is the one place an
--     accepted answer "happens", so #874 adds its XP there.
--   * Un-accepting leaves the "your answer was accepted" notification alone:
--     the hook is idempotent per comment, so re-accepting never sends twice.
--
-- Deploy: apply to cloud BEFORE merging the web code — the feed selects
-- accepted_comment_id.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_post_type_check;
ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_post_type_check
  CHECK (post_type IN ('standard', 'discussion_prompt', 'milestone', 'poll', 'question'));

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS accepted_comment_id uuid
    REFERENCES public.community_comments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_accepted_is_question;
ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_accepted_is_question
  CHECK (accepted_comment_id IS NULL OR post_type = 'question');

COMMENT ON COLUMN public.community_posts.accepted_comment_id IS
  '#875: the accepted answer of a question — a visible top-level comment of this post. Set by the question''s author or the school''s staff (trigger-enforced).';
COMMENT ON COLUMN public.community_posts.accepted_by IS
  '#875: who accepted the answer. Written by the trigger (auth.uid() on the RLS path); the service role must supply it.';
COMMENT ON COLUMN public.community_posts.accepted_at IS
  '#875: when the current answer was accepted. Written by the trigger.';

-- The Unanswered / Answered filters and the teacher dashboard count.
CREATE INDEX IF NOT EXISTS idx_community_posts_questions
  ON public.community_posts (tenant_id, course_id, post_type, accepted_comment_id)
  WHERE NOT is_hidden;

-- ---------------------------------------------------------------------------
-- 2. Students may ask questions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can create posts" ON public.community_posts;
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
        post_type IN ('standard', 'poll', 'question')
        AND NOT is_graded
        AND milestone_type IS NULL
        AND milestone_data IS NULL
        AND (post_type <> 'poll' OR community_setting_on(tenant_id, 'community_student_polls'))
      )
    )
    AND community_post_target_ok(tenant_id, course_id, lesson_id)
  );

GRANT UPDATE (accepted_comment_id) ON public.community_posts TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The rule
-- ---------------------------------------------------------------------------
-- True when _user may accept answers on questions in _tenant written by
-- _author: the author, or an active teacher/admin of the school; never while
-- muted, never on a plan without the community.
CREATE OR REPLACE FUNCTION public.community_can_accept_answer(_tenant uuid, _author uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _user IS NOT NULL
     AND public.community_enabled(_tenant)
     AND NOT public.community_is_muted(_tenant, _user)
     AND (
       _user = _author
       OR EXISTS (
         SELECT 1 FROM public.tenant_users tu
          WHERE tu.tenant_id = _tenant
            AND tu.user_id = _user
            AND tu.status = 'active'
            AND tu.role IN ('teacher', 'admin')
       )
     );
$$;

COMMENT ON FUNCTION public.community_can_accept_answer(uuid, uuid, uuid) IS
  '#875: _user may accept/un-accept answers on a question by _author in _tenant (the author or active staff; not muted; plan has the community).';

CREATE OR REPLACE FUNCTION public.community_guard_accepted_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.accepted_comment_id IS NOT NULL THEN
      RAISE EXCEPTION 'community_accept_invalid_comment' USING ERRCODE = '23514',
        DETAIL = 'A new post has no comments to accept.';
    END IF;
    NEW.accepted_by := NULL;
    NEW.accepted_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.accepted_comment_id IS NOT DISTINCT FROM OLD.accepted_comment_id THEN
    -- Nothing changed; keep the record of who accepted it.
    NEW.accepted_by := OLD.accepted_by;
    NEW.accepted_at := OLD.accepted_at;
    RETURN NEW;
  END IF;

  -- A clear fired by another trigger (the accepted comment was hidden or
  -- deleted — the FK's SET NULL is a trigger too).
  IF pg_trigger_depth() > 1 AND NEW.accepted_comment_id IS NULL THEN
    NEW.accepted_by := NULL;
    NEW.accepted_at := NULL;
    RETURN NEW;
  END IF;

  -- The RLS path acts as the JWT's user, whatever it wrote into accepted_by.
  -- The service role (no auth.uid()) must say who is acting.
  v_actor := coalesce(auth.uid(), NEW.accepted_by);

  IF NOT public.community_can_accept_answer(OLD.tenant_id, OLD.author_id, v_actor) THEN
    RAISE EXCEPTION 'community_accept_not_allowed' USING ERRCODE = '42501',
      DETAIL = 'Only the question''s author or the school''s teachers and admins can accept an answer.';
  END IF;

  IF NEW.accepted_comment_id IS NULL THEN
    NEW.accepted_by := NULL;
    NEW.accepted_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.post_type <> 'question' OR NEW.is_hidden THEN
    RAISE EXCEPTION 'community_accept_not_a_question' USING ERRCODE = '23514',
      DETAIL = 'Only a visible question can have an accepted answer.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_comments c
     WHERE c.id = NEW.accepted_comment_id
       AND c.post_id = NEW.id
       AND c.tenant_id = NEW.tenant_id
       AND c.parent_comment_id IS NULL
       AND NOT c.is_hidden
  ) THEN
    RAISE EXCEPTION 'community_accept_invalid_comment' USING ERRCODE = '23514',
      DETAIL = 'The answer must be a visible top-level comment of this question.';
  END IF;

  NEW.accepted_by := v_actor;
  NEW.accepted_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_guard_accepted_answer ON public.community_posts;
CREATE TRIGGER trg_community_guard_accepted_answer
  BEFORE INSERT OR UPDATE OF accepted_comment_id ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.community_guard_accepted_answer();

-- ---------------------------------------------------------------------------
-- 4. A hidden answer is no longer the accepted one
-- ---------------------------------------------------------------------------
-- Hard deletes are the FK's ON DELETE SET NULL. Un-hiding restores nothing.
CREATE OR REPLACE FUNCTION public.community_clear_hidden_accepted_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.community_posts p
     SET accepted_comment_id = NULL
   WHERE p.id = NEW.post_id
     AND p.accepted_comment_id = NEW.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_clear_hidden_accepted_answer ON public.community_comments;
CREATE TRIGGER trg_community_clear_hidden_accepted_answer
  AFTER UPDATE OF is_hidden ON public.community_comments
  FOR EACH ROW
  WHEN (NEW.is_hidden AND NOT OLD.is_hidden AND NEW.parent_comment_id IS NULL)
  EXECUTE FUNCTION public.community_clear_hidden_accepted_answer();

-- ---------------------------------------------------------------------------
-- 5. An answer was accepted
-- ---------------------------------------------------------------------------
-- The single place an accepted answer "happens": the notification (#870)
-- today, the helper's XP (#874) next. Each consequence must never undo the
-- accept — #870's hook already swallows its own errors.
CREATE OR REPLACE FUNCTION public.community_on_answer_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.community_notify_answer_accepted(NEW.accepted_comment_id, NEW.accepted_by);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_on_answer_accepted ON public.community_posts;
CREATE TRIGGER trg_community_on_answer_accepted
  AFTER UPDATE OF accepted_comment_id ON public.community_posts
  FOR EACH ROW
  WHEN (NEW.accepted_comment_id IS NOT NULL
        AND NEW.accepted_comment_id IS DISTINCT FROM OLD.accepted_comment_id)
  EXECUTE FUNCTION public.community_on_answer_accepted();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Supabase grants EXECUTE on new public functions to anon and authenticated;
-- none of these is a client API (the predicate would let a member probe
-- mutes and roles).
REVOKE ALL ON FUNCTION public.community_can_accept_answer(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_guard_accepted_answer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_clear_hidden_accepted_answer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_on_answer_accepted() FROM PUBLIC, anon, authenticated;
