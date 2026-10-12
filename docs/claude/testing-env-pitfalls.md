# Testing, env, pitfalls, security

> Moved verbatim from CLAUDE.md (index refactor). Loaded on demand — CLAUDE.md links here.

## Environment Variables

See `.env.example` for the full annotated list. Minimum to run locally:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # Bypasses RLS — admin ops only
NEXT_PUBLIC_PLATFORM_DOMAIN=       # e.g. lvh.me for local dev, lmsplatform.com in prod
```
AI needs `AI_KEYS_ENCRYPTION_KEYS` (JSON `{"1":"<base64 32B>"}`) + `AI_KEYS_ACTIVE_VERSION` — the master key that encrypts schools' stored AI keys; back it up, losing it makes every key unreadable. There is **no** platform AI key: `OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY`, `NEXT_PUBLIC_OPENAI_API_KEY` are not read anywhere.

## Testing

E2E tests in `tests/playwright/` — 33 spec files (tenant isolation, auth security, payment flows, enrollment, entitlements, gamification, community, i18n, platform panel, plan change, teacher/admin CRUD). Read the directory rather than a list here; it changes often. Highest-priority: `tenant-isolation.spec.ts`, `auth-security.spec.ts`, `payment-flows.spec.ts`, `evaluations-security.spec.ts`.

Plan-gate specs (`plan-limit-surfaces`, `access-cutoff-lifecycle`, `plan-feature-tiers`, `platform-billing-stripe-webhook`) each own a dedicated tenant and a hidden `platform_plans` row with tiny limits (`tests/playwright/utils/plan-gate-fixtures.ts`) — every enforcement path reads the plan by slug with no `is_active` filter, so "at the cap" costs one row, not fifty users. Never move the seeded tenants off their plan.

The Playwright config boots its own `webServer` (`next dev` locally on the `BASE_URL` port, reusing a server already listening; `next start` in CI). Use `lvh.me` (never `localhost`), and keep `--workers=1` locally or GoTrue rate-limits the sign-ins. Every spec lives in `tests/playwright/` — the only `testDir` — and every skip carries a reason (permanent ones link an issue); see `tests/README.md`. Unit tests: `npm run test:unit` (Vitest, `tests/unit/`).

Test accounts (from `supabase/seed.sql`, seeded by `supabase db reset`):
- `student@e2etest.com` / `password123` — student (Default School)
- `owner@e2etest.com` / `password123` — admin (Default School) **+ super admin** (`/platform/*`)
- `creator@codeacademy.com` / `password123` — **admin** (Code Academy, subdomain `code-academy.lvh.me:3000`)
- `alice@student.com` / `password123` — student (Code Academy)

Pre-commit checklist: `npm run typecheck` + `npm run build` · tenant filter on every query · tested with all relevant roles · loading + error states handled.

## Known Pitfalls

- **`product_courses` — never `.single()`**: a course can belong to multiple products.
- **`lesson_completions` uses `user_id`**, not `student_id`. Has **no `tenant_id`** — never filter by it.
- **`exercise_completions` has no `tenant_id`** — filter by `user_id` only.
- **`exams` has no `passing_score` or `allow_retake`** — use 70 as default threshold, assume retakes allowed.
- **`profiles` has no `email`** — get emails via `createAdminClient().auth.admin.getUserById()`.
- **`exam_submissions` order column** is `submission_date`, not `submitted_at`.
- **Transaction status** is `'successful'`, not `'succeeded'`.
- Exam child tables (`exam_questions`, `exam_answers`, `exam_question_scores`, `exam_scores`, `question_options`) have **no `tenant_id`** — filter by exam_id/submission_id only; adding `.eq('tenant_id', …)` errors the whole query. `exam_questions` also has **no `sequence`**.
- **`exercise_completions` uses `user_id`**, not `student_id`, and stores only `score` + `completed_at` — submissions/feedback live in `exercise_evaluations` and the `exercise_*_submissions` tables.
- **`subscriptions` uses `subscription_status`** (not `status`), `provider_subscription_id` (not `stripe_subscription_id`), and `created` (not `created_at`).
- **`plans` uses `plan_name` and `duration_in_days`** — there is no `name`, no `interval`, no `status`. Soft-deleted via `deleted_at`.
- **`transactions` has three unique indexes**, product-shaped and plan-shaped kept separate plus `(payment_provider, provider_charge_id)` for webhook idempotency — see `docs/DATABASE_SCHEMA.md`.
- **Creating test users via SQL** won't fire `handle_new_user()` — manually insert `profiles`, `user_roles`, `auth.identities`. Use `NULL` for `phone`, `''` for nullable strings.
- **`proxy.ts` is the only middleware** — do not create `middleware.ts` (conflict).
- **`createAdminClient()`** lives in `@/lib/supabase/admin`, NOT `@/lib/supabase/server`.
- **Button component** uses `@base-ui/react` — no `asChild` prop. Wrap `<Link>` around `<Button>` instead.
- **Stripe API v2025 types** need `any` casts for `Subscription`/`Invoice` objects.
- **`getUserRole()` checks `tenant_users` first** (authoritative), resolving the user via the `x-user-id` header — no extra `getUser()` call. It only falls back to `getSession()`-derived JWT claims (`tenant_role`/`user_role`) when there's no active membership row AND the token's `tenant_id` is the current tenant — the hook stamps `tenant_role` for the user's home school, and proxy.ts skips membership checks on public routes, so trusting the claim on another subdomain handed out that school's admin actions (#763).
- **`isSuperAdmin()`** queries the `super_admins` table directly — does not trust JWT claims.
- **API routes** get tenant context via `proxy.ts` too — `x-tenant-id` is set for `/api/*` routes.
- **`enroll_user()` RPC** loops through ALL courses per product via `product_courses` (FOR loop).

## Security Notes

- **Sentry DSN comes from `NEXT_PUBLIC_SENTRY_DSN`, never a literal.** It was hardcoded in the three `Sentry.init` files until a third-party Vercel fork of this repo (deployed without Supabase env vars) filled our issue stream with its own crashes. Unset = `Sentry.init` no-ops.
- **Build-time env vars do NOT live in Dokploy.** `.github/workflows/deploy.yml` builds the image in GitHub Actions and pushes to `ghcr.io`; Dokploy only pulls it. Every `NEXT_PUBLIC_*` (plus `SENTRY_AUTH_TOKEN`) is a Docker `build-args` entry backed by an Actions variable/secret and a matching `ARG`/`ENV` pair in the Dockerfile's builder stage. Adding one to the Dokploy service environment is a silent no-op.
- **Test account passwords** (`password123`) are for local development only, seeded by `supabase db reset`. Never use in a deployed environment.

