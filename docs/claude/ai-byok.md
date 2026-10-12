# AI (BYOK) rules

> Moved verbatim from CLAUDE.md (index refactor). Loaded on demand — CLAUDE.md links here.

### AI (BYOK — bring your own key)

Every AI call runs on the **school's own provider key**. **No platform key, no fallback** — a school without a usable key gets a typed error (never someone else's credentials). Admin UI: `/dashboard/admin/settings/ai`. Full guide: `docs/AI_BYOK.md`.

```typescript
const ai = createTenantAi(tenantId)  // @/lib/ai/tenant-ai — tenantId from auth context, NEVER the request body
const { model, providerId, modelId } = await ai.getModelForFeature('lesson_tutor', { require: ['tools'] })
// also ai.getTranscriber() / getRealtime() / getImageModel(); wrap routes in withTenantAi() (lib/ai/with-tenant-ai.ts)
```

- **Resolver order:** `course_ai_tutors` (Aristotle) → `tenant_ai_feature_models` → feature `inherits` parent → `tenant_ai_settings` default → `AiNotConfiguredError`. Features live in `lib/ai/features.ts` (`AiFeature`); a new feature needs a call site (contract test).
- **Only `lib/ai/providers.ts` imports `@ai-sdk/<provider>`** (ESLint + `tests/unit/ai-byok-contract.test.ts`). Sole exception: `lib/speech/realtime-model.ts` (browser parser, holds no key). Never reintroduce `AI_MODELS`/`defaultModel`; `lib/ai/config.ts` is constants only.
- **Keys:** `tenant_ai_credentials`, AES-256-GCM with AAD `tenantId:provider` (`lib/ai/byok/*`, all `server-only`; never import from client code). No grant to `anon`/`authenticated`; read via admin client + explicit `tenant_id` check. Never return, log or Sentry a key — logs use `err.name`/`status`/`redact(msg)`. UI gets masked DTOs (`last4`) from `app/actions/admin/ai-settings.ts` or booleans from `tenant_ai_configured()`.
- **Errors:** 402 `ai_not_configured` · 424 `ai_key_invalid` · 422 `ai_model_unsupported` · 429 `ai_quota` · 502 `ai_provider_error` (never 401/403: client auth handlers sign the user out). Body `{error:{code,feature,canConfigure,settingsUrl}}`.
- **Check order in routes:** auth → access → role → resolve model → rate limit/usage → side effects (a missing key must leave no pending rows/claims/usage).
- Structured output = `generateText` + `Output.object` (no `generateObject`/`streamObject`). Langfuse metadata `{tenantId, feature, provider, modelId}` via `propagateAttributes`; `tenant_ai_settings.ai_trace_content=false` strips prompt/response text (`lib/ai/trace-content-guard.ts`). Sentry `beforeSend` redacts keys.
- Tenant-monthly AI chat caps are non-blocking (`-1` in `platform_plans.limits`); plan feature gates (`ai_grading`, `voice_exercises`) still apply.

