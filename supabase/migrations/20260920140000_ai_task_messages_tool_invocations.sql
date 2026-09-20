-- `lessons_ai_task_messages.tool_invocations` was declared in
-- 20260131190000_create_ai_task_tables.sql, but that migration ran
-- `CREATE TABLE IF NOT EXISTS` against a table the base schema dump
-- (20260126190500_lms_complete.sql) had already created without it — the
-- column never actually existed. `markLessonCompleted`'s feedback and the
-- verifier's per-requirement verdict were computed and shown once in the
-- stream, then discarded: a reload lost the "Target achieved" card and a
-- teacher had no way to see why a lesson was granted (#805).

ALTER TABLE public.lessons_ai_task_messages
  ADD COLUMN IF NOT EXISTS tool_invocations jsonb;

COMMENT ON COLUMN public.lessons_ai_task_messages.tool_invocations IS
  'Tool calls made in this assistant turn, e.g. [{version, toolName, toolCallId, input, output}] for markLessonCompleted (output carries the tutor''s feedback and the verifier''s requirementsCheck). NULL when the turn made no tool call. See lib/ai/lesson-task-history.ts for the reader, which also tolerates the pre-#805 {toolInvocation} shape.';
