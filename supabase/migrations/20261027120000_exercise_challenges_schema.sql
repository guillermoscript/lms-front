-- Exercise challenges (epic #1025, WS1 #1026): shareable duels + per-exercise
-- ranking inside a tenant. This migration is the shared schema contract.
--
-- Tenant settings (tenant_settings rows, setting_value jsonb; no schema change):
--   challenges_enabled           jsonb boolean. MISSING ROW = OFF. The tenant's
--                                BYOK key pays for AI grading, so it is opt-in.
--   challenges_guest_monthly_cap jsonb integer. Max official GUEST attempts per
--                                calendar month for the tenant; when hit, the
--                                challenge shows "reto pausado". Missing = the
--                                application default (WS7).
--
-- Both tables are server-write only (admin client / SECURITY DEFINER), like
-- `transactions`: RLS is on with NO policies for client roles and every table
-- privilege is revoked from anon/authenticated. Tenant members read ranking
-- data only through get_challenge_ranking(), which never exposes emails.
-- Challenge attempts never touch exercise_completions, XP or entitlements.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS is_challengeable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.exercises.is_challengeable IS
  'Staff opt-in: this exercise can be played as a public challenge (also requires tenant_settings.challenges_enabled).';

CREATE TABLE IF NOT EXISTS public.challenge_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  exercise_id      bigint NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  token            text NOT NULL UNIQUE,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_attempt_id uuid,  -- FK added below (tables reference each other)
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.challenge_attempts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  exercise_id      bigint NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  link_id          uuid REFERENCES public.challenge_links(id) ON DELETE SET NULL,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_token_hash text,
  ip_hash          text NOT NULL,
  answer           jsonb NOT NULL,
  score            integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed           boolean NOT NULL,
  feedback         jsonb,
  is_official      boolean NOT NULL DEFAULT false,
  graded_at        timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- A guest attempt is identified by its token; a claimed one by its user.
  -- (Claiming sets user_id and may keep guest_token_hash.)
  CONSTRAINT challenge_attempts_identity CHECK (user_id IS NOT NULL OR guest_token_hash IS NOT NULL)
);

ALTER TABLE public.challenge_links
  DROP CONSTRAINT IF EXISTS challenge_links_owner_attempt_fk;
ALTER TABLE public.challenge_links
  ADD CONSTRAINT challenge_links_owner_attempt_fk
  FOREIGN KEY (owner_attempt_id) REFERENCES public.challenge_attempts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS challenge_links_exercise_idx
  ON public.challenge_links (tenant_id, exercise_id);
CREATE INDEX IF NOT EXISTS challenge_links_created_by_idx
  ON public.challenge_links (created_by) WHERE created_by IS NOT NULL;

-- One official attempt per person per exercise (first attempt counts; retries are practice).
CREATE UNIQUE INDEX IF NOT EXISTS challenge_attempts_official_user_uidx
  ON public.challenge_attempts (tenant_id, exercise_id, user_id)
  WHERE is_official AND user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS challenge_attempts_official_guest_uidx
  ON public.challenge_attempts (tenant_id, exercise_id, guest_token_hash)
  WHERE is_official AND guest_token_hash IS NOT NULL;

-- Ranking: score desc, earliest first.
CREATE INDEX IF NOT EXISTS challenge_attempts_ranking_idx
  ON public.challenge_attempts (tenant_id, exercise_id, score DESC, created_at);
-- Per-IP hourly cap and guest monthly cap lookups (WS7).
CREATE INDEX IF NOT EXISTS challenge_attempts_ip_idx
  ON public.challenge_attempts (tenant_id, ip_hash, created_at);
CREATE INDEX IF NOT EXISTS challenge_attempts_user_idx
  ON public.challenge_attempts (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS challenge_attempts_link_idx
  ON public.challenge_attempts (link_id) WHERE link_id IS NOT NULL;

ALTER TABLE public.challenge_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_attempts ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service role / SECURITY DEFINER only.
REVOKE ALL ON public.challenge_links, public.challenge_attempts FROM anon, authenticated;

COMMENT ON TABLE public.challenge_links IS
  'Public share links for exercise challenges. Server-write only; no client policies.';
COMMENT ON TABLE public.challenge_attempts IS
  'Graded challenge attempts (guest or member). Server-write only; read via get_challenge_ranking().';

-- Ranking for one exercise inside the caller's tenant: official attempts that
-- belong to a user (claimed guests included; unclaimed guests have no user_id).
-- Display name = first name + last initial. Never returns emails.
CREATE OR REPLACE FUNCTION public.get_challenge_ranking(_exercise_id bigint)
RETURNS TABLE (
  rank bigint,
  user_id uuid,
  display_name text,
  score integer,
  passed boolean,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    row_number() OVER (ORDER BY a.score DESC, a.created_at ASC, a.id) AS rank,
    a.user_id,
    COALESCE(
      NULLIF(
        split_part(btrim(p.full_name), ' ', 1)
        || CASE
             WHEN position(' ' IN btrim(p.full_name)) > 0
             THEN ' ' || upper(left(
                    regexp_replace(btrim(p.full_name), '^.*\s', ''), 1)) || '.'
             ELSE ''
           END,
        ''),
      'Estudiante'
    ) AS display_name,
    a.score,
    a.passed,
    a.created_at
  FROM public.challenge_attempts a
  JOIN public.exercises e ON e.id = a.exercise_id AND e.tenant_id = a.tenant_id
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.exercise_id = _exercise_id
    AND a.is_official
    AND a.user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = a.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.status = 'active'
    )
  ORDER BY a.score DESC, a.created_at ASC, a.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_challenge_ranking(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_challenge_ranking(bigint) TO authenticated;

COMMENT ON FUNCTION public.get_challenge_ranking(bigint) IS
  'Official claimed challenge attempts for an exercise, score desc then earliest. Caller must be an active member of the exercise tenant. Names are first name + initial; no emails.';
