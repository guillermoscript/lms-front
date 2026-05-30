-- Stop handle_new_subscription from auto-enrolling.
--
-- Post-entitlements-migration, a subscription grants ACCESS via `entitlements`;
-- the student then self-enrolls in the courses they actually want via the
-- `/browse` flow (self_enroll_subscription_course RPC), which writes the
-- `enrollments` learning record. But handle_new_subscription still looped
-- plan_courses and inserted an `enrollments` row for EVERY course in the plan —
-- pre-filling "My Courses" with the whole plan catalog and defeating the
-- deliberate self-enroll design (and CLAUDE.md's stated model).
--
-- This recreates the function identically EXCEPT it no longer writes
-- `enrollments`. It still grants one `entitlements` row per plan course (access),
-- and remains renewal-aware (GREATEST(existing_end, now) + duration).

create or replace function public.handle_new_subscription(
  _user_id uuid,
  _plan_id integer,
  _transaction_id integer,
  _start_date timestamp with time zone default now()
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
    _duration INTERVAL;
    _end_date TIMESTAMP WITH TIME ZONE;
    _existing_end TIMESTAMP WITH TIME ZONE;
    _tenant_id UUID;
    _subscription_id INTEGER;
    _rec RECORD;
BEGIN
    SELECT make_interval(days => p.duration_in_days), p.tenant_id INTO _duration, _tenant_id
    FROM plans p WHERE p.plan_id = _plan_id;
    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'Plan % not found', _plan_id;
    END IF;
    SELECT end_date INTO _existing_end FROM subscriptions WHERE user_id = _user_id AND plan_id = _plan_id;
    _end_date := GREATEST(COALESCE(_existing_end, _start_date), _start_date) + _duration;
    INSERT INTO subscriptions (user_id, plan_id, start_date, end_date, transaction_id, subscription_status, tenant_id)
    VALUES (_user_id, _plan_id, _start_date, _end_date, _transaction_id, 'active', _tenant_id)
    ON CONFLICT (user_id, plan_id) DO UPDATE SET
        end_date = EXCLUDED.end_date, transaction_id = EXCLUDED.transaction_id,
        subscription_status = 'active', tenant_id = EXCLUDED.tenant_id, ended_at = NULL
    RETURNING subscription_id INTO _subscription_id;
    -- Grant access only. Enrollment is the student's explicit choice (self-enroll
    -- via /browse), NOT auto-created here.
    FOR _rec IN SELECT pc.course_id FROM plan_courses pc WHERE pc.plan_id = _plan_id
    LOOP
        INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, expires_at)
        VALUES (_user_id, _rec.course_id, _tenant_id, 'subscription', _subscription_id, 'active', _end_date)
        ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET
            status = 'active', expires_at = EXCLUDED.expires_at, revoked_at = NULL, tenant_id = EXCLUDED.tenant_id;
    END LOOP;
END;
$function$;
