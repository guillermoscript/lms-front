-- =============================================================================
-- Daily digest candidates: stop pre-filtering streak risk on the UTC day
-- Issue #549 §3 (epic #540).
--
-- The streak-at-risk branch tested `gp.last_activity_date = CURRENT_DATE - 1`,
-- i.e. UTC yesterday, while the send decision and the idempotency key in
-- lib/notifications/daily-digest.ts are both TENANT-LOCAL. Whenever
-- nudge_hour + |utc_offset| >= 24 the two disagree by a day — which is every
-- evening send in the UTC-5 markets this product targets (Bogota, Lima): the
-- 20:00 local nudge runs at 01:00 UTC the next UTC day.
--
-- This function cannot make the decision correctly, because it does not know
-- the tenant's timezone (that lives in tenant_settings.daily_digest and is
-- resolved per-tenant by the cron). Its job is to be a cheap superset. An
-- equality on the UTC day is not a superset — it excludes exactly the students
-- the local-day comparison would include.
--
-- Widened to `>= CURRENT_DATE - 2`, which covers local-yesterday for every
-- offset in the UTC-12..UTC+14 range, and the precise call is left to
-- isStreakAtRisk(), which does know the timezone. Rows that turn out not to be
-- at risk are dropped there before anything is sent.
--
-- IMPORTANT — this replaces the KEYSET-PAGINATED signature introduced by
-- 20260726140000_daily_digest_candidates_pagination.sql (issue #548), not the
-- original zero-argument one. #548 and #549 were developed in parallel and this
-- file originally re-created the zero-arg function, which would have (a) added
-- back the overload #548 deliberately dropped — a zero-arg call against both
-- candidates is ambiguous and PostgREST answers 300 — and (b) left the
-- three-argument definition the cron actually calls still carrying the UTC bug,
-- making this fix inert. The pagination logic below is carried over verbatim.
--
-- award_xp()'s own day boundary is deliberately NOT changed here: it would
-- shift every existing streak. See the note on isStreakAtRisk().
-- =============================================================================

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
        -- Superset of "streak at risk" across all tenant timezones; the exact
        -- local-day comparison happens in isStreakAtRisk(). Was
        -- `= CURRENT_DATE - 1` (issue #549 §3).
        OR (COALESCE(gp.current_streak, 0) >= 3
            AND gp.last_activity_date >= CURRENT_DATE - 2)
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

-- Service-role only: the function reads auth.users and crosses tenants.
REVOKE ALL ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_digest_candidates(uuid, uuid, integer) TO service_role;
