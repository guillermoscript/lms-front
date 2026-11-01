-- Challenge groups, Phase 1 (epic #1049, issue #1050): permanent friend groups
-- inside ONE tenant, launched challenges and a group leaderboard.
--
-- No attempt storage is duplicated: a group challenge is a challenge_link
-- (challenge_group_challenges.link_id) and the leaderboard is derived from
-- challenge_attempts (official attempts of members on the group's exercises,
-- plus unclaimed guests who played through the group's links).
--
-- Tenant settings (tenant_settings rows; no schema change):
--   challenges_groups_enabled  jsonb {enabled:boolean} or boolean. MISSING = ON
--                    when challenges_enabled is on; an explicit false switches
--                    groups off for the school (teacher/admin switch).
--
-- All three tables are server-write AND server-read (admin client), like
-- challenge_attempts: RLS on, no policies, every privilege revoked from
-- anon/authenticated. Membership/ban/tenant checks live in lib/challenges/groups.ts.

CREATE TABLE IF NOT EXISTS public.challenge_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_token text NOT NULL UNIQUE,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.challenge_group_members (
  group_id  uuid NOT NULL REFERENCES public.challenge_groups(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.challenge_group_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES public.challenge_groups(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  exercise_id bigint NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  link_id     uuid NOT NULL REFERENCES public.challenge_links(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Official attempts are one per person per exercise, so a group runs an
  -- exercise at most once.
  CONSTRAINT challenge_group_challenges_exercise_uidx UNIQUE (group_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS challenge_groups_tenant_creator_idx
  ON public.challenge_groups (tenant_id, created_by, created_at);
CREATE INDEX IF NOT EXISTS challenge_group_members_user_idx
  ON public.challenge_group_members (user_id, tenant_id);
CREATE INDEX IF NOT EXISTS challenge_group_challenges_link_idx
  ON public.challenge_group_challenges (link_id);
CREATE INDEX IF NOT EXISTS challenge_group_challenges_group_idx
  ON public.challenge_group_challenges (group_id, created_at);

ALTER TABLE public.challenge_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_group_challenges ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service role only.
REVOKE ALL ON public.challenge_groups, public.challenge_group_members, public.challenge_group_challenges
  FROM anon, authenticated;

COMMENT ON TABLE public.challenge_groups IS
  'Permanent friend groups for challenges (epic #1049). Tenant-scoped, server-only; invite_token is the secret behind /grupo/<token>.';
COMMENT ON TABLE public.challenge_group_members IS
  'Group membership. Server-only. A member must also be an active tenant member to be listed or ranked.';
COMMENT ON TABLE public.challenge_group_challenges IS
  'A challenge launched into a group: reuses challenge_links; scores come from challenge_attempts.';
