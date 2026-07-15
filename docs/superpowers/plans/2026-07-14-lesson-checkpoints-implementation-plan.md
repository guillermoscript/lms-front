# Lesson Checkpoints Implementation Plan

## Preconditions

- Follow the approved design in `docs/superpowers/specs/2026-07-14-lesson-checkpoints-design.md`.
- Preserve unrelated working-tree changes.
- Generate the schema migration with `supabase migration new`; do not hand-name migration files.

## 1. Add checkpoint persistence and tenant-safe policies

Create a migration that adds:

- `lesson_checkpoints`: tenant ID, lesson ID, exercise ID, `placement_type` (`inline`/`video`), `content_block_id` or `video_timestamp_seconds`, label, `allow_skip`, `max_ai_attempts`, `is_required`, `is_enabled`, timestamps, and uniqueness/indexes that prevent duplicate placements.
- `lesson_checkpoint_attempts`: tenant/user/course/lesson/checkpoint/exercise IDs, response/evaluation JSON, score, passed/completed status, evaluator type, attempt number, placement source, and timestamps.
- RLS policies based on `auth.uid()` and active `tenant_users` membership, matching `practice_attempts`/`exercise_evaluations`; teachers and admins read only their tenant.
- An index for learner resume (`user_id, checkpoint_id, created_at desc`), teacher analytics (`tenant_id, checkpoint_id, created_at`), and lesson loading (`lesson_id, is_enabled`).
- Numeric plan limits and tenant usage/accounting for checkpoint AI evaluations, instead of relying solely on the current boolean `ai_grading` flag.

Do not reuse `practice_attempts`: its LLM-drill-specific JSON contract and automatic XP trigger are incompatible with teacher-owned checkpoint events. Update the weak-spot/readiness read model to aggregate both tables by source.

## 2. Build teacher checkpoint CRUD and lesson-editor blocks

- Add typed checkpoint actions/routes alongside `app/actions/teacher/lessons.ts`; authenticate with `requireTeacherOrAdmin`, verify lesson/course ownership, and verify the selected exercise belongs to the same tenant/course.
- Add `checkpoint` to `components/teacher/block-editor/types.ts`, block creation, editor, renderer, serializer, and parser.
- Implement a checkpoint editor that selects an existing exercise, controls required/allow-skip/retry behavior, and shows the selected exercise’s type and AI-cost implications.
- Serialize inline placements as `<LessonCheckpoint checkpointId="…" />`; raw-MDX documentation uses the same component.
- Add a timestamp-marker editor to the lesson’s video configuration. Only offer enforced timestamp markers for YouTube, Vimeo, or native media URLs.

## 3. Load checkpoints with student lessons and render inline anchors

- Extend `app/[locale]/dashboard/student/courses/[courseId]/lessons/[lessonId]/page.tsx` to fetch enabled checkpoints, learner attempts, and linked exercise data with tenant-scoped joins.
- Pass the normalized checkpoint state through `LessonContent`.
- Register `LessonCheckpoint` in `components/lesson/mdx-components.tsx` and render an interactive client component that resumes saved state, submits an attempt, shows feedback, and exposes accessibility labels/localized copy.
- Add a per-lesson checkpoint progress indicator without changing the existing course progress calculation until lesson-completion rules have been applied.

## 4. Introduce a reusable checkpoint exercise renderer

- Implement `CheckpointExerciseRenderer` with a normalized result callback: submitted, complete/passed, score, feedback, evaluator type, and retry availability.
- Route coding, audio, video, artifact, and real-time conversation to their existing submission/evaluation flows; preserve media upload and transcription behavior.
- Add compact adapters for deterministic types (quiz/multiple choice/true-false/fill-in/matching/ordering) that grade without AI.
- Add text/essay/discussion submission adapters that call the structured AI evaluator only when their exercise configuration enables AI grading.
- Ensure direct exercise pages continue to work unchanged; the renderer is a checkpoint-specific composition layer, not a replacement for them.

## 5. Implement structured AI evaluation, quotas, and fallback

- Add `app/api/exercises/checkpoint/evaluate/route.ts` (or equivalent) using `getApiAuthContext`, Zod input validation, server-side checkpoint/exercise/tenant ownership validation, and a strict structured result schema.
- Reuse `AI_MODELS.grader`, teacher `system_prompt`, evaluation criteria, prompt-template conventions, AI feature gate, and telemetry. Do not reuse `/api/chat/lesson-task`, which is a streamed, tool-enabled conversation.
- Before invoking AI, atomically enforce per-checkpoint/student, per-student/month, and tenant/month limits. Record an attempted/consumed evaluation only after a valid evaluation request is admitted.
- On plan exclusion, quota exhaustion, or provider failure, persist the learner response with a fallback status and show deterministic reflection guidance; never strand the video or prevent a learner from continuing solely because AI is unavailable.

## 6. Add provider-aware video markers

- Replace the duplicate passive iframe logic in `LessonContent` and `components/lesson/video.tsx` with a shared `CheckpointVideoPlayer` interface.
- Implement YouTube IFrame API and Vimeo Player API adapters that report playback time, pause at an uncompleted required marker, keep marker state across seeks, and resume after the checkpoint closes.
- Implement a native `<video>` adapter for direct media URLs.
- For unsupported embed providers, present related checkpoints in their inline placement and clearly omit timestamp blocking rather than pretending it works.
- Respect reduced-motion preferences and keyboard/mobile controls.

## 7. Integrate progress, readiness, and completion

- Add checkpoint attempts to weak-spot/readiness aggregation with a distinguishable `lesson_checkpoint` source.
- Update the AI lesson-completion tool in `lib/ai/tools.ts` to query required checkpoints and reject completion until each is complete. Keep `lesson_completions` as the certificate/course-completion authority.
- Feed checkpoint scores into Aristotle’s course-progress context without allowing it to grade, award XP, or bypass checkpoint completion.
- Add teacher metric queries for completion rate, score distribution, retry rate, and AI evaluations used per checkpoint. Keep a full dashboard out of this issue; expose a lightweight summary in the lesson editor.

## 8. Localize, test, and verify

- Add English and Spanish strings for authoring, checkpoint states, AI quota/fallback, video resume, and accessibility labels.
- Unit test deterministic adapters, structured-evaluator validation, quota logic, and completion gating.
- Add Playwright coverage for inline checkpoint resume, required versus skippable behavior, YouTube/Vimeo/native fallbacks, student retries, and teacher editing.
- Test all evaluator families: deterministic, text AI, code, audio, video, artifact, and conversation.
- Run `npm run lint`, `npm run build`, targeted Playwright tests, migration verification, and Supabase security advisors before delivery.
