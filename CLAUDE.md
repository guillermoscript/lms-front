# CLAUDE.md

Index for the LMS app. Inline = rules that bite on every task; everything else is a pointer. Read the linked file **before** working in that area. Report to the user extremely concisely (grammar optional).

## What this is

Multi-tenant SaaS LMS: Next.js 16 (App Router, React 19) + Supabase (Postgres/RLS/Auth/Storage) + Shadcn (base-mira, `@base-ui/react`) + Tailwind v4 + TS strict + Stripe Connect + next-intl (en/es). Schools = tenants on subdomains. Reads go **directly from components via RLS**, not server actions.

## Commands

```bash
npm run dev | build | lint | test:unit      # build has no type check
npm run typecheck                           # only type check (8 GB heap; CI verify job)
npx vitest run -t "name"                    # single unit test
npx playwright test -g "name" --workers=1   # E2E; use lvh.me, never localhost
supabase migration new <name> | db push     # migrations; npm run db:reset (local)
npm run db:types                            # regen lib/database.types.ts (--linked = CLOUD)
```
Branches: `<type>/<slug>-<issue#>`. Skill `/web-design-guidelines <path>` audits UI.

## Rules that apply everywhere

- `proxy.ts` is the ONLY middleware (never `middleware.ts`): resolves tenant from subdomain, sets `x-tenant-id`/`x-user-id`, role route guards.
- Tenant: `getCurrentTenantId()` (`@/lib/supabase/tenant`). Role: `getUserRole()` (`@/lib/supabase/get-user-role`, `tenant_users` authoritative). After tenant switch → `supabase.auth.refreshSession()`.
- Clients: server `@/lib/supabase/server` · client `@/lib/supabase/client` · bypass-RLS `createAdminClient()` from `@/lib/supabase/admin` (validate `tenant_id` manually before writes).
- RLS is on, but **still `.eq('tenant_id', tenantId)`** — except tables without it (below).
- Server actions (`app/actions/`) only for multi-step mutations, service-role ops, external APIs.
- Button has no `asChild`: `<Button render={<Link/>}>` or wrap `<Link>`. Dropdown/Breadcrumb triggers use `render`.
- All routes under `app/[locale]/`; user strings in `messages/{en,es}.json` (parity test).
- AI is BYOK: no platform key, no fallback. Only `lib/ai/providers.ts` imports `@ai-sdk/*`. Never log/return keys.
- Never `git add -A` after a build (rewrites `next-env.d.ts`); stage named paths.

## Schema gotchas (top hits; full list → docs/claude/testing-env-pitfalls.md)

- No `tenant_id`: `profiles`, `gamification_levels`, `lesson_completions`, `exercise_completions`, exam child tables (`exam_questions`, `exam_answers`, `question_options`, …).
- `lesson_completions`/`exercise_completions` use `user_id`; `exam_submissions` order col = `submission_date`; `transactions` date = `transaction_date`, status `'successful'`.
- `subscriptions`: `subscription_status`, `provider_subscription_id`, `created`. `plans`: `plan_name`, `duration_in_days`, soft-delete `deleted_at`.
- Access lives in `entitlements`, not `enrollments` (progress only). `product_courses`: never `.single()`.
- `transactions` is server-write-only (admin client / SECDEF). `profiles` has no email.

## Index: where things live

| Area | Code | Docs / read first |
|---|---|---|
| Multi-tenancy, JWT, query pattern, routing, schema, RPCs | `proxy.ts`, `lib/supabase/`, `lib/tenant/`, `app/api/tenant/` | docs/claude/architecture.md · docs/AUTH.md · docs/DATABASE_SCHEMA.md |
| Student/teacher/admin dashboards | `app/[locale]/dashboard/{student,teacher,admin}`, `components/{student,teacher,admin}` | docs/MVP_USER_JOURNEYS.md |
| Platform (super-admin) console | `app/[locale]/platform/`, `app/actions/platform/`, `components/platform/` | docs/PLATFORM_ADMIN.md |
| Public site, checkout, `/p/[slug]` landing | `app/[locale]/(public)/`, `components/public/` | PRODUCT.md |
| Auth, onboarding, join/create school | `app/[locale]/auth/`, `onboarding/`, `lib/auth/`, `app/actions/{onboarding,join-school}.ts` | docs/AUTH.md · docs/AUTH_EMAIL_SETUP.md |
| Student payments (Stripe Connect, PayPal, LS, Binance, Solana, manual) | `lib/payments/`, `app/api/{stripe,payments}/`, `app/actions/payment-requests.ts` | docs/claude/payments.md · docs/MANUAL_PAYMENT_SYSTEM.md · docs/PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md |
| School billing, fees, access cutoff | `lib/billing/`, `app/api/billing/`, `app/api/cron/` | docs/MONETIZATION.md · docs/PLATFORM_FEE_LEDGER_DESIGN.md · docs/CRON_RUNBOOK.md |
| Provider adapters (one file each) | `lib/payments/{stripe,paypal,lemonsqueezy,binance,binance-personal,solana,manual}-*.ts`, `webhook-dispatch.ts`, `subscription-guard.ts` | docs/claude/payments.md |
| Payouts / revenue / invoices | `lib/payments/payouts-owed.ts`, `app/[locale]/dashboard/admin/{payouts,revenue}` | docs/claude/payments.md |
| Plan limits & feature gates | `lib/plans/`, `lib/billing/plan-limits.ts`, `components/shared/feature-gate.tsx` | docs/claude/plans-gating.md |
| AI BYOK, tutor (Aristotle), chat | `lib/ai/`, `app/api/{chat,aristotle}/`, `components/{ai,aristotle}/` | docs/claude/ai-byok.md · docs/AI_BYOK.md · docs/AI_AGENT_GUIDE.md |
| Page Architect / Puck landing builder | `lib/{page-builder,puck,landing-pages}/`, `app/api/landing/`, `packages/core/` | skill `ai-landing-builder` · docs/PAGE_ARCHITECT.md |
| Courses, lessons, MDX, checkpoints | `components/{teacher,lesson}/`, `lib/{lesson,lessons,checkpoints}/` | docs/MDX_COMPONENTS.md |
| Exams & grading | `lib/exams/`, `app/api/exams/`, `app/actions/exam-grading.ts` | `submit_exam` RPC is the only write path |
| Exercises, code challenges, voice | `lib/{exercises,speech}/`, `app/api/exercises/`, `components/exercises/` | docs/claude/exercise-ai-eval-standard.md |
| Community spaces | `lib/community/`, `components/community/`, `app/actions/community.ts` | docs/COMMUNITY_SPACES.md |
| Gamification, leagues | `lib/hooks/use-{gamification,league}*.ts`, `components/gamification/`, `supabase/functions/` | docs/GAMIFICATION.md |
| Spaced review (FSRS) | `components/student/{review-session,due-reviews-banner}.tsx`, `app/[locale]/dashboard/student/reviews` | migration `*_add_fsrs_to_review_cards` |
| Invitations | `lib/tenant/join-school.ts`, `app/actions/admin/invitations.ts`, `app/[locale]/join-school` | — |
| Certificates | `lib/certificates/`, `app/api/certificates/`, `app/[locale]/verify/` | template-gated issue |
| Notifications, push, email | `lib/{notifications,email}/`, `app/api/cron/send-pushes` | — |
| Theming / brand | `lib/themes/kit.ts`, `components/{theme-kit,tenant}/`, `app/globals.css` | DESIGN.md · docs/claude/design-context.md |
| i18n | `messages/`, `i18n.ts`, `lib/i18n/` | docs/I18N_GUIDE.md |
| Analytics / observability | `lib/analytics/`, `lib/sentry/`, `instrumentation*.ts` | docs/ANALYTICS_OPENPANEL.md |
| MCP server (mcp-use, OAuth 2.1) | `mcp-server/`, `app/api/mcp/` | docs/claude/mcp-server.md · skill `mcp-apps-builder` · docs/MCP_SETUP.md |
| Account deletion | `lib/account/`, `app/api/account/delete` | — |
| DB migrations / seed | `supabase/migrations/`, `seed.sql`, `scripts/` | docs/MIGRATIONS.md · docs/CRON_RUNBOOK.md |
| Env vars, deploy | `.env.example`, `Dockerfile`, `.github/workflows/deploy.yml` | docs/ENV_VARIABLES.md · docs/DEPLOYMENT.md · docs/claude/testing-env-pitfalls.md |

## Testing

Unit: `tests/unit/` (Vitest). E2E: `tests/playwright/` (only testDir; every skip needs a reason → `tests/README.md`). Priority specs: `tenant-isolation`, `auth-security`, `payment-flows`, `evaluations-security`. Plan-gate specs own hidden `platform_plans` rows (`utils/plan-gate-fixtures.ts`). Accounts: `student@e2etest.com`, `owner@e2etest.com` (admin + super admin), `creator@codeacademy.com` (code-academy), all `password123`, local only. Detail → docs/claude/testing-env-pitfalls.md.

## Design

Read PRODUCT.md before UI work and DESIGN.md for tokens. Minimal, content-first, WCAG AA, tenant theme via CSS vars; light+dark. Detail → docs/claude/design-context.md.

## Project skills (`.claude/skills/`)

`ai-landing-builder`, `supabase`, `next-best-practices`, `shadcn`, `mcp-apps-builder`, `security-review`, `web-design-guidelines`, `work-issue` → `ship-pr` → `pr-review-loop` (GitHub flow). Subagents (`.claude/agents/`): analyst → refactor → qa-report.

## Pre-commit

`npm run typecheck` + `npm run build` · tenant filter on every query · test each relevant role · loading + error states handled.

## Maintaining this file

Keep < 200 lines. Add pointers, not prose; put detail in `docs/claude/*.md` (plain paths, not `@imports` — those load eagerly). Delete rules that code/tests already enforce.
