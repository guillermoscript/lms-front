-- Keyset pagination for get_daily_digest_candidates() (issue #548, epic #540 §3.5).
--
-- The digest cron reads this SETOF function across ALL tenants with a single
-- `admin.rpc(...)` call. PostgREST applies the API "Max rows" cap to function
-- results exactly as it does to tables (`supabase/config.toml:18` = 1000
-- locally; the hosted project runs the same default), and returns the capped
-- result as an ordinary 200. The function had no ORDER BY, so past 1000
-- candidates the cron silently processed an ARBITRARY — and, run to run,
-- DIFFERENT — subset. Students dropped from the read simply never got their
-- digest, and nothing anywhere reported a problem.
--
-- `fetchAllRows` cannot rescue this from the caller side: `.range()` on an
-- unordered set is not a stable window, and the helper's completeness
-- assertion needs an exact count that a SETOF function does not provide.
-- Pagination has to live in the function.
--
-- Keyset, not LIMIT/OFFSET. The candidate set is computed live from
-- review_cards / study_goals / gamification_profiles, so it shifts under a
-- sweep that takes several seconds; OFFSET over a shifting set skips and
-- repeats rows. A keyset cursor on (tenant_id, user_id) — UNIQUE via
-- tenant_users_unique, so a total order with no ties — is stable regardless:
-- each page resumes strictly after the last row the caller actually saw.
--
-- The signature change is compatible: every parameter has a default, so the
-- existing zero-argument call still resolves and returns the first page.

-- Dropped rather than replaced: adding defaulted parameters to a live function
-- creates an OVERLOAD, and a zero-arg call against both candidates is
-- ambiguous (PostgREST would 300).
DROP FUNCTION IF EXISTS public.get_daily_digest_candidates();

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
    last_activity_date date
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
        gp.last_activity_date
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
    WHERE tu.role = 'student'
      AND tu.status = 'active'
      AND (
        COALESCE(rc.due_count, 0) > 0
        OR COALESCE(sg.pending_count, 0) > 0
        OR (COALESCE(gp.current_streak, 0) >= 3
            AND gp.last_activity_date = CURRENT_DATE - 1)
      )
      -- Cursor. NULL _after_tenant_id means "from the beginning"; the COALESCE
      -- keeps a caller that passes only the tenant half from silently getting
      -- an empty page (row comparison against NULL is NULL, not false).
      AND (
        _after_tenant_id IS NULL
        OR (tu.tenant_id, tu.user_id)
             > (_after_tenant_id, COALESCE(_after_user_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    -- Load-bearing, not cosmetic: this is what makes the cursor above mean
    -- anything. Without it the "next" page is unrelated to the previous one.
    ORDER BY tu.tenant_id, tu.user_id
    -- Clamped: a caller asking for more than the API cap would get a silently
    -- truncated page back, which is the bug this migration exists to remove.
    -- 1000 is the ceiling the caller can rely on receiving in full.
    LIMIT LEAST(GREATEST(COALESCE(_limit, 500), 1), 1000);
$$;

-- Service-role only, unchanged: the function reads auth.users and crosses tenants.
REVOKE ALL ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) TO service_role;

COMMENT ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) IS
    'Daily-digest candidates, keyset-paginated on (tenant_id, user_id). Callers must page '
    'until an empty result: a short page may be the PostgREST row cap, not the end of the set (#548).';
