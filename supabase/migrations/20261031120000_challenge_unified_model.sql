-- Challenges F1 (unified attempt model).
--  1. challenge_attempts.rubric_version: fingerprint of the rubric a score was
--     graded against (TS: rubricVersion() in lib/challenges/grade.ts). Nullable:
--     older attempts have none. The app tolerates this column being absent.
--  2. get_challenge_ranking: the caller must be allowed to see the exercise's
--     COURSE (active entitlement via has_course_access, or staff of the tenant,
--     or the course author) instead of being any active member of the tenant.
--  3. display_name is NULL when the profile has no name; the app localizes the
--     label (no hardcoded 'Estudiante' in SQL).

ALTER TABLE public.challenge_attempts
  ADD COLUMN IF NOT EXISTS rubric_version text;

COMMENT ON COLUMN public.challenge_attempts.rubric_version IS
  'Short hash of the resolved rubric (ids, descriptions, weights) the score was computed against.';

-- Return type is unchanged, so CREATE OR REPLACE is enough.
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
    NULLIF(
      split_part(btrim(p.full_name), ' ', 1)
      || CASE
           WHEN position(' ' IN btrim(p.full_name)) > 0
           THEN ' ' || upper(left(
                  regexp_replace(btrim(p.full_name), '^.*\s', ''), 1)) || '.'
           ELSE ''
         END,
      ''
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
    -- Ranked users must still be active members of the tenant.
    AND EXISTS (
      SELECT 1 FROM public.tenant_users r
      WHERE r.tenant_id = a.tenant_id AND r.user_id = a.user_id AND r.status = 'active'
    )
    -- Caller: entitled to the course, or staff of the tenant, or its author.
    AND (
      public.has_course_access(auth.uid(), e.course_id::integer)
      OR EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.tenant_id = a.tenant_id
          AND tu.user_id = auth.uid()
          AND tu.status = 'active'
          AND tu.role::text IN ('admin', 'teacher')
      )
      OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.course_id = e.course_id AND c.author_id = auth.uid()
      )
    )
  ORDER BY a.score DESC, a.created_at ASC, a.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_challenge_ranking(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_challenge_ranking(bigint) TO authenticated;

COMMENT ON FUNCTION public.get_challenge_ranking(bigint) IS
  'Official claimed challenge attempts for an exercise, score desc then earliest. Caller must hold course access (entitlement), be tenant staff, or be the course author. display_name is NULL without a profile name; no emails.';
