# BYOK AI — testing handoff (pick up here)

Branch `feat/byok-ai-keys`, worktree `/Users/guillermomarin/Documents/GitHub/lms-front-byok` (from master `fc8eaa9d`). Commit `7c73707c`. Not pushed, no PR.
Design spec (authoritative): `docs/BYOK_AI_SPEC.md`. Code is the source of truth for signatures (`lib/ai/tenant-ai.ts`, `lib/ai/features.ts`, `lib/ai/providers.ts`, `lib/ai/errors.ts`, `app/actions/admin/ai-settings.ts`).

## State
- Every AI call uses the tenant's own provider key + model. No platform-key fallback. `OPENAI_API_KEY` / `ASSEMBLYAI_API_KEY` / `NEXT_PUBLIC_OPENAI_API_KEY` removed from code.
- Verified so far: `npm run typecheck` clean, `npm run build` passes, `npm run test:unit` 204 files / 2957 tests green. Lint: 240 pre-existing errors repo-wide (not from this change).
- NOT verified: migrations never applied (Docker was off), `lib/database.types.ts` hand-edited, no live provider call, no Playwright e2e run, UI never opened in a browser.
- Decision: app has only test users; fail-closed cutover accepted, no grace period / migration of existing tenants. `tenant_ai_settings.mode='managed'` is a reserved seam that throws (future "we bill you" mode).

## Setup (do first)
1. `cd` into the worktree; `npm ci` already done (rerun if missing).
2. Generate master key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   In `.env.local`: `AI_KEYS_ENCRYPTION_KEYS={"1":"<that base64>"}` and `AI_KEYS_ACTIVE_VERSION=1`. Missing/wrong length = app fails closed (by design).
3. Start Docker + `supabase start`; `npm run db:reset` (applies `supabase/migrations/20261004120000_byok_ai.sql` and `20261006130000_ai_image_usage.sql`; rollbacks in `supabase/migrations/rollback/`). Fix any SQL error first.
4. `npm run db:types`, then `git diff lib/database.types.ts` — reconcile the hand-edited types with generated ones.
5. Copy env per memory `local-dev-verification-env` (PORT=3001 if 3000 taken; use `lvh.me`, never localhost). Seed accounts in CLAUDE.md (owner@e2etest.com admin, student@e2etest.com, creator@codeacademy.com admin of Code Academy, alice@student.com).
6. Real test keys needed: at least one OpenAI key (covers chat, realtime voice, STT, image); ideally also Anthropic, Google, Groq/OpenRouter for the multi-provider checks, AssemblyAI for STT. Use throwaway/low-limit keys. Never commit them.

## Test plan

### A. Migration / DB (psql or supabase studio)
- Tables exist: `tenant_ai_credentials`, `tenant_ai_settings`, `tenant_ai_feature_models`, `tenant_ai_audit`, ai image usage table; `course_ai_tutors.provider/model`.
- As `authenticated` (student JWT and admin JWT): `select * from tenant_ai_credentials` must be DENIED (no grant/policy). Same for super admin.
- `tenant_ai_settings` / `tenant_ai_feature_models`: SELECT only own tenant; INSERT/UPDATE/DELETE denied.
- `tenant_ai_configured(tenant)` returns `{provider:true}` for active keys only, `{}` for another tenant's id.
- `platform_plans.limits` AI message keys = -1 on all plans.
- Run rollback files then re-apply to confirm they work.
- Confirm `tenants` PK is `id` and FKs resolve; `ai_trace_content` lives on `tenant_ai_settings` (spec said tenant_settings; deviation is intentional).

### B. Admin settings UI (`/dashboard/admin/settings/ai`, as owner@e2etest.com)
- Add key per provider: invalid key rejected with clear message, nothing stored; valid key stored, UI shows only last4; page source / network responses / RSC payload never contain key or ciphertext (check DevTools Network + view-source).
- Replace, remove (dependent defaults/feature mappings cleared with warning), re-test, refresh models list.
- Default model picker; per-feature "Advanced" pickers grouped by area; capability warnings (e.g. non-vision model for aristotle); hard block on non-realtime/non-STT model for voice/STT features; provider allowlist per feature (speech_stt: assemblyai/openai/groq; voice_conversation: openai/xai/google; image: openai/google).
- "Managed billing" radio is disabled. `ai_trace_content` toggle works.
- Rate limit: >5 saves/min per tenant+user is refused.
- Non-admin (teacher, student) cannot call actions (call server action directly / hit page): rejected; teacher sees read-only status only.
- Admin dashboard banner "Add an AI key" shows when none configured, disappears after. Check en AND es copy, light/dark, mobile width, loading + error states. Audit rows written to `tenant_ai_audit` (set/rotate/delete/validate_fail) with no key material.

### C. Per-surface behavior (WITH key configured) — each must work end-to-end on the tenant's chosen provider/model
Pick a non-OpenAI provider for at least some surfaces to prove it's really per-tenant.
1. Aristotle chat (student) + attachments (image to vision model; to non-vision model expect 422 `ai_model_unsupported`) + restart → summary saved.
2. Per-course Aristotle override (teacher: course tutor settings) beats tenant feature mapping.
3. Lesson AI task chat + lesson completion verifier (completes only when verified).
4. Lesson checkpoint attempt (graded; Output.object works on non-OpenAI).
5. Exercise coach chat; written exercise evaluation; artifact exercise evaluation.
6. Speech: media analyze (STT via AssemblyAI/OpenAI/Groq; word timestamps → wpm/pauses/fillers metrics still sane; non-timestamp providers degrade, UI should say so).
7. Realtime voice conversation (token route → browser connects with ephemeral token only; check browser never sees the real key; evaluate route afterwards).
8. Exam AI grading of free-text answers; stored `ai_model` equals real model id.
9. Teacher: generate lesson questions; preview routes (lesson-task, exercise, exercise-run, realtime) — staff-only.
10. Admin: AI starter course, landing page generator (`/api/landing/generate` — structured output on non-OpenAI; see skill `ai-landing-builder` invariants; `PAID_PLANS` gate was left as-is, flagged for product decision), Course Architect agent (needs tool-calling capability; long loop on tenant's bill).
11. MCP image generation (`mcp-server` -> `/api/internal/ai/image`, authenticated by `MCP_PROXY_SECRET` + caller JWT; MCP holds no keys). Needs mcp-server env; may be skipped if too heavy — then confirm the "not configured" message.

### D. No key / bad key (critical — fail closed with NO side effects)
Remove all keys (or use a tenant with none) and hit every surface above:
- Expected HTTP: `ai_not_configured` 402, `ai_key_invalid` 424, `ai_model_unsupported` 422, `ai_quota` 429, `ai_provider_error` 502 (never 401/403 — client would sign user out). Body `{error:{code,feature,canConfigure,settingsUrl}}`, no provider body echoed.
- UI shows `<AiErrorNotice>` with role-specific copy (student: "school hasn't enabled AI"; teacher: ask admin; admin: link to settings). Aristotle trigger hidden for students when unconfigured.
- DB: no pending rows, no usage increments, no claims created (esp. realtime token route resolves BEFORE inserting pending row; realtime evaluate before claim).
- Aristotle restart with no key: session closes with `summary=null`, no 500.
- Lesson verifier: fails CLOSED on key/quota/unclassified errors (never auto-completes); only genuine timeouts/network fail open.
- Checkpoints: graceful fallback with `fallback_reason` `ai_not_configured`/`ai_key_invalid`.
- Exams: free text parked for teacher review (not scored 0); model omitting a question => retryable 500, nothing saved.
- Invalid key (revoke it at provider): first failing call flips credential `status='invalid'` + audit `auto_invalidated`; settings page shows it; fixing key re-activates.

### E. Security / isolation
- Tenant isolation: tenant A (default school) and B (Code Academy `code-academy.lvh.me:3000`) with different keys; confirm each request hits the provider with its own key (stub provider via `AI_PROVIDER_BASE_URL_OVERRIDE`, honored only when NODE_ENV!=='production', to assert Authorization header). Request with another tenant's `x-tenant-id` / body tenantId is ignored.
- Key never in: browser bundles (`grep` `.next/static` after build for `sk-`), server logs, Sentry events (`lib/sentry/redact-event.ts`), Langfuse spans, error responses. `ai_trace_content=false` strips prompts/outputs from spans.
- Crypto: wrong AAD / tampered envelope fails; rotation via `npx tsx scripts/rotate-ai-keys.ts` (dry run, then `--apply`) after adding key v2 and bumping `AI_KEYS_ACTIVE_VERSION`; old rows lazily re-encrypt on read.
- SSRF: providers have fixed hosts; confirm no free-form base URL anywhere; validators use timeout + `redirect:'manual'`.
- Verify the deleted route `app/api/teacher/exams/[examId]/grade/route.ts` has no remaining caller (it had no auth).
- Tighten check: artifact evaluate requires both exercise.tenant_id and course.tenant_id match.

### F. Regression / automation to write or fix
- Run `npm run test:unit` (must stay green) and `npm run typecheck`, `npm run build`.
- `tests/playwright/ai-chat-attachments.spec.ts` (and any spec exercising AI) likely assumed a platform key — update to seed a credential (stub provider) or skip with a reason + issue link.
- Spec section 5 lists the intended Playwright spec `tests/playwright/ai-byok*.spec.ts` (admin saves key/last4 only; teacher/student action rejection; authenticated select on credentials denied; cross-tenant isolation via stub; no-key per surface; verifier no auto-complete; exam parks). Not written yet — write it (`--workers=1`, `lvh.me`).
- Plan-gate specs (`plan-limit-surfaces`, `plan-feature-tiers`, `access-cutoff-lifecycle`) must stay green; `hasPlanFeature` gates (`voice_exercises`, `ai_grading`) are unchanged.
- Existing rate limiters (`aiChatLimiter`, `aiGenerationLimiter`, per-checkpoint caps) intentionally kept as abuse brakes; tenant monthly caps made non-blocking.

## Known gaps / open items
- Data-deletion path not updated for `tenant_ai_credentials` (FK cascade covers tenant delete only).
- Provider `/models` validation endpoints were checked by the agent against docs but never run live; verify each (OpenRouter uses `/api/v1/key`; Google strips `models/` prefix).
- Realtime is `experimental_*` in `ai@7`; `ai` pinned exactly at 7.0.129. Voice list differs per provider.
- Residual `OPENAI_API_KEY` refs: `supabase/config.toml:91` and `.agents/skills/ai-elements/scripts/speech-input.tsx` (untouched).
- Env: add `AI_KEYS_ENCRYPTION_KEYS` / `AI_KEYS_ACTIVE_VERSION` to GitHub Actions/Dokploy + back up master key in a secret manager (loss = every tenant must re-enter keys). Sentry/Langfuse still use platform keys.
- Full `tsc` once OOMed on a stale `tsconfig.tsbuildinfo` (gitignored) — delete it if it recurs.
- Landing `PAID_PLANS` gate and Course Architect cost warning: product decisions pending.
- After testing passes: push branch, open PR (use `ship-pr`), consider `/code-review`.

## Suggested skills for next agent
`ai-sdk` (verify APIs from node_modules docs, never memory), `supabase`, `next-best-practices`, `security-review`, `web-design-guidelines` (settings UI), `ui-evidence` (GIFs/screenshots for the PR), `agent-browser` or `claude-in-chrome` (UI walkthrough), `ai-landing-builder` (landing generation), `mcp-apps-builder` (image tool), `ship-pr`, `code-review`.
