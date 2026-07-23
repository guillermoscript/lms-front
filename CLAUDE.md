# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant SaaS LMS built with Next.js 16 (App Router, React 19) and Supabase. Schools operate as independent tenants on subdomains (`school-slug.platform.com`). The platform uses **RLS for data security** — database queries go directly from components, not through server actions.

**Stack:** Next.js 16.1.5 · Supabase (PostgreSQL 15, Auth, Storage) · Shadcn UI (base-mira) · Tailwind CSS v4 · TypeScript strict · Stripe Connect · next-intl (en/es)

## Commands

```bash
npm run dev              # Dev server at http://localhost:3000
npm run build            # Production build (TypeScript + lint check)
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm run test:unit        # Vitest unit tests
npx vitest run -t "name" # Single unit test

supabase db push                # Apply local migrations to cloud
supabase migration new <name>   # Create migration file
npm run db:reset                # Reset local DB (migrations + seed)
npm run db:types                # Regenerate lib/database.types.ts from linked project

npx playwright test              # Run all E2E tests
npx playwright test --ui         # Interactive test runner
npx playwright test -g "name"    # Run single test
```

`/web-design-guidelines <path>` skill audits UI for accessibility + best practices.

Branches: `<type>/<slug>-<issueNumber>` (e.g. `fix/binance-settings-category-479`).

## Architecture

### Multi-Tenancy

Every request goes through `proxy.ts` (the single middleware file — **not** `middleware.ts`), which:
1. Extracts tenant slug from subdomain (`school.lmsplatform.com` → `"school"`)
2. Resolves tenant ID from `tenants` table
3. Injects `x-tenant-id` header into the response
4. Checks `tenant_users` membership; redirects non-members to `/join-school`
5. Enforces role-based route guards (`/dashboard/student`, `/dashboard/teacher`, `/dashboard/admin`)

In development, pass `x-tenant-slug` header to simulate a subdomain.

```typescript
import { getCurrentTenantId } from '@/lib/supabase/tenant'
const tenantId = await getCurrentTenantId() // reads x-tenant-id header
```

Default tenant ID (single-tenant fallback): `00000000-0000-0000-0000-000000000001`

### JWT Claims

`custom_access_token_hook()` injects into every JWT: `user_role` (global), `tenant_role` (`student`/`teacher`/`admin` in current tenant), `tenant_id`, `is_super_admin`.

```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'
const role = await getUserRole()  // tenant_users row is authoritative; falls back to JWT tenant_role/user_role only if no active membership
```

After a tenant switch, **always call `supabase.auth.refreshSession()`** to get updated claims.

### Database Query Pattern

RLS is enabled on all tenant-scoped tables, but **filter by `tenant_id` explicitly anyway** — clarity and performance, not just security:

```typescript
const supabase = await createClient()       // @/lib/supabase/server
const tenantId = await getCurrentTenantId()
const { data } = await supabase.from('courses').select('*').eq('tenant_id', tenantId)
```

**Client imports:** server components → `@/lib/supabase/server` · client components → `@/lib/supabase/client` · admin/bypass-RLS → `createAdminClient()` from `@/lib/supabase/admin`.

When using `createAdminClient()` in server actions, manually validate tenant ownership before writes:
```typescript
const { data: resource } = await adminClient.from('products').select('tenant_id').eq('product_id', id).single()
if (resource.tenant_id !== tenantId) throw new Error('Access denied')
```

### Server Actions vs Direct Queries

Use **direct RLS queries** for all reads. Use **server actions** (in `app/actions/`: `admin/`, `teacher/`, `payment-requests.ts`, `join-school.ts`, `onboarding.ts`) only for multi-step mutations (payment processing, enrollment), service-role operations, or external API calls (Stripe, email).

### Payment Architecture

Two separate Stripe integrations:

| | School Billing (Platform) | Student Payments (Connect) |
|--|--|--|
| **Who pays** | School admin pays platform | Student pays school |
| **Stripe mode** | Billing (Checkout + Subscriptions) | Connect (PaymentIntents) |
| **Webhook** | `/api/stripe/platform-webhook` | `/api/stripe/webhook` |
| **Env var** | `STRIPE_PLATFORM_WEBHOOK_SECRET` | `STRIPE_WEBHOOK_SECRET` |
| **Customer ID** | `tenants.stripe_customer_id` | `profiles.stripe_customer_id` |

Student payments have two flows, both produce a `transaction` and call `enroll_user()` RPC on success:
- **Stripe Connect:** `app/api/stripe/create-payment-intent/route.ts` sets `application_fee_amount` (platform fee) + `transfer_data.destination` (school's account); revenue split in `revenue_splits` (default 20% platform / 80% school)
- **Manual/offline:** student creates a `payment_requests` row (`app/actions/payment-requests.ts`) → admin confirms receipt → `enroll_user()` RPC

Also supported (`products.payment_provider`): `paypal`, `lemonsqueezy`, `solana`, `solana_subs`, `binance` — see `docs/PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md`.

**Key invariants:**
- Transaction `status`: `pending`, `successful`, `failed`, `archived`, `canceled`, `refunded`
- **Access control lives in `entitlements`, not `enrollments`** (since migration `20260516150000`): `entitlements` (`user_id`, `course_id`, `tenant_id`, `source_type`, `source_id`, `status`, `expires_at`) is the polymorphic source of truth for product/subscription access. `enrollments.product_id`/`subscription_id` and their old CHECK constraint were dropped — `enrollments` is now a learning-progress record only (`user_id`, `course_id`, `status`, `tenant_id`, `enrollment_date`)
- `enroll_user()` RPC loops through ALL courses for a product (a product can map to multiple courses via `product_courses`) and writes to `entitlements`
- **Subscriptions grant access, not auto-enrollment** — students self-enroll via `/dashboard/student/browse` (`useEnrollment()` hook); `plan_courses` defines which courses a plan covers
- Transactions have two partial unique indexes (not one): `(user_id, product_id) WHERE plan_id IS NULL AND status IN ('pending','successful')` and `(user_id, plan_id) WHERE product_id IS NULL AND status IN (...)`, plus `transactions_provider_charge_id_unique` for Solana idempotency

### Routing & i18n

All routes live under `app/[locale]/` (`[locale]` is always `/en/` or `/es/`). Public routes (no auth): `/auth/*`, `/`, `/create-school`, `/creators`, `/join-school`, `/platform-pricing`, `/pricing`, `/courses`, `/verify`, `/oauth/consent`. Role routing after login: `/dashboard/student` · `/dashboard/teacher` · `/dashboard/admin`. `/platform/*` is guarded separately by `checkSuperAdmin()` in `proxy.ts`, independent of tenant role.

### Database Schema Essentials

65+ tables. Key groups: multi-tenancy (`tenants`, `tenant_users`, `tenant_settings`, `super_admins`) · users (`profiles` — global, no tenant_id) · content (`courses`, `lessons`, `exercises`, `exams`, `exam_questions`) · progress (`enrollments` — progress only, `lesson_completions`, `exam_submissions`) · commerce (`products`, `plans`, `transactions`, `subscriptions`, `payment_requests`, `entitlements` — course-access source of truth) · revenue (`revenue_splits`, `payouts`, `invoices`) · platform billing (`platform_plans`, `platform_subscriptions`, `platform_payment_requests`) · gamification (12 tables incl. `gamification_profiles`, `xp_transactions`, `achievements`, `challenges`) · certificates · notifications.

`profiles` and `gamification_levels` are global (no `tenant_id`).

**Key RPCs:**
```typescript
supabase.rpc('enroll_user', { _user_id, _product_id })
supabase.rpc('handle_new_subscription', { _user_id, _plan_id, _transaction_id })  // trigger-invoked; writes to entitlements
supabase.rpc('award_xp', { p_user_id, p_action_type, p_reference_id })
supabase.rpc('create_exam_submission', { p_student_id, p_exam_id, p_answers })
supabase.rpc('save_exam_feedback', { submission_id, exam_id, student_id, answers, overall_feedback, score })
supabase.rpc('get_plan_features', { _tenant_id })
```

### Plan Limits & Feature Gating

Limits live in `platform_plans.limits` (JSONB): `free` (5 courses/50 students/10% fee) · `starter` (15/200/5%, $9/mo) · `pro` (100/1000/2%, $29/mo) · `business` (unlimited courses/5000 students, 0% fee, $79/mo) · `enterprise` (unlimited/0%, $199/mo). `get_plan_features(_tenant_id)` RPC is the single source of truth. Client hook: `usePlanFeatures()`. Component: `<FeatureGate feature="..." />`.

## MCP Server

`mcp-server/` exposes LMS course-management tools/resources/prompts/widgets to AI agents, built on **mcp-use** (not raw `@modelcontextprotocol/sdk`). **Read the `mcp-apps-builder` skill before touching it.** Runs standalone on port 3000 (`cd mcp-server && npm run dev`; `npm run mcp:build` from root). Auth is Supabase OAuth 2.1 — every query runs through a request-scoped, RLS-aware client using the caller's token (no service-role data access); role/tenant come from JWT claims, gated per-role in `src/tool-policy.ts`. In production, `app/api/mcp/[[...path]]/route.ts` fronts it at `https://<tenant>.<domain>/api/mcp`. Tool inventory lives in `mcp-server/src/tools/*.ts`, widgets in `mcp-server/resources/<name>/widget.tsx` — read those directly rather than relying on a list here, as they change frequently.

## Environment Variables

See `.env.example` for the full annotated list. Minimum to run locally:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # Bypasses RLS — admin ops only
NEXT_PUBLIC_PLATFORM_DOMAIN=       # e.g. lvh.me for local dev, lmsplatform.com in prod
```
`NEXT_PUBLIC_OPENAI_API_KEY` is exposed to the browser bundle (speech input) — never put a production key there.

## Testing

E2E tests in `tests/playwright/`, four files by priority:
- `multi-tenant-isolation.spec.ts` — P0, 8 tests
- `authentication-security.spec.ts` — P0, 6 tests
- `payment-security.spec.ts` — P0, 7 tests
- `comprehensive-security-audit.spec.ts` — P1/P2, 26 tests

Test accounts (from `supabase/seed.sql`, seeded by `supabase db reset`):
- `student@e2etest.com` / `password123` — student (Default School)
- `owner@e2etest.com` / `password123` — admin (Default School)
- `creator@codeacademy.com` / `password123` — teacher (Code Academy, subdomain `code-academy.lvh.me:3000`)
- `alice@student.com` / `password123` — student (Code Academy)

Pre-commit checklist: `npm run build` · tenant filter on every query · tested with all relevant roles · loading + error states handled.

## Known Pitfalls

- **`product_courses` — never `.single()`**: a course can belong to multiple products.
- **`lesson_completions` uses `user_id`**, not `student_id`. Has **no `tenant_id`** — never filter by it.
- **`exercise_completions` has no `tenant_id`** — filter by `user_id` only.
- **`exams` has no `passing_score` or `allow_retake`** — use 70 as default threshold, assume retakes allowed.
- **`profiles` has no `email`** — get emails via `createAdminClient().auth.admin.getUserById()`.
- **`exam_submissions` order column** is `submission_date`, not `submitted_at`.
- **Transaction status** is `'successful'`, not `'succeeded'`.
- Exam child tables (`exam_questions`, `exam_answers`, `exam_question_scores`, `exam_scores`) have **no `tenant_id`** — filter by exam_id/submission_id only; adding `.eq('tenant_id', …)` errors the whole query.
- **Creating test users via SQL** won't fire `handle_new_user()` — manually insert `profiles`, `user_roles`, `auth.identities`. Use `NULL` for `phone`, `''` for nullable strings.
- **`proxy.ts` is the only middleware** — do not create `middleware.ts` (conflict).
- **`createAdminClient()`** lives in `@/lib/supabase/admin`, NOT `@/lib/supabase/server`.
- **Button component** uses `@base-ui/react` — no `asChild` prop. Wrap `<Link>` around `<Button>` instead.
- **Stripe API v2025 types** need `any` casts for `Subscription`/`Invoice` objects.
- **`getUserRole()` checks `tenant_users` first** (authoritative), resolving the user via the `x-user-id` header — no extra `getUser()` call. It only falls back to `getSession()`-derived JWT claims (`tenant_role`/`user_role`) when there's no active membership row.
- **`isSuperAdmin()`** queries the `super_admins` table directly — does not trust JWT claims.
- **API routes** get tenant context via `proxy.ts` too — `x-tenant-id` is set for `/api/*` routes.
- **`enroll_user()` RPC** loops through ALL courses per product via `product_courses` (FOR loop).

## Security Notes

- **Sentry DSN** is hardcoded in `sentry.server.config.ts` — intentional (public DSN), consider moving to env var for consistency.
- **Test account passwords** (`password123`) are for local development only, seeded by `supabase db reset`. Never use in a deployed environment.

## Key Documentation

- `docs/DATABASE_SCHEMA.md` — complete schema with relationships
- `docs/AUTH.md` — auth flows
- `docs/AI_AGENT_GUIDE.md` — detailed patterns
- `docs/MONETIZATION.md` — school billing, feature gating, LATAM payments, revenue dashboard
- `docs/COMMUNITY_SPACES.md` — community feed, comments, reactions, polls, moderation, security

## Design Context

Users span independent creators/solo educators and multi-staff schools, across LATAM and English-speaking markets (en/es). Brand personality: **minimal, elegant, focused** — content over chrome, no visual noise.

- **Aesthetic:** clean, spacious, content-first; hierarchy via typography weight/size over color/ornament. References: Duolingo/Khan Academy, Teachable/Thinkific. Anti-references: cluttered enterprise dashboards, generic Bootstrap.
- **Theme:** light + dark, tenant theming overrides primary/accent via CSS custom properties (default primary ~293 hue OKLCH).
- **Typography/icons:** Noto Sans (body), Geist Sans/Mono (UI/code); Tabler Icons + Lucide (outline style).
- **Motion:** subtle, via `motion` lib; respect `prefers-reduced-motion`; convey state changes, not decoration.
- **Principles:** content over chrome · obvious over clever · consistent structure across tenants (brand via color/logo, not layout) · WCAG AA by default · progressive disclosure (sheets/dialogs for detail).
- **Stack:** Shadcn UI (base-mira, `@base-ui/react` primitives) · Tailwind v4 with OKLCH tokens · `motion` + `tw-animate-css` · `next-themes` + `TenantCssVars` · `--radius: 0.625rem` base.

When reporting information to me, be extremely concise and sacrifice grammar for sake of concision.
