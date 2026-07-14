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

The lesson renderer inserts checkpoints after the selected content anchor. The video player pauses and opens the same checkpoint at its timestamp, including when the learner scrubs beyond it. Lessons without video use the same inline presentation.

## Evaluation

Deterministic exercise types continue to use their existing local/programmatic evaluator and do not consume AI quota.

For AI-capable exercises, add a focused evaluator endpoint beside the current lesson-task chat. It reuses the authenticated tenant context, AI configuration, teacher instructions, prompt templates, model configuration, telemetry, and feature gating of the lesson AI task. It is intentionally a one-shot, structured evaluation rather than a streamed chat response.

The response contains a score, whether the answer meets expectations, concise formative feedback, a next-step hint, evaluator type, and any confidence value supported by the exercise. The evaluator cannot invoke arbitrary tools or unbounded conversation.

## Attempts, Progress, and Metrics

Checkpoint attempts retain the existing exercise attempt/completion behavior and add a checkpoint context: checkpoint ID, source (`video` or `inline`), attempt number, evaluator type, outcome, score, and completion state. This permits filtering and aggregation without duplicating exercises.

Completed checkpoints contribute to lesson progress. An unfinished required checkpoint leaves the lesson resumable at its exact placement and visible as a practice gap. Attempt data feeds existing weak-spot and readiness signals. Teachers can inspect marker-level completion, score distribution, common weak areas, and AI-evaluation usage.

## Cost and Safety Controls

AI evaluation is guarded at three levels:

1. A per-checkpoint/per-student cap prevents retry loops.
2. A per-student monthly cap prevents a single learner consuming the tenant allowance.
3. A tenant monthly plan allowance is the hard ceiling.

Teachers may configure stricter checkpoint retry caps and disable AI evaluation, but cannot exceed tenant plan limits. When an AI limit is exhausted or the provider is unavailable, the attempt is safely saved, the learner receives deterministic reflection guidance, and progress is never blocked solely by the unavailable AI service.

## Teacher and Student Experience

Teachers add a checkpoint from the lesson editor by choosing the content position or video timestamp, selecting an existing exercise, and configuring skip/retry behavior. The editor makes the exercise type and potential AI usage visible.

Students encounter a compact, keyboard-accessible and mobile-safe exercise in context. After evaluation they receive immediate explanatory feedback, can retry within the configured limit, and continue. Video behavior respects reduced motion. Both English and Spanish use the existing localization system.

## Verification

Cover placement and resume behavior for inline and video checkpoints; all supported exercise/evaluator paths; deterministic versus AI quota consumption; quotas and exhaustion fallback; persisted context and progress; tenant isolation/RLS; locale, mobile, keyboard, and reduced-motion behavior. Verify that the end-of-lesson AI task remains unchanged.
