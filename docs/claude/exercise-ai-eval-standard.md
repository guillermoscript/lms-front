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
