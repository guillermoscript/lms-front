-- Issue #807: give every plan an AI chat budget before increment_ai_chat_usage
-- (20260920170000) starts reading `max_ai_messages_per_day` /
-- `max_ai_messages_per_month`. Same reasoning as
-- 20260901170000_backfill_plan_feature_keys.sql: `tenant_plan_limit()` already
-- treats a MISSING key as -1 (unlimited), so skipping this would leave every
-- tenant unmetered rather than capped — the opposite of the closed-by-default
-- posture the rest of the plan-limit system uses. This runs first and is
-- idempotent (`||` only touches the two listed keys).
--
-- Numbers are a starting point, not a pricing decision — flagged in the PR
-- for the owner to adjust:
--   free        20 msgs/user/day ·    300 msgs/tenant/month
--   starter     40 msgs/user/day ·  2,000 msgs/tenant/month
--   pro         80 msgs/user/day · 10,000 msgs/tenant/month
--   business   150 msgs/user/day · 50,000 msgs/tenant/month
--   enterprise  unlimited (-1) ·  unlimited (-1)

UPDATE public.platform_plans
   SET limits = limits || jsonb_build_object(
         'max_ai_messages_per_day',   CASE slug
           WHEN 'free'       THEN 20
           WHEN 'starter'    THEN 40
           WHEN 'pro'        THEN 80
           WHEN 'business'   THEN 150
           WHEN 'enterprise' THEN -1
         END,
         'max_ai_messages_per_month', CASE slug
           WHEN 'free'       THEN 300
           WHEN 'starter'    THEN 2000
           WHEN 'pro'        THEN 10000
           WHEN 'business'   THEN 50000
           WHEN 'enterprise' THEN -1
         END
       )
 WHERE slug IN ('free', 'starter', 'pro', 'business', 'enterprise');

-- Any plan row outside the five known slugs (none today) gets the free
-- defaults rather than nothing, so a lookup on the new keys still has an
-- answer instead of falling through to "unlimited".
UPDATE public.platform_plans
   SET limits = jsonb_build_object(
         'max_ai_messages_per_day', 20, 'max_ai_messages_per_month', 300
       ) || limits
 WHERE slug NOT IN ('free', 'starter', 'pro', 'business', 'enterprise');
