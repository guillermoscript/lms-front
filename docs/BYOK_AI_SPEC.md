# FINAL BYOK SPEC

Base is Design 1 (security-first). Grafts: Design 3's `tenant_ai_settings` default and `inherits` chain, `models_cache`, ESLint import rule and `<AiErrorNotice>`. Design 2's "one key + one default works" minimal path and its non-blocking usage-cap treatment.

## 1. Decisions

**Storage and encryption**
- App-level AES-256-GCM, extending the `lib/payments/credentials.ts` pattern. No Vault, no pgsodium.
- Envelope is `v<N>:iv:tag:ct`, with AAD = `${tenantId}:${provider}`.
- Env: `AI_KEYS_ENCRYPTION_KEYS` (JSON `{"1":"<b64 32B>"}`) and `AI_KEYS_ACTIVE_VERSION`. Fail closed on missing or wrong-length keys.
- Lazy re-encrypt on read when the stored version is older than active. Provide a rotation script.
- All `lib/ai/byok/*` files are `import 'server-only'`.

**Fail-closed policy**
- No platform-key fallback. `OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY` and `NEXT_PUBLIC_OPENAI_API_KEY` are removed.
- Every provider factory gets an explicit `apiKey`.
- No `AI_BYOK_ENFORCED` flag. Ship order (settings UI first, resolver unused until call-sites migrate) gives the safe cutover. Production fails closed.

**Providers v1**
- Fixed allowlist with hardcoded hosts: `openai, anthropic, google, openrouter, groq, mistral, xai, deepseek, assemblyai` (STT only).
- No free-form baseURL. This removes SSRF and the Langfuse-CVE class (CVE-2026-41487).
- Custom OpenAI-compatible is v2.
- Test-only host override `AI_PROVIDER_BASE_URL_OVERRIDE`, honored only when `NODE_ENV!=='production'`.

**Managed-billing seam**
- `tenant_ai_settings.mode` is `'byok'|'managed'`. Only `byok` is implemented.
- `managed` throws `AiPlatformManagedUnavailableError` for now.
- `grace_until` is not built.

**Model selection (resolution order)**
1. `course_ai_tutors.provider/model` (Aristotle only).
2. `tenant_ai_feature_models[feature]`.
3. The feature's `inherits` / `fallsBackTo` parent.
4. `tenant_ai_settings.default_provider/default_model`.
5. Throw `AiNotConfiguredError`.

**Admin read surface**
- No DB view. The admin server action returns masked DTOs through the admin client after an admin check.
- Ciphertext is never selectable by `anon` or `authenticated`.
- A boolean-only SECURITY DEFINER `tenant_ai_configured(_tenant_id)` serves UI flags (below).

**HTTP codes** (no 401/403, so client auth handlers don't sign the user out):

| Error | Code |
|---|---|
| `ai_not_configured` | 402 |
| `ai_key_invalid` | 424 |
| `ai_model_unsupported` | 422 |
| `ai_quota` | 429 |
| `ai_provider_error` | 502 |

Body is `{error:{code, feature, canConfigure, settingsUrl}}`. Never echo provider bodies.

**Plan gates**
- `hasPlanFeature` gates (`voice_exercises`, `ai_grading`) stay.
- The landing `PAID_PLANS` gate stays pending a product decision. Flag it.
- `aiChatLimiter`, `aiGenerationLimiter` and per-checkpoint or per-student caps stay as abuse brakes.
- `increment_ai_chat_usage` and `checkAiAllowance` tenant-monthly caps become non-blocking. Set the `platform_plans.limits` AI-chat keys to `-1` via migration, with no code change.

**Structured output**
- Standardize on `generateText + Output.object`.
- Migrate the remaining `generateObject`/`streamObject` uses (checkpoint, question generator, starter course, landing).
- Exam grader moves from regex JSON to `Output.object`.

**Telemetry**
- Langfuse metadata gets `{tenantId, feature, provider, modelId}`.
- No headers recorded.
- Add `tenant_settings.ai_trace_content boolean default true`.
- Add Sentry `beforeSend` plus `redact()`.

## 2. Schema (one migration, `<ts>_byok_ai.sql`)

```sql
create table tenant_ai_credentials (
  id uuid pk default gen_random_uuid(),
  tenant_id uuid not null references tenants(<pk>) on delete cascade,
  provider text not null check (provider in ('openai','anthropic','google','openrouter','groq','mistral','xai','deepseek','assemblyai')),
  key_ciphertext text not null, key_version int not null, key_last4 text not null,
  status text not null default 'active' check (status in ('active','invalid','disabled')),
  validated_at timestamptz, last_error_code text,
  models_cache jsonb, models_cached_at timestamptz,   -- non-secret [{id,label,caps}]
  created_by uuid references auth.users(id),
  created_at timestamptz default now(), updated_at timestamptz default now(), last_used_at timestamptz,
  unique (tenant_id, provider));
-- RLS on; REVOKE ALL from anon, authenticated; no policies; updated_at trigger

create table tenant_ai_settings (
  tenant_id uuid pk references tenants on delete cascade,
  mode text not null default 'byok' check (mode in ('byok','managed')),
  default_provider text, default_model text, updated_at timestamptz default now());

create table tenant_ai_feature_models (
  tenant_id uuid references tenants on delete cascade, feature text not null,
  provider text not null, model text not null, params jsonb not null default '{}',
  updated_by uuid, updated_at timestamptz default now(), primary key (tenant_id, feature));
-- both tables above: SELECT using (tenant_id = auth.tenant_id() or auth.is_super_admin())
-- no INSERT/UPDATE/DELETE grant to authenticated (writes only through server actions + admin client)

alter table course_ai_tutors add column provider text, add column model text;
alter table tenant_settings add column ai_trace_content boolean not null default true;

create table tenant_ai_audit (
  id bigint generated always as identity pk, tenant_id uuid not null, actor uuid,
  action text not null check (action in ('set','rotate','delete','validate_fail','model_change','auto_invalidated')),
  provider text, feature text, at timestamptz default now());
-- RLS: admin SELECT own tenant; writes via service role; never key material

create function tenant_ai_configured(_tenant_id uuid) returns jsonb  -- {provider:true,...}
  security definer, search_path = '', schema-qualified, checks auth.tenant_id() / super admin,
  revoke from public, anon; grant to authenticated.
-- Migration also sets AI-chat limits to -1 in platform_plans.limits.
```

- Add `tenant_ai_credentials` to the data-deletion path. FK cascade covers tenant delete.
- Regenerate types with `npm run db:types`.
- Verify the `tenants` PK column name (`id` vs `tenant_id`, Designs 1 and 2 disagree).

## 3. Module APIs

### `lib/ai/byok/crypto.ts`
```ts
encryptKey(plain: string, ctx: {tenantId: string; provider: ProviderId}): string
decryptKey(envelope: string, ctx: {tenantId: string; provider: ProviderId}): string
needsReencrypt(envelope: string): boolean
```

### `lib/ai/byok/redact.ts`
```ts
redact(s: string): string  // masks sk-, sk-ant-, AIza, gsk_, xai-, Bearer
```

### `lib/ai/providers.ts`
This is the only file allowed to import `@ai-sdk/*`, enforced by an ESLint `no-restricted-imports` rule. It also owns all provider-specific option blocks.
```ts
PROVIDERS: Record<ProviderId, {
  label: string; kinds: ('language'|'stt'|'realtime'|'image')[]; host: string
  create(apiKey: string): ProviderInstance
  validate(apiKey: string): Promise<{ok: boolean; status?: number}>
  listModels(apiKey: string): Promise<{id: string; label?: string; caps?: ModelCaps}[]>
  voices?: string[]
}>
```
- `validate` and `listModels` use fetch with `AbortSignal.timeout(8000)`, `redirect:'manual'`, and the key in headers only.
- Endpoints:
  - OpenAI, Groq, Mistral, xAI and DeepSeek: `GET /models`, Bearer.
  - Anthropic: `/v1/models` with `x-api-key` and `anthropic-version`.
  - Google: `/v1beta/models` with `x-goog-api-key`; strip the `models/` prefix.
  - OpenRouter: `/api/v1/key`, because `/models` is public.
  - AssemblyAI: `GET /v2/transcript?limit=1`.
- New deps: `@ai-sdk/anthropic @ai-sdk/groq @ai-sdk/mistral @ai-sdk/xai @ai-sdk/deepseek @openrouter/ai-sdk-provider`. Pin the `ai` version, since realtime is experimental.

### `lib/ai/features.ts`
```ts
type AiFeature =
 'aristotle'|'aristotle_summary'|'lesson_tutor'|'lesson_verifier'|'checkpoint_grader'|
 'exercise_coach'|'exercise_grader'|'speech_coach'|'speech_stt'|'voice_conversation'|
 'exam_grader'|'question_generator'|'starter_course'|'course_architect'|'landing_builder'|'image_generation'
AI_FEATURES: Record<AiFeature, {
  kind: 'language'|'object'|'stt'|'realtime'|'image'
  needs?: {tools?: boolean; vision?: boolean; structured?: boolean}
  inherits?: AiFeature; providers?: ProviderId[]; area: 'student'|'teacher'|'admin'; longRunning?: boolean
}>
```
Inherits:
- `aristotle_summary` → `aristotle`
- `lesson_verifier` → `lesson_tutor`
- `checkpoint_grader` → `exercise_grader`
- `speech_coach` → `exercise_grader`

Provider restrictions:
- `speech_stt`: `assemblyai`, `openai`, `groq`.
- `voice_conversation`: `openai`, `xai`, `google`.
- `image_generation`: `openai`, `google`.

Teacher previews use the same feature id as the student surface.

`lib/ai/capabilities.ts` holds a static model-id pattern table. It gives a soft warning at save time and is a hard block only for realtime and stt.

### `lib/ai/errors.ts`
```ts
class AiNotConfiguredError, AiKeyInvalidError, AiModelUnsupportedError, AiProviderQuotaError, AiProviderError, AiPlatformManagedUnavailableError
classifyProviderError(e: unknown): AiError  // 401/403→key_invalid, 404→model_unsupported, 429/insufficient_quota→quota, else provider_error
aiErrorResponse(e: unknown, o: {canConfigure: boolean; feature: AiFeature}): Response
handleAiError(e: unknown, o): Response | never  // wrapper for route handlers
```
On key_invalid it sets `status='invalid'` and `last_error_code` through the admin client, writes an audit row, and sends no raw message.

### `lib/ai/tenant-ai.ts`
```ts
createTenantAi(tenantId: string): {   // per-request closure; memo inside
  getModelForFeature(feature: AiFeature, o?: {courseId?: string; require?: Cap[]}):
    Promise<{model: LanguageModel; providerId: string; modelId: string; feature: AiFeature; source: 'tenant'; caps: ModelCaps}>
  getTranscriber(): Promise<{transcribe(audio: Buffer|URL): Promise<TranscriptionResult>}>  // words[] required
  getRealtime(feature: 'voice_conversation'): Promise<{providerId; modelId; voice?; getToken(sessionConfig): Promise<{token; url; model; provider}>}>
  getImageModel(): Promise<{model: ImageModel; providerId: string; modelId: string}>
}
getModelForFeature(ctx: {tenantId; feature; courseId?}) // thin convenience wrapper
isAiConfigured(supabase, tenantId): Promise<Record<string, boolean>>  // via RPC; UI flags only
```
- No module-level cache. React `cache()` doesn't dedupe in route handlers, so memoize in the closure. It is also fine inside RSC.
- `tenantId` comes only from `getApiAuthContext`, `getCurrentTenantId` or `authorizeExercisePreview`, never the body.
- Credential read: admin client with `.eq('tenant_id')` and an explicit `row.tenant_id === tenantId` check.
  - Missing row → `no_key`. `status='invalid'` → `AiKeyInvalidError`. `mode='managed'` → `AiPlatformManagedUnavailableError`.
- `last_used_at` update is fire-and-forget, throttled to once per 10 minutes.
- `require` caps throw `AiModelUnsupportedError` (for example, vision when attachments are present).
- `getCredential` is internal only and not exported from any barrel.

### `lib/ai/config.ts`
- Delete `AI_MODELS`, `defaultModel` and `DEFAULT_MODEL_ID`.
- Keep `AI_CONFIG` constants (`maxSteps`, `maxHistoryMessages`, `maxDuration`) and `DEFAULT_PASSING_SCORE`.

### Shared lib signature changes
- All shared libs take `model: LanguageModel` (or a `tenantAi` handle) instead of importing a global.
- Affected:
  - `verifyLessonCompletion({..., model})`
  - `generateSessionSummary(messages, model)`
  - `evaluateWrittenExercise(ex, content, model)`
  - `evaluateArtifactExercise(..., model)`
  - `getPipeline(stt, coach, {apiKey, model})`
  - `AssemblyAIProvider(apiKey)`
  - `OpenAICoachProvider` becomes the generic `ModelCoachProvider(model)`
- `save_exam_feedback.p_ai_model` records the real `modelId`.

### Server actions: `app/actions/admin/ai-settings.ts`
All actions run `getUserRole()==='admin'` and `getCurrentTenantId()`. Each writes an audit row, calls `revalidatePath`, and never returns the key.
```ts
saveAiCredential({provider, apiKey}): Promise<{ok; last4; models?}>
removeAiCredential(provider)            // also nulls dependent feature/default mappings, warns
testAiCredential(provider)              // re-validates the stored key
refreshProviderModels(provider)         // updates models_cache
setAiDefault({provider, model})
setFeatureModel({feature, provider, model, params?})
testFeature(feature)                    // 1-token probe; tools/structured probe by kind
setCourseTutorModel({courseId, provider?, model?})   // teacher (course author) or admin
getAiSettingsDTO()                      // masked
```
- `saveAiCredential` flow: Zod (provider enum, trimmed key 8–512 chars) → rate-limit 5/min per tenant+user → live validate → store only if valid → encrypt with AAD → upsert → audit → return `{ok, last4, models}`.
- `setFeatureModel` checks: provider is allowed for the feature, a credential exists, capability warnings, and voice validated per provider.
- Teachers get a read-only configured status.

### `lib/ai/chat-error.ts`
- `classifyAiChatError` gains `ai_not_configured | ai_key_invalid | ai_model_unsupported | ai_quota | ai_provider_error`.
- Copy by role:
  - Student: "Your school hasn't enabled AI yet."
  - Teacher: "Ask your school admin."
  - Admin: link to `/dashboard/admin/settings/ai`.
- `<AiErrorNotice code canConfigure/>` is the shared component. i18n goes in en/es.

## 4. Cross-cutting behavior rules

- **Check order in every route:** auth → access → role gate → resolve model → rate limit and usage → side effects. A missing key must produce no pending rows, no claims and no usage increments.
- **Lesson verifier:** fail CLOSED on key or quota errors (`done:false`, `ai_unavailable`). Fail open only on genuinely transient errors.
- **Checkpoint grader:** keep the graceful fallback. Add `fallback_reason: 'ai_not_configured'|'ai_key_invalid'` in `lib/checkpoints/types.ts`.
- **Exam grading with no key:** park free text for teacher review (the `aiGradingAllowed=false` path).
- **Aristotle restart:** close the session with `summary=null` instead of returning 500.
- **Media analyze:** return error codes, not `err.message`. Mark the submission failed-retryable.
- **Realtime token:** resolve the key and model BEFORE inserting the pending row. Clean up the row if the mint fails.
- **Realtime evaluate:** resolve before the claim.
- **Vision:** if attachments are sent and the model lacks vision, return 422 `ai_model_unsupported`.
- **Realtime client:** the token route returns `{token, url, model, provider, voice}`. The client builds the descriptor from it. Remove `@ai-sdk/openai` and `REALTIME_MODEL` from the client. Only the ephemeral token reaches the browser.
- **Hardening:**
  - `app/api/teacher/exams/[examId]/grade/route.ts` has no role check. Add teacher or admin plus course ownership, or delete it if there is no caller. Do this first.
  - Tighten the `evaluate-artifact` tenant check to require both `exercise.tenant_id` and `course.tenant_id`.
  - Preview routes keep the staff-only gate before resolving the model.
- **UI flags:** `tenant_ai_configured` hides the Aristotle trigger and AI entry points for students. An admin banner shows "Add an AI key".
- **Logging:** catch blocks log only `err.name`, `status` and `redact(err.message)`.

## 5. Implementation units (ordered)

| id | files | description | depends_on |
|---|---|---|---|
| U1 | `supabase/migrations/*_byok_ai.sql`, `lib/database.types.ts` | Schema, RLS, `tenant_ai_configured` RPC, plan-limit `-1` backfill, regen types | none |
| U2 | `lib/ai/byok/{crypto,redact}.ts`, tests | Crypto with AAD and versions, redact | none |
| U3 | `lib/ai/{providers,features,capabilities,errors}.ts`, `package.json`, ESLint config | Registry, validators, listModels, caps table, typed errors and classifier, import restriction | none |
| U4 | `lib/ai/tenant-ai.ts`, `lib/ai/with-tenant-ai.ts`, tests | Resolver (model, transcriber, realtime, image), fallback chain, tenant isolation tests | U1, U2, U3 |
| U5 | `app/actions/admin/ai-settings.ts`, `tenant_ai_audit` writes | Admin actions (save, validate, remove, models, default, feature, test, course tutor) | U4 |
| U6 | `app/[locale]/dashboard/admin/settings/ai/*`, `components/admin/ai/*`, `messages/{en,es}`, sidebar, admin banner, create-school optional step | Settings UI (Providers, Default, Advanced per feature, per-course form, disabled managed radio) | U5 |
| U7 | `lib/ai/chat-error.ts`, `lib/ai/chat-usage.ts`, `<AiErrorNotice>`, Aristotle trigger flag, `lesson-ai-chat.tsx`, `exercise-chat.tsx`, `ai-preview-modal.tsx` | Client error plumbing, capability flag | U3 |
| U8 | `app/api/teacher/exams/[examId]/grade/route.ts` | Security fix: role and ownership gate, or delete. Then resolver (feature `exam_grader`) | U4 |
| U9 | `app/api/chat/lesson-task/route.ts`, `lib/ai/lesson-completion-verifier.ts` (fail-closed, `model` param), `lib/ai/tools.ts` verify closure, `app/api/teacher/preview/lesson-task/route.ts`, `tests/unit/lesson-requirements.test.ts` | Lesson tutor and verifier | U4, U7 |
| U10 | `app/api/chat/aristotle/{route,restart/route}.ts`, `lib/ai/aristotle-summary.ts`, tutor config form | Aristotle with course override | U4, U7 |
| U11 | `app/api/lesson-checkpoints/[checkpointId]/attempt/route.ts`, `lib/checkpoints/types.ts` | Checkpoint grader, new fallback reasons | U4 |
| U12 | `app/api/chat/exercises/student/route.ts`, `app/api/exercises/{evaluate,artifact/evaluate}/route.ts`, `lib/exercises/evaluate-{written,artifact}.ts`, `app/api/teacher/preview/{exercise,exercise-run}/route.ts`, `lib/exercises/preview-auth.ts` | Exercise text surfaces | U4, U7 |
| U13 | `lib/speech/{registry,pipeline,providers/assemblyai,coaches/openai}.ts`, `app/api/exercises/media/analyze/route.ts`, `lib/exercises/form-config.ts` | Per-tenant STT and coach, remove vapi and gemini stubs, error codes, `words[]` timestamp mapping | U4 |
| U14 | `app/api/exercises/realtime/{token,evaluate}/route.ts`, `app/api/teacher/preview/realtime/route.ts`, `lib/speech/conversation.ts`, `components/exercises/conversation-exercise.tsx` | Realtime token and evaluate, client descriptor from response | U4 |
| U15 | `lib/exams/grade.ts`, `app/actions/exam-grading.ts`, `app/api/exams/[examId]/grade/route.ts` | Exam grading: real modelId, no-key parks for review, `Output.object` | U4 |
| U16 | `app/api/teacher/lessons/[lessonId]/generate-questions/route.ts`, `app/actions/admin/ai-course.ts`, `app/api/landing/generate/route.ts`, `app/api/chat/course-architect/route.ts` | Generators, `Output.object` migration, architect tools cap and cost warning | U4, U7 |
| U17 | `app/api/internal/ai/image/route.ts`, `mcp-server/src/tools/images.ts`, `mcp-server/.env.example` | Internal endpoint authenticated by `MCP_PROXY_SECRET` and the caller JWT. Tenant comes from the JWT. Daily cap moves to DB. MCP never holds a key or the master key. Can ship after v1 with a "not configured" message | U4 |
| U18 | `instrumentation.ts`, Sentry configs, Langfuse metadata and `ai_trace_content` opt-out | Telemetry hardening | U2 |
| U19 | `lib/ai/config.ts`, `.env.example`, `Dockerfile`, `CLAUDE.md`, docs, `components/ai-elements/speech-input.tsx`, `scripts/json-render-*` | Cleanup: delete model exports, env vars and the dead component. Land last | all |
| U20 | `tests/unit/*`, `tests/playwright/ai-byok*.spec.ts`, `tenant-isolation.spec.ts` | Unit, contract and E2E tests (below), updated alongside each unit | per unit |

Parallelism:
- U1, U2, U3 start together.
- After U4, U8 through U17 are independent. U5 and U6 run alongside them.
- Do U8 and U9 first, as they are the security-critical items.
- U19 is last.

**Tests (U20)**
- *Unit:*
  - crypto: round trip, wrong AAD, tamper, rotation, missing env.
  - resolver: tenant A never gets B's key, order, inherits, `invalid` and `managed` throw.
  - `classifyProviderError`, `redact`, mocked validators (401/403/timeout/redirect refused).
  - Capability gating.
  - Verifier fail-closed.
  - Update the `vi.mock('@/lib/ai/config')` suites to mock `@/lib/ai/tenant-ai`.
- *Contract/static:*
  - Every `AI_FEATURES` key has a call site.
  - No `@ai-sdk/*` import outside `providers.ts`.
  - No `OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY` or `NEXT_PUBLIC_*KEY` reads.
  - No `AI_MODELS` imports.
  - No client import of `lib/ai/byok/*`.
  - No route passes `body.tenantId`.
- *E2E (`--workers=1`, `lvh.me`):*
  - Admin saves a key and only last4 is shown. No response body contains the key or ciphertext.
  - Teacher and student calls to the actions are rejected.
  - Authenticated select on `tenant_ai_credentials` is denied.
  - Cross-tenant isolation, asserted via the Authorization header a stub provider sees.
  - No-key behavior per surface returns the right code with no side-effect rows.
  - Verifier doesn't auto-complete on an invalid key.
  - Exam path degrades to pending review.
  - Plan-gate specs stay green.

## 6. Rollout
1. U1–U4.
2. U5–U6, shipped dark. Tenants add keys.
3. Announce and notify admins.
4. Migrate call sites (U7–U16) in risk order: teacher-only, then graders, then chat, then realtime and STT.
5. In staging, unset `OPENAI_API_KEY` and `ASSEMBLYAI_API_KEY`. Anything missed fails loudly.
6. U19 cleanup, then production cutover.

## 7. Open risks and flags

1. **Cutover breakage.** Existing tenants have no key, so AI breaks at the flip. This is a product decision: immediate fail-closed, or a grace period via `mode='managed'` plus `grace_until` (not built). Needs the user's call.
2. **Master key loss.** Losing `AI_KEYS_ENCRYPTION_KEYS` makes every key unreadable and tenants must re-enter them. Back it up in a secret manager.
3. **Structured output across providers.** Landing's `propsJson` workaround and `streamObject` partials need a per-provider smoke test. The exam regex parser moves to `Output.object`.
4. **STT.** Non-AssemblyAI providers must return word timestamps or the speech metrics (wpm, pauses, fillers) degrade. Flag this in the UI.
5. **Realtime.** Only openai, xai and google. Voice lists are provider-specific. Realtime is `experimental_*` in `ai@7`, so pin the version.
6. **Provider `/models` endpoints** are from memory. Verify them against each provider's docs in U3.
7. **Schema facts unverified.** The remote DB and Docker were not checked. Confirm the `tenants` PK name and re-run `db:types`.
8. **MCP images** need the internal route. Defer to a post-v1 phase if needed, showing "not configured" meanwhile.
9. **Cost exposure.** The course architect is a long agent loop on the tenant's own bill. Show a cost warning and require the `tools` capability.
10. **Langfuse** still holds tenant prompts under platform keys. Keep the `ai_trace_content` opt-out and verify that no headers are recorded.
11. **Super-admin key access.** There is no decrypt UI anywhere. A super admin must not be able to read keys either.
12. **`getUserRole()` in route handlers.** The architect route uses it, but a comment elsewhere says `x-user-id` doesn't reach route handlers. Verify, or use the `tenant_users` query as the preview routes do.
13. **Usage caps.** If `increment_ai_chat_usage` caps stay finite in `platform_plans.limits`, they will still block BYOK tenants. The `-1` backfill must cover every plan.