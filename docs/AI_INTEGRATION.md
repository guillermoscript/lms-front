# AI Integration Guide

**Status**: Fully implemented, bring-your-own-key (BYOK). See [`AI_BYOK.md`](AI_BYOK.md) for the key/provider/model model.
**AI SDK**: Vercel AI SDK (`ai` package). Provider SDKs are imported only in `lib/ai/providers.ts`.
**Model**: chosen per school and per feature (Admin > Settings > AI); resolved with `createTenantAi(tenantId)`. No model is hardcoded and there is no platform key.
**Streaming**: `UIMessageStreamResponse` for chat endpoints
**Limits**: `maxDuration: 120s`, `maxSteps: 10`

---

## Architecture

### Standard AI Flow

```
1. User triggers AI action (chat message, submit artifact, record audio)
   ↓
2. Client sends request to API route
   ↓
3. API route authenticates user via supabase.auth.getUser()
   ↓
4. API route verifies enrollment + tenant ownership
   ↓
5. API route fetches context from Supabase (exercise, lesson, course structure)
   ↓
6. API route resolves the school's model (`createTenantAi(tenantId).getModelForFeature(feature)`) and the AI SDK calls the school's provider with context + system prompt
   ↓
7. Streaming response sent back via UIMessageStreamResponse (chat)
   or generateText returns structured output (evaluations)
   ↓
8. On completion, save results to database (onFinish callback or explicit insert)
```

### Model resolution

**Files**: `lib/ai/tenant-ai.ts` (resolver), `lib/ai/features.ts` (feature ids), `lib/ai/providers.ts` (the only provider-SDK importer), `lib/ai/config.ts` (constants only: `maxSteps`, `maxDuration`, `maxHistoryMessages`, `DEFAULT_PASSING_SCORE`).

```typescript
const ai = createTenantAi(tenantId) // tenantId from the auth context, never the request body
const { model, providerId, modelId } = await ai.getModelForFeature('lesson_tutor')
```

Every call site picks one `AiFeature`; the school maps features to `(provider, model)`. Missing key or model throws a typed `Ai*Error`, which `withTenantAi` / `handleAiError` turn into 402/424/422/429/502 (`{error:{code, feature, canConfigure, settingsUrl}}`).

### AI Tools (Function Calling)

**File**: `lib/ai/tools.ts`

The AI SDK `tool()` function defines two tools that chat endpoints can invoke:

- **`markExerciseCompleted`** — Inserts into `exercise_completions` and `exercise_evaluations` when a student demonstrates mastery. Accepts `feedback` (string) and `score` (0-100).
- **`markLessonCompleted`** — Inserts into `lesson_completions` when a student finishes a lesson task. Accepts `feedback` (string).

Both tools receive a context object with `exerciseId`, `lessonId`, `userId`, `courseId`, `tenantId`, and `exerciseType`.

---

## AI Features

### 1. Aristotle AI Tutor

Course-level AI tutor that provides context-aware assistance to students.

**Components** (`components/aristotle/`):
- `aristotle-panel.tsx` — Floating chat panel UI
- `aristotle-provider.tsx` — React context provider for Aristotle state
- `aristotle-trigger.tsx` — Button to open/close the panel
- `aristotle-study-section.tsx` — Study section integration
- `aristotle-study-tab.tsx` — Tab-based study view
- `aristotle-context-setter.tsx` — Sets current page context (lesson, exercise)
- `session-list.tsx` — Past session history

**API Routes**:
- `POST /api/chat/aristotle` — Main chat endpoint (streaming)
- `POST /api/chat/aristotle/restart` — Start a new session

**Key Files**:
- `lib/ai/aristotle-prompt.ts` — Builds system prompt from teacher config, course structure, student progress, session memory, and current page context
- `lib/ai/aristotle-summary.ts` — Generates session summaries via `generateText()` when sessions end; summaries are injected into future sessions as memory

**How It Works**:
1. Verifies enrollment in the course (RLS + explicit check)
2. Checks that Aristotle is enabled via `course_ai_tutors` table
3. Fetches course structure (lessons, exercises, exams), student progress (completions, scores), and past session summaries in parallel
4. Gets or creates a session in `aristotle_sessions` (30-minute idle timeout)
5. Detects current page context (lesson or exercise) from URL
6. Builds a rich system prompt via `buildAristotlePrompt()` with teacher persona, course structure, progress, memory, and behavioral guardrails
7. Streams response via `streamText()` + `toUIMessageStreamResponse()`
8. Saves both user and assistant messages to `aristotle_messages`

**Database Tables**: `course_ai_tutors`, `aristotle_sessions`, `aristotle_messages`

---

### 2. Exercise AI Chat

AI coaching for exercise submissions. Guides students through exercises without giving direct answers.

**Component**: `components/exercises/exercise-chat.tsx`

**API Routes**:
- `POST /api/chat/exercises/student` — Main chat endpoint (streaming)
- `POST /api/chat/exercises/student/restart` — Reset conversation

**How It Works**:
1. Fetches exercise details including custom `system_prompt` from the exercise record
2. Uses `PROMPTS.exerciseCoach()` from `lib/ai/prompts.ts` to build system prompt
3. Provides the `markExerciseCompleted` tool so the AI can mark completion when the student demonstrates mastery
4. Messages saved to `exercise_messages` table
5. Tenant validated via course FK join

**Supports all exercise types** — the exercise's `system_prompt` field lets teachers customize AI behavior per exercise.

---

### 3. Artifact Exercise Evaluation

Non-streaming AI evaluation of HTML/CSS/JS artifact submissions.

**API Route**: `POST /api/exercises/artifact/evaluate`

**How It Works**:
1. Validates exercise is type `artifact` and belongs to tenant
2. Verifies enrollment
3. **Rate limited**: max 10 evaluations per hour per exercise+user (checked via `exercise_evaluations` table)
4. Uses `generateText()` with the school's `exercise_grader` model to evaluate the submission
5. Parses structured JSON response: `{ score, feedback, strengths, improvements }`
6. Inserts into `exercise_evaluations` and `exercise_completions` (if passed)
7. Returns `{ score, feedback, passed, strengths, improvements, passingScore }`

**Passing score** is configurable per exercise via `exercise_config.passing_score` (default: 70).

---

### 4. Voice/Audio Exercise Evaluation

Speech-to-text transcription followed by AI coaching evaluation.

**API Routes**:
- `POST /api/exercises/media/upload-url` — Get a signed upload URL for audio recording
- `POST /api/exercises/media/signed-url` — Get a signed URL for playback
- `POST /api/exercises/media/analyze` — Transcribe + AI evaluate

**Speech Pipeline** (`lib/speech/`):
- `types.ts` — Defines `TranscriptionResult`, `SpeechMetrics`, `SpeechEvaluation`, `STTProvider`, `SpeechCoach` interfaces
- `registry.ts` — Registry of STT providers and speech coaches
- `pipeline.ts` — Orchestrates STT → metrics computation → AI evaluation
- `providers/tenant-stt.ts` — STT through the school's transcriber (`ai.getTranscriber()`: AssemblyAI, OpenAI or Groq; word timestamps feed WPM/pause metrics)
- `coaches/model-coach.ts` — coach on the school's `speech_coach` model

**How It Works**:
1. Student records audio via `MediaRecorderComponent`, uploads to `exercise-media` Supabase bucket
2. Creates `exercise_media_submissions` record with status `pending`
3. On analyze: atomically transitions status `pending` → `processing` (prevents concurrent analysis)
4. Gets signed URL for the stored audio file
5. Runs speech pipeline: STT provider transcribes audio → computes metrics (WPM, filler words, pauses) → AI coach evaluates
6. Speech metrics include: WPM, filler word count, pause count, long pause count, average pause duration, duration
7. AI evaluation returns: score, strengths, improvements, focus_next, annotated_transcript
8. Saves to `exercise_media_submissions`, `exercise_evaluations`, and `exercise_completions` (if passed)

**Configurable per exercise**: rubric criteria (filler words, pace, structure, confidence), topic prompt, passing score.

---

### 5. Lesson Task AI Chat

AI tutoring for lesson activities/tasks.

**API Routes**:
- `POST /api/chat/lesson-task` — Main chat endpoint (streaming)
- `POST /api/chat/lesson-task/restart` — Reset conversation

**How It Works**:
1. Fetches lesson with associated `lessons_ai_tasks` record (task instructions + custom system prompt)
2. Uses `PROMPTS.lessonTutor()` to build system prompt with lesson content and task instructions
3. Provides the `markLessonCompleted` tool so the AI can mark the lesson done when the student demonstrates understanding
4. Messages saved to `lessons_ai_task_messages` table
5. Tenant validated via course FK join

---

### 6. Exam Auto-Grading

AI grading for exam submissions, with configurable persona and feedback style.

**API Route**: `POST /api/exams/[examId]/grade` — grading for a submission (role and ownership checked)

**Server Action**: `app/actions/exam-grading.ts` — `gradeExamWithAI()` function, also callable from student exam submission flow

**How It Works**:
1. Separates questions into auto-gradable (multiple choice, true/false) and free-text
2. Auto-grades MC/TF programmatically with 100% confidence
3. For free-text questions: builds a prompt using configurable AI persona, feedback tone, and detail level
4. Uses `generateText()` + `Output.object` on the school's `exam_grader` model to grade each free-text answer
5. Awards partial credit based on rubric, grading criteria, and expected keywords
6. Saves results via `save_exam_feedback` RPC
7. If AI grading is disabled, or the school has no usable key, free-text questions are parked as "pending teacher review"

**AI Configuration** (per exam, stored in `exam_ai_configs`):
- **Personas**: `professional_educator`, `friendly_tutor`, `strict_professor`, `supportive_mentor`
- **Feedback tones**: `encouraging`, `neutral`, `constructive`, `challenging`
- **Detail levels**: `brief`, `moderate`, `detailed`, `comprehensive`
- **Custom grading prompt**: Teacher-provided additional instructions

**Teacher Override**: `POST /api/teacher/submissions/[submissionId]/override` — Teachers can override AI-assigned scores and feedback.

---

### 7. Exercise Templates & Preview

Reusable prompt templates for exercises, with teacher preview capability.

**API Routes**:
- `GET /api/teacher/templates` — List templates
- `POST /api/teacher/templates` — Create template
- `GET /api/teacher/templates/[id]` — Get template
- `PUT /api/teacher/templates/[id]` — Update template
- `POST /api/teacher/preview/exercise` — Preview exercise AI behavior without affecting student data
- `POST /api/teacher/preview/lesson-task` — Preview lesson task AI behavior

**Preview prompts** (from `lib/ai/prompts.ts`) clearly indicate preview mode and instruct the AI to explain evaluation criteria rather than submitting scores.

---

## Prompt System

**File**: `lib/ai/prompts.ts`

All prompts are centralized in the `PROMPTS` object:

| Prompt | Used By | Purpose |
|--------|---------|---------|
| `exerciseCoach()` | Exercise chat | Guides students through exercises using exercise title, description, instructions, and custom system prompt |
| `lessonTutor()` | Lesson task chat | Tutors students on lesson content with task instructions |
| `lessonTaskTemplate()` | Lesson task chat (structured variant) | More structured tutoring prompt with step-by-step guidance |
| `speechCoach()` | Voice exercise evaluation | Evaluates speech with metrics (WPM, fillers, pauses) and rubric |
| `examGrader()` | Exam grading API route | Grades individual free-text answers with scoring criteria |
| `previewExercise()` | Teacher preview | Exercise preview mode |
| `previewLesson()` | Teacher preview | Lesson task preview mode |

Aristotle has its own prompt builder in `lib/ai/aristotle-prompt.ts` due to the complexity of its context assembly.

---

## Feature Gating

| Feature | Required Plan |
|---------|--------------|
| AI Grading | `pro` or above |
| Voice Exercises | `pro` or above |

Feature gating is enforced via `get_plan_features(_tenant_id)` RPC and the `<FeatureGate>` component.

---

## Security

### Authentication & Authorization
- Every AI endpoint calls `supabase.auth.getUser()` (server-verified, not JWT-based)
- Enrollment verification before AI access (checks `enrollments` table with `status = 'active'` and `tenant_id`)
- Tenant isolation: all queries filter by `tenant_id`, validated via course FK joins

### Rate Limiting
- Artifact evaluations: max 10 per hour per exercise+user (enforced via `exercise_evaluations` count)
- Speech analysis: atomic `pending` → `processing` status transition prevents concurrent analysis of the same submission

### API Key Protection
- All AI calls happen server-side in API routes and server actions, with the school's own key
- Keys are AES-256-GCM encrypted at rest (AAD `tenantId:provider`), decrypted only inside a per-request closure, never returned (UI shows last 4), never logged (`redact()`), never sent to Sentry (`redactSentryEvent`)
- No platform key, no fallback: a school without a usable key gets a typed error, never someone else's credentials
- Provider hosts are a fixed allowlist (no free-form base URL, no SSRF); the only client-side provider import is the key-free realtime protocol parser in `lib/speech/realtime-model.ts`
- Langfuse traces carry `{tenantId, feature, provider, modelId}` and never headers; a school can opt out of prompt/response text (`tenant_ai_settings.ai_trace_content`, enforced in `lib/ai/trace-content-guard.ts`)

---

## Database Tables (AI-Specific)

| Table | Purpose |
|-------|---------|
| `course_ai_tutors` | Per-course Aristotle configuration (persona, teaching approach, boundaries, enabled flag) |
| `aristotle_sessions` | Aristotle chat sessions with summary and topics |
| `aristotle_messages` | Individual messages within Aristotle sessions |
| `exercise_messages` | Exercise chat message history |
| `exercise_evaluations` | Unified evaluation records across all exercise types (text, simulation, audio, video) |
| `exercise_completions` | Exercise completion records with scores |
| `exercise_media_submissions` | Audio/video submission records with status, AI evaluation, and score |
| `lessons_ai_tasks` | Lesson task configuration (instructions, system prompt) |
| `lessons_ai_task_messages` | Lesson task chat message history |
| `exam_ai_configs` | Per-exam AI grading configuration (persona, tone, detail level, custom prompt) |
| `exam_submissions` | Exam submissions with `ai_data` JSONB and `review_status` |
| `exam_scores` | Exam score records with feedback |
| `exam_answers` | Individual exam answers with `is_correct` and `feedback` |

---

## Environment Variables

```bash
AI_KEYS_ENCRYPTION_KEYS={"1":"<base64 32 bytes>"}   # master key(s) for stored school keys; back it up
AI_KEYS_ACTIVE_VERSION=1
```

No AI provider key is configured on the platform (`OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY` and `NEXT_PUBLIC_OPENAI_API_KEY` are gone). Optional: `LANGFUSE_*` for observability.

---

## Key File Index

| File | Purpose |
|------|---------|
| `lib/ai/tenant-ai.ts` | Per-request resolver: `createTenantAi(tenantId)` -> model / transcriber / realtime / image |
| `lib/ai/providers.ts` | Provider registry (the only `@ai-sdk/*` importer): factories, key validation, model listing |
| `lib/ai/features.ts` | `AiFeature` ids, kinds, inheritance, provider allowlists |
| `lib/ai/errors.ts` | Typed AI errors, `classifyProviderError`, `withTenantAi` helpers |
| `lib/ai/byok/` | Server-only key crypto (`crypto`), `redact` |
| `lib/ai/config.ts` | AI constants (steps, duration, history cap, passing score), no models |
| `lib/ai/prompts.ts` | All prompt templates |
| `lib/ai/tools.ts` | AI function-calling tools (markExerciseCompleted, markLessonCompleted) |
| `lib/ai/aristotle-prompt.ts` | Aristotle system prompt builder |
| `lib/ai/aristotle-summary.ts` | Session summary generation |
| `lib/speech/types.ts` | Speech pipeline type definitions |
| `lib/speech/registry.ts` | STT provider and speech coach registry |
| `lib/speech/pipeline.ts` | Speech analysis orchestration |
| `lib/speech/providers/` | Tenant STT adapter |
| `lib/speech/coaches/` | Model-backed speech coach |
| `app/actions/exam-grading.ts` | Server action for exam AI grading with configurable personas |
| `components/aristotle/` | Aristotle UI components (panel, provider, trigger, context setter) |
| `components/exercises/exercise-chat.tsx` | Exercise chat UI component |
