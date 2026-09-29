-- Issue #874 (epic #867): XP for community participation.
--
-- Posting, answering a prompt, being found helpful and having an answer
-- accepted earned nothing, so leagues and leaderboards ignored the most social
-- learning behaviour. Every rule below rewards helping others, not volume:
--
--   action                      XP   limit                      reference_id
--   community_prompt_answer     15   once per prompt            prompt post id
--   community_post               5   3 per UTC day              post id
--   community_comment            3   10 per UTC day             comment id
--   community_helpful_received   2   20 per UTC day, never self <target id>:<reactor id>
--   community_answer_accepted   25   once per question          question post id
--   community_prompt_graded     20   once per prompt            prompt post id  (#873 fires it)
--
--   * Only the database awards. SECURITY DEFINER triggers on the host rows, so
--     the web, the native app and the MCP server all earn the same way and no
--     client can call the award.
--   * community_award_xp() is the one entry point: it applies the rule from
--     community_xp_rule(), holds a per-(user, action) advisory lock so two
--     racing inserts cannot both slip under a cap, and calls
--     award_xp(..., _tenant_id) with the host row's school.
--   * Daily caps count gamification_xp_transactions rows for
--     (user, action_type, tenant) since UTC midnight — one clock for every
--     school, whatever the student's timezone.
--   * "Once" rules key on reference_id, not the comment: the first top-level
--     comment on a prompt earns 15 and a delete + repost finds the prompt's row
--     already there. A prompt answer earns instead of the 3 comment XP, not on
--     top of it, and does not use up the daily comment cap.
--   * "Helpful" keys on the (target, reactor) pair, so toggling the reaction
--     off and on never earns twice. like/insightful/fire earn nothing.
--   * Posts earn only in a course feed (course_id set); polls and milestone
--     posts never earn. Content inserted hidden never earns.
--   * An accepted answer earns its author 25 once per question — the first
--     answer accepted, whoever accepted it — and never when the asker answered
--     their own question.
--   * Deleting or hiding content later does not take XP back (v1).
--   * Each award is wrapped in EXCEPTION WHEN OTHERS -> RAISE WARNING: XP is a
--     consequence of posting, never a reason posting fails.
--   * Leagues and leaderboards sum gamification_xp_transactions without
--     filtering action_type, so these rows count toward weekly XP as they are.
--
-- Deploy: apply to cloud BEFORE merging the web code (the actions read the XP
-- rows back to show the "+N XP" toast; without the migration they just show
-- nothing).

-- ---------------------------------------------------------------------------
-- 1. The rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_xp_rule(
  _action text,
  OUT xp integer,
  OUT daily_cap integer,
  OUT once boolean
)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT r.xp, r.daily_cap, r.once
    FROM (VALUES
      ('community_prompt_answer',    15, NULL::integer, true),
      ('community_post',              5, 3,             false),
      ('community_comment',           3, 10,            false),
      ('community_helpful_received',  2, 20,            true),
      ('community_answer_accepted',  25, NULL::integer, true),
      ('community_prompt_graded',    20, NULL::integer, true)
    ) AS r(action, xp, daily_cap, once)
   WHERE r.action = _action;
$$;

COMMENT ON FUNCTION public.community_xp_rule(text) IS
  '#874: XP amount, daily cap (UTC day, NULL = none) and once-per-reference flag for each community XP action type. The registry of community action types.';

-- ---------------------------------------------------------------------------
-- 2. The award
-- ---------------------------------------------------------------------------
-- Returns the XP awarded (0 when a cap or a "once" rule refused it).
CREATE OR REPLACE FUNCTION public.community_award_xp(
  _user_id uuid,
  _tenant_id uuid,
  _action text,
  _reference_id text,
  _reference_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
-- award_xp() names its tables unqualified and has no search_path of its own,
-- so it runs on this one: keep public here (everything below is qualified).
SET search_path = public
AS $$
DECLARE
  v_rule record;
  v_count integer;
BEGIN
  SELECT * INTO v_rule FROM public.community_xp_rule(_action);
  IF v_rule.xp IS NULL THEN
    RAISE EXCEPTION 'community_xp_unknown_action: %', _action;
  END IF;
  IF _user_id IS NULL OR _tenant_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Serialise this user's awards of this action so the cap/once checks below
  -- see each other's rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _action, 874));

  IF v_rule.once THEN
    IF EXISTS (
      SELECT 1 FROM public.gamification_xp_transactions x
       WHERE x.user_id = _user_id
         AND x.tenant_id = _tenant_id
         AND x.action_type = _action
         AND x.reference_id = _reference_id
    ) THEN
      RETURN 0;
    END IF;
  END IF;

  IF v_rule.daily_cap IS NOT NULL THEN
    SELECT count(*) INTO v_count
      FROM public.gamification_xp_transactions x
     WHERE x.user_id = _user_id
       AND x.tenant_id = _tenant_id
       AND x.action_type = _action
       AND x.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    IF v_count >= v_rule.daily_cap THEN
      RETURN 0;
    END IF;
  END IF;

  PERFORM public.award_xp(_user_id, _action, v_rule.xp, _reference_id, _reference_type, _tenant_id);
  RETURN v_rule.xp;
END;
$$;

COMMENT ON FUNCTION public.community_award_xp(uuid, uuid, text, text, text) IS
  '#874: award a community XP action per community_xp_rule() (daily cap per UTC day, once per reference_id). Trigger-only; not a client API.';

-- ---------------------------------------------------------------------------
-- 3. Posts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_xp_on_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    IF NEW.course_id IS NOT NULL
       AND NOT NEW.is_hidden
       AND NEW.post_type IN ('standard', 'question', 'discussion_prompt') THEN
      PERFORM public.community_award_xp(
        NEW.author_id, NEW.tenant_id, 'community_post', NEW.id::text, 'community_post');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'community_xp_on_post failed for post %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_xp_on_post ON public.community_posts;
CREATE TRIGGER trg_community_xp_on_post
  AFTER INSERT ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.community_xp_on_post();

-- ---------------------------------------------------------------------------
-- 4. Comments and prompt answers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_xp_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post_type text;
BEGIN
  BEGIN
    IF NOT NEW.is_hidden THEN
      SELECT p.post_type INTO v_post_type
        FROM public.community_posts p
       WHERE p.id = NEW.post_id;

      IF NEW.parent_comment_id IS NULL
         AND v_post_type = 'discussion_prompt'
         AND public.community_award_xp(
               NEW.author_id, NEW.tenant_id, 'community_prompt_answer',
               NEW.post_id::text, 'community_post') > 0 THEN
        NULL; -- the prompt answer replaces the comment XP
      ELSE
        PERFORM public.community_award_xp(
          NEW.author_id, NEW.tenant_id, 'community_comment', NEW.id::text, 'community_comment');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'community_xp_on_comment failed for comment %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_xp_on_comment ON public.community_comments;
CREATE TRIGGER trg_community_xp_on_comment
  AFTER INSERT ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.community_xp_on_comment();

-- ---------------------------------------------------------------------------
-- 5. Helpful reactions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_xp_on_helpful()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_author uuid;
  v_target uuid;
  v_type text;
BEGIN
  BEGIN
    IF NEW.post_id IS NOT NULL THEN
      SELECT p.author_id INTO v_author FROM public.community_posts p
       WHERE p.id = NEW.post_id AND p.tenant_id = NEW.tenant_id;
      v_target := NEW.post_id;
      v_type := 'community_post';
    ELSE
      SELECT c.author_id INTO v_author FROM public.community_comments c
       WHERE c.id = NEW.comment_id AND c.tenant_id = NEW.tenant_id;
      v_target := NEW.comment_id;
      v_type := 'community_comment';
    END IF;

    IF v_author IS NOT NULL AND v_author <> NEW.user_id THEN
      PERFORM public.community_award_xp(
        v_author, NEW.tenant_id, 'community_helpful_received',
        v_target::text || ':' || NEW.user_id::text, v_type);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'community_xp_on_helpful failed for reaction %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_xp_on_helpful ON public.community_reactions;
CREATE TRIGGER trg_community_xp_on_helpful
  AFTER INSERT ON public.community_reactions
  FOR EACH ROW
  WHEN (NEW.reaction_type = 'helpful')
  EXECUTE FUNCTION public.community_xp_on_helpful();

-- ---------------------------------------------------------------------------
-- 6. Accepted answers (extends #875's single "an answer was accepted" hook)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_on_answer_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_answer_author uuid;
BEGIN
  PERFORM public.community_notify_answer_accepted(NEW.accepted_comment_id, NEW.accepted_by);

  -- #874: the helper earns XP, once per question, never for answering yourself.
  BEGIN
    SELECT c.author_id INTO v_answer_author
      FROM public.community_comments c
     WHERE c.id = NEW.accepted_comment_id;

    IF v_answer_author IS NOT NULL AND v_answer_author <> NEW.author_id THEN
      PERFORM public.community_award_xp(
        v_answer_author, NEW.tenant_id, 'community_answer_accepted',
        NEW.id::text, 'community_post');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'community_on_answer_accepted XP failed for post %: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- None of these is a client API: community_award_xp would let a member mint XP.
REVOKE ALL ON FUNCTION public.community_xp_rule(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_award_xp(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_xp_on_post() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_xp_on_comment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_xp_on_helpful() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_on_answer_accepted() FROM PUBLIC, anon, authenticated;
