-- Daily review-due digest + streak-at-risk nudge (issue #397).
--
-- 1. get_daily_digest_candidates(): one-round-trip aggregation the digest cron
--    calls with the service role. Returns every active student who has
--    something to say today: due review cards, incomplete study goals for the
--    current (Monday-anchored, UTC) week, or a streak at risk. Reads
--    auth.users.email so the cron never has to page the admin API.
-- 2. Seeds global (tenant_id IS NULL) notification_templates for the digest
--    and the streak nudge in en/es. Tenants can override by inserting a row
--    with the same name and their tenant_id.

CREATE OR REPLACE FUNCTION public.get_daily_digest_candidates()
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
      );
$$;

-- Service-role only: the function reads auth.users and crosses tenants.
REVOKE ALL ON FUNCTION public.get_daily_digest_candidates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_daily_digest_candidates() FROM anon;
REVOKE ALL ON FUNCTION public.get_daily_digest_candidates() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_digest_candidates() TO service_role;

-- Global digest/nudge templates ({{var}} interpolation done by the cron).
INSERT INTO notification_templates (name, title, content, category, variables, tenant_id)
SELECT v.name, v.title, v.content, 'system', v.variables, NULL
FROM (VALUES
    ('daily_digest_en',
     'Your day at {{school_name}}',
     '{{summary}}. A few minutes today keeps you on track.',
     '["school_name", "summary"]'::jsonb),
    ('daily_digest_es',
     'Tu día en {{school_name}}',
     '{{summary}}. Unos minutos hoy te mantienen al día.',
     '["school_name", "summary"]'::jsonb),
    ('streak_nudge_en',
     'Your {{streak}}-day streak ends tonight',
     '{{first_name}}, one quick practice session before the day ends keeps your {{streak}}-day streak alive.',
     '["first_name", "streak"]'::jsonb),
    ('streak_nudge_es',
     'Tu racha de {{streak}} días termina esta noche',
     '{{first_name}}, una sesión rápida de práctica antes de que termine el día mantiene viva tu racha de {{streak}} días.',
     '["first_name", "streak"]'::jsonb)
) AS v(name, title, content, variables)
WHERE NOT EXISTS (
    SELECT 1 FROM notification_templates t
    WHERE t.name = v.name AND t.tenant_id IS NULL
);
