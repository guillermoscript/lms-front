-- Rollback for 20261006130000_ai_image_usage.sql
drop function if exists public.release_ai_image_generation(uuid, uuid);
drop function if exists public.reserve_ai_image_generation(uuid, uuid, integer, integer);
drop table if exists public.ai_image_usage;
