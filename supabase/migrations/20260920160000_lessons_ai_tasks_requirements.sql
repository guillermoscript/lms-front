-- Structured AI-task requirements (#806).
--
-- Today the tutor's whole brief lives as free text in `system_prompt` /
-- `task_instructions`. This adds an optional structured alternative: level,
-- scenario, tutor role, an ordered requirement list, an optional closing
-- phase, and a per-task minimum student turns.
--
-- Nullable by design — this is the compatibility contract the app code relies
-- on: `requirements IS NULL` means an existing task keeps behaving exactly as
-- before (prompt assembled from `task_instructions` / `system_prompt`). Only
-- a non-NULL, schema-valid value switches a task to the platform-assembled
-- structured prompt.
ALTER TABLE lessons_ai_tasks
  ADD COLUMN IF NOT EXISTS requirements JSONB;

COMMENT ON COLUMN lessons_ai_tasks.requirements IS
  'Structured task config (#806): { level, scenario, tutor_role, requirements: [{id, text}], closing_phase?, min_student_turns }. NULL = free-text task (task_instructions/system_prompt). Validated in app code (lib/ai/lesson-requirements.ts), not by a DB constraint, so an old row never fails a future shape change.';
