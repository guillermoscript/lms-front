-- Rollback for 20261031120000_challenge_unified_model.sql: restores the
-- tenant-membership gate and the 'Estudiante' fallback, drops rubric_version.
CREATE OR REPLACE FUNCTION public.get_challenge_ranking(_exercise_id bigint)
RETURNS TABLE (rank bigint, user_id uuid, display_name text, score integer, passed boolean, created_at timestamptz)
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
             THEN ' ' || upper(left(regexp_replace(btrim(p.full_name), '^.*\s', ''), 1)) || '.'
             ELSE ''
           END,
        ''),
      'Estudiante'
    ) AS display_name,
    a.score, a.passed, a.created_at
  FROM public.challenge_attempts a
  JOIN public.exercises e ON e.id = a.exercise_id AND e.tenant_id = a.tenant_id
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.exercise_id = _exercise_id
    AND a.is_official
    AND a.user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = a.tenant_id AND tu.user_id = auth.uid() AND tu.status = 'active'
    )
  ORDER BY a.score DESC, a.created_at ASC, a.id;
$$;
ALTER TABLE public.challenge_attempts DROP COLUMN IF EXISTS rubric_version;
