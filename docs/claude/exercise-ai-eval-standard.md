# AI-evaluated exercise steps: templates + preview standard

Any exercise type whose submission is graded by AI MUST expose, in its builder step
(`components/teacher/exercise-builder/`), through the shared `<AIEvalTemplateBar>`
(`ai-eval-templates.tsx`):

1. **Built-in templates** (i18n) via `useBuiltInTemplates(namespaceKey, kinds, variables, idOffset)`.
   Keys live in `messages/{en,es}.json` under
   `dashboard.teacher.exerciseBuilder.<namespaceKey>.<kind>.{name,description,instructions,criteria,scenario?}`.
   `scenario` only when `{ scenario: true }`. Each step uses its own negative `idOffset`
   (essay/code: none, voice: -100, media: -200; pick the next free -300, ...).
2. **DB templates**: `ImprovedTemplateSelector category="exercise"` (rendered by the bar; `/api/teacher/templates`).
3. **AI preview**: `AIPreviewModal` (rendered by the bar when `previewConfig` is passed).

## Preview limits

`/api/teacher/preview/exercise` is the TEXT coach (`exercise_coach` feature, dry-run
`markExerciseCompleted`, body = `instructions` + `system_prompt` + `exercise`). It cannot
ingest audio/video, nor run the realtime voice partner. So:

- essay/code steps: pass `previewConfig`.
- audio/video/voice-conversation steps: omit `previewConfig` (bar shows templates only)
  until a preview endpoint that accepts a media sample / voice session exists.
  Do not fake it with the text coach: it would grade different criteria than the real path.

## Adding a new AI-evaluated type

Add templates to both locale files (parity test), call `useBuiltInTemplates`, map `onApply`
(`instructions`, `system_prompt`, optional `scenario`) onto that step's form fields.

## Challenge rubric (cold grading, `lib/challenges/grade.ts`)

Public exercise challenges (#1025) need the same answer to always get the same score, so
the model never returns a number. It returns a verdict per criterion; code computes the score.

- Format, in `exercise_config.rubric` (a secret config key, lives in `exercise_grading_secrets`):
  `{ "criteria": [{ "id": "thesis", "description": "States a clear thesis", "weight": 2 }] }`
  (`id` optional, `weight` defaults to 1; a bare array or array of strings also works).
- Fallback when absent: one equal-weight criterion per line of `evaluation_criteria`, else a
  generic 4-criterion rubric. Max 10 criteria.
- Model output: one isolated call per criterion returning `{met}` (it sees only that criterion + the answer, never the answer key), temperature 0; feedback comes from a separate call that cannot change the score and is dropped if it quotes grading material.
- Score = `round(100 * sum(weight of met criteria) / sum(weight))`. Unknown ids are ignored,
  omitted criteria count as not met. Passing = `exercise_config.passing_score` (default 70).
- `essay` and `discussion` only (closed-question options are not shown to guests). The grade is stored once in `challenge_attempts` and never regraded.
