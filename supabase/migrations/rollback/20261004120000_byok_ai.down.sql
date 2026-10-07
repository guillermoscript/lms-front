-- Rollback for 20261004120000_byok_ai.sql
-- The platform_plans -1 AI-chat limits are NOT restored (original numbers lived
-- in 20260920180000_backfill_ai_chat_usage_limits.sql; re-run it if needed).

drop function if exists public.tenant_ai_configured(uuid);

alter table public.course_ai_tutors
  drop constraint if exists course_ai_tutors_provider_model_pair,
  drop column if exists provider,
  drop column if exists model;

drop table if exists public.tenant_ai_audit;
drop table if exists public.tenant_ai_feature_models;
drop table if exists public.tenant_ai_settings;
drop table if exists public.tenant_ai_credentials;
