# Lesson Checkpoints Design

## Purpose

Extend issue #392 from video-only, deterministic retrieval questions into reusable inline lesson checkpoints. A checkpoint presents an existing exercise at a specific video timestamp or directly after a selected lesson-content block. It gives students timely practice and feedback, contributes to lesson progress, and records performance for weak spots, readiness, and teacher insight.

The existing end-of-lesson AI task remains separate: it is an open-ended synthesis and reflection activity, while checkpoints are short, content-specific retrieval practice.

## Scope

- Support checkpoints in video, text, audio, and mixed-media lessons.
- Reuse every existing exercise type and its established renderer: deterministic quiz types, free text, code, audio/video evaluation, conversations, artifacts, matching, ordering, and future types.
- Add bounded, structured AI evaluation for exercise types that need it.
- Persist checkpoint context and outcomes so they feed progress and learning insights.
- Give teachers a simple editor for placement and behavior, plus basic performance metrics.

AI transcript question generation and a dedicated analytics dashboard remain follow-up work.

## Architecture

Create a tenant-scoped `lesson_checkpoints` record that links an existing exercise to one lesson. It owns only placement and checkpoint behavior:

- video timestamp or an inline content-block anchor;
- display label;
- whether the learner may skip the checkpoint;
- optional retry limit;
- enabled state.

Exercises remain the source of truth for question content, exercise type, grading rules, and renderer. An exercise may be linked to more than one checkpoint; each checkpoint has independent attempt history and metrics.

The current lesson player has two video paths: the lesson-level `video_url` iframe rendered by `LessonContent`, and MDX `<Video>` blocks. Both are currently passive YouTube/Vimeo iframes, so neither can observe playback time or reliably pause. Replace their shared embed behavior with a provider-aware `CheckpointVideoPlayer`: YouTube IFrame API and Vimeo Player API expose time updates and pause/resume; a native direct-video URL uses `HTMLVideoElement`; unsupported embeds show the checkpoint inline and do not claim timestamp enforcement.

The block editor gains a `checkpoint` block that serializes to `<LessonCheckpoint checkpointId="…" />`; the MDX component map renders that component in the student lesson. This is the durable inline anchor after a selected content block. Teachers using raw MDX get the same documented component syntax. The lesson renderer loads the checkpoint records with the lesson, passes them into `LessonContent`, and injects the correct exercise surface at each anchor. Lessons without video use exactly this inline path.

## Exercise Surface Contract

The current exercise engine identifies eleven types, but their student UIs are not yet a single reusable component: code, audio, video, and artifact have dedicated surfaces, while other types are handled through their existing page/config flows. Add `CheckpointExerciseRenderer` as a thin routing layer rather than duplicating those implementations.

- Deterministic selection, fill-in, matching, ordering, and quiz types receive compact adapters that call their current deterministic graders.
- Text/essay/discussion submissions use the structured evaluator when configured for AI grading.
- Coding mounts the existing code challenge surface and test runner.
- Audio/video mount the current upload, transcription, and media-analysis flow; they are not forced through a text evaluator.
- Artifact and real-time conversation preserve their existing submission/evaluation paths.

Every adapter returns the same checkpoint result contract: submitted, passed/complete, score, feedback, evaluator type, and retry availability. The wrapper controls only the contextual layout, resume behavior, and checkpoint-specific limits.

## Evaluation

Deterministic exercise types continue to use their existing local/programmatic evaluator and do not consume AI quota.

For AI-capable exercises, add a focused evaluator endpoint beside the current lesson-task chat. It reuses the authenticated tenant context, AI configuration, teacher instructions, prompt templates, model configuration, telemetry, and feature gating of the lesson AI task. It is intentionally a one-shot, structured evaluation rather than a streamed chat response.

The response contains a score, whether the answer meets expectations, concise formative feedback, a next-step hint, evaluator type, and any confidence value supported by the exercise. The evaluator cannot invoke arbitrary tools or unbounded conversation.

## Attempts, Progress, and Metrics

Add a dedicated `lesson_checkpoint_attempts` table for the canonical event log. It has the checkpoint, exercise, lesson, course, tenant, and user IDs; placement source (`video` or `inline`); response/evaluation JSON; score; passed/completed status; evaluator type; attempt number; and timestamps. Its RLS mirrors `practice_attempts` and `exercise_evaluations`: the student owns their rows, while active tenant teachers/admins can read them.

Do not write checkpoint answers directly into the existing `practice_attempts` table. That table is intentionally shaped for LLM-generated multi-question drills and has an insert trigger that grants 15 XP; reusing it would distort attempts, allow XP farming, and contradict its existing data contract. Instead, update weak-spot/readiness queries to consume `lesson_checkpoint_attempts` alongside `practice_attempts`, retaining a source filter so teachers can compare drills and embedded checkpoints. XP, if awarded, is explicit and capped by checkpoint policy rather than inherited accidentally.

Completed checkpoints contribute to a visible per-lesson checkpoint-progress indicator. An unfinished required checkpoint leaves the lesson resumable at its exact placement and visible as a practice gap. The existing `lesson_completions` row remains the course/certificate completion authority. Before the lesson AI-task tool can insert that row, it must validate that every required checkpoint is completed; this prevents a chat completion from bypassing required retrieval practice. Attempt data feeds existing weak-spot and readiness signals. Teachers can inspect marker-level completion, score distribution, common weak areas, and AI-evaluation usage.

## Cost and Safety Controls

The current plan model exposes an `ai_grading` feature flag but has no token/evaluation allowance. Add explicit numeric checkpoint-evaluation limits to plan limits and tenant usage accounting before enforcing cost caps. AI evaluation is then guarded at three levels:

1. A per-checkpoint/per-student cap prevents retry loops.
2. A per-student monthly cap prevents a single learner consuming the tenant allowance.
3. A tenant monthly plan allowance is the hard ceiling.

Teachers may configure stricter checkpoint retry caps and disable AI evaluation, but cannot exceed tenant plan limits. When an AI limit is exhausted or the provider is unavailable, the attempt is safely saved, the learner receives deterministic reflection guidance, and progress is never blocked solely by the unavailable AI service.

## Teacher and Student Experience

Teachers add a checkpoint from the lesson editor by selecting a content block (which inserts the checkpoint block) or a supported video timestamp, selecting an existing exercise, and configuring skip/retry behavior. The editor makes the exercise type, evaluation path, and potential AI usage visible. It must reject an exercise from another course or tenant on the server, not only hide it in the selector.

Students encounter a compact, keyboard-accessible and mobile-safe exercise in context. After evaluation they receive immediate explanatory feedback, can retry within the configured limit, and continue. Video behavior respects reduced motion. Both English and Spanish use the existing localization system.

## Verification

Cover placement and resume behavior for inline and video checkpoints; YouTube, Vimeo, native-video, and unsupported-embed fallbacks; all supported exercise/evaluator paths; deterministic versus AI quota consumption; quotas and exhaustion fallback; persisted context and progress; tenant isolation/RLS; locale, mobile, keyboard, and reduced-motion behavior. Verify that the end-of-lesson AI task remains unchanged except for the required-checkpoint completion guard.
