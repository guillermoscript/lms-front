-- Advisor follow-ups for 20261024120000_ai_evals_lesson_task:
-- pin the snapshot helper's search_path, and keep the SECURITY DEFINER trigger
-- functions out of the client API (triggers fire without EXECUTE).

ALTER FUNCTION public.lesson_task_config_snapshot(text, text, jsonb) SET search_path TO '';

REVOKE EXECUTE ON FUNCTION public.trg_lessons_ai_tasks_version() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_lessons_ai_task_messages_version() FROM PUBLIC, anon, authenticated;
