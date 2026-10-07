# AI: bring your own key (BYOK)

Every AI call runs on the school's own provider key. The platform holds **no** AI key and has **no fallback**: a school with no usable key gets a typed error, never someone else's credentials. Admins manage keys and models at `/dashboard/admin/settings/ai`.

## Model

| Piece | Where |
|---|---|
| Encrypted keys | `tenant_ai_credentials` (one row per tenant + provider). `anon`/`authenticated` have no grant; only server code with the service role reads ciphertext. |
| School default model | `tenant_ai_settings` (`default_provider`, `default_model`, `mode`, `ai_trace_content`) |
| Per-feature model | `tenant_ai_feature_models` |
| Aristotle per-course override | `course_ai_tutors.provider/model` |
| Audit (no key material) | `tenant_ai_audit` |
| UI flags ("is AI on?") | `tenant_ai_configured(_tenant_id)` RPC, booleans only; `isAiConfigured()` |

**Providers (fixed allowlist, fixed hosts, no custom base URL):** `openai`, `anthropic`, `google`, `openrouter`, `groq`, `mistral`, `xai`, `deepseek`, and `assemblyai` (speech-to-text only). Provider SDKs are imported **only** in `lib/ai/providers.ts` (ESLint `no-restricted-imports` plus `tests/unit/ai-byok-contract.test.ts`). The one exception is `lib/speech/realtime-model.ts`, the browser's key-free realtime protocol parser.

**Managed billing** (`mode='managed'`) is a reserved seam: it throws `AiPlatformManagedUnavailableError`. Only `byok` exists.

## Resolving a model

```typescript
import { createTenantAi } from '@/lib/ai/tenant-ai'

const ai = createTenantAi(tenantId)            // from getApiAuthContext / getCurrentTenantId, never the body
const { model, providerId, modelId } = await ai.getModelForFeature('exercise_coach', { require: ['tools'] })
// also: ai.getTranscriber(), ai.getRealtime('voice_conversation'), ai.getImageModel()
```

Resolution order for a feature: (1) `course_ai_tutors` (Aristotle features only) -> (2) `tenant_ai_feature_models[feature]` -> (3) the feature's `inherits` parent -> (4) `tenant_ai_settings` default -> else `AiNotConfiguredError`. For stt / realtime / image with nothing mapped, the first allowed provider the school has a key for is used (`KIND_DEFAULTS`).

Rules for call sites:

- **Check order:** auth -> access -> role gate -> resolve model -> rate limit / usage -> side effects. A missing key must leave no pending rows, claims or usage increments.
- Wrap route handlers in `withTenantAi({tenantId, feature, canConfigure}, fn)`; it maps failures to the response below and auto-invalidates a key the provider rejects.
- No module-level cache of keys or models; `createTenantAi` memoizes inside its per-request closure.
- Telemetry: wrap the call in `propagateAttributes({ metadata: { tenantId, feature, provider, modelId } })`. Never put headers or keys in metadata.
- Logging: catch blocks log `err.name`, `status` and `redact(err.message)` only.

### Error responses

No 401/403 (client auth handlers would sign the user out). Body is `{error:{code, feature, canConfigure, settingsUrl}}`; provider bodies are never echoed.

| Code | HTTP | Meaning |
|---|---|---|
| `ai_not_configured` | 402 | No key / no model for the feature |
| `ai_key_invalid` | 424 | Provider rejected the key (credential flipped to `invalid`) |
| `ai_model_unsupported` | 422 | Model lacks a required capability (vision, tools, realtime...) |
| `ai_quota` | 429 | Provider quota / rate limit |
| `ai_provider_error` | 502 | Anything else from the provider |

Client copy comes from `lib/ai/chat-error.ts` + `<AiErrorNotice>` (student: "your school hasn't enabled AI"; teacher: "ask your admin"; admin: link to settings).

## Key storage and rotation

- AES-256-GCM, envelope `v<N>:iv:tag:ct`, AAD `${tenantId}:${provider}` (a row copied to another tenant or provider fails to decrypt). Code: `lib/ai/byok/crypto.ts` (server-only), `crypto-core.ts` (shared with the rotation script).
- Env: `AI_KEYS_ENCRYPTION_KEYS` (JSON `{"1":"<base64 32 bytes>"}`) and `AI_KEYS_ACTIVE_VERSION`. Fails closed when missing or the wrong length.
- A key is validated live against the provider before it is stored; only the last 4 characters are ever shown.
- **Rotate:** add a new version to `AI_KEYS_ENCRYPTION_KEYS`, point `AI_KEYS_ACTIVE_VERSION` at it, deploy (reads lazily re-encrypt), run `npx tsx scripts/rotate-ai-keys.ts --apply` until 0 pending, then drop the old version.
- **Losing `AI_KEYS_ENCRYPTION_KEYS` makes every stored key unreadable** and every school must re-enter theirs. Keep it in a secret manager. Super admins cannot read keys either: there is no decrypt UI.

## Plan gates and caps

Plan feature gates (`ai_grading`, `voice_exercises`, landing `PAID_PLANS`) still apply. Abuse brakes (`aiChatLimiter`, `aiGenerationLimiter`, per-checkpoint / per-student caps) stay. Tenant-monthly AI chat caps (`increment_ai_chat_usage`, `checkAiAllowance`) no longer block: `platform_plans.limits` AI-chat keys are `-1`.

## Telemetry and privacy

- Langfuse spans carry `{tenantId, feature, provider, modelId}`; no request headers are recorded.
- Admins can turn off prompt/response text in traces (Settings > AI > AI traces, `tenant_ai_settings.ai_trace_content`). `lib/ai/trace-content-guard.ts` wraps the Langfuse processor and strips content attributes for opted-out tenants (takes effect within a minute; fails private if the preference cannot be read).
- Sentry: `beforeSend` runs `redactSentryEvent` (`lib/sentry/redact-event.ts`) on server and edge, masking key-shaped strings and credential header values.

## Adding an AI feature

1. Add the id to `AiFeature` / `AI_FEATURES` in `lib/ai/features.ts` (kind, `needs`, `inherits`, `providers`, area).
2. Add its name/description under `aiSettings.features` in `messages/en.json` and `messages/es.json`.
3. In the route: resolve with `createTenantAi(tenantId)` inside `withTenantAi`, in the order above; never read an env key, never import a provider SDK.
4. `tests/unit/ai-byok-contract.test.ts` fails if a feature has no call site or a provider SDK / platform key sneaks back in.

## Cutover note

Existing schools have no key until they add one, so AI fails closed for them at the flip (admins see an "Add an AI key" banner; students see "your school hasn't enabled AI yet"). A grace period would need `mode='managed'` plus a `grace_until`, which is not built.
