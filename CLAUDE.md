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
| **Webhook** | `/api/billing/webhook/stripe` | `/api/stripe/webhook` |
| **Env var** | `STRIPE_PLATFORM_WEBHOOK_SECRET` | `STRIPE_WEBHOOK_SECRET` |
| **Customer ID** | `tenants.stripe_customer_id` | `profiles.stripe_customer_id` |

Student payments have two flows, both produce a `transaction` and call `enroll_user()` RPC on success:
- **Stripe Connect:** `app/api/stripe/create-payment-intent/route.ts` sets `application_fee_amount` (platform fee) + `transfer_data.destination` (school's account); revenue split in `revenue_splits` (default 20% platform / 80% school)
- **Manual/offline:** student creates a `payment_requests` row (`app/actions/payment-requests.ts`) → admin confirms receipt → `enroll_user()` RPC

Also supported (`products.payment_provider`): `paypal`, `lemonsqueezy`, `solana`, `solana_subs`, `binance` — see `docs/PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md`.

**School billing is not Stripe-only either.** `POST /api/billing/checkout` runs on whichever provider has an active `platform_plan_prices` row and carries `supportsPlatformBillingCheckout` — Stripe, Lemon Squeezy, Binance Pay and Solana (#610). Two things follow that no Stripe-shaped code expects:
- **The crypto rails have no subscription object.** One payment buys one period, `dispatchPlatformBillingEvent` derives `current_period_end` from the interval (`selfManagedPeriod`), and `/api/cron/expire-platform-subscriptions` reminds/graces/downgrades every rail with `selfManagedPeriod`, not just `manual`. A second checkout on the same crypto rail is a *renewal* and must not be blocked or supersede anything.
- **Solana has no webhook and no redirect.** `/api/billing/webhook/solana` 404s by design; the QR page polls `/api/billing/solana/verify`, which proves the transfer on chain and dispatches through the same function the webhooks use. The pending intent is a `platform_payment_requests` row (`provider_reference` → the wallet-facing `/api/billing/solana/tx`, `provider_charge_id` UNIQUE → one signature settles one request).

**Key invariants:**
- Transaction `status`: `pending`, `successful`, `failed`, `archived`, `canceled`, `refunded`
- **`subscriptions.cancel_at_period_end` is the ONLY signal that a cancel is scheduled** (since `20260726120000`, issue #545). `cancel_at` is nullable and purely informational — the CHECK `subscriptions_cancel_at_requires_schedule` allows it to be non-NULL only while the flag is set, so clear both together (both reactivate actions do). It shipped as `NOT NULL DEFAULT now()` with no writer setting it, which made the Solana crank cancel every subscription at its first rollover. `subscription_status` is `active`/`canceled`/`expired`/`renewed`/`past_due`; `renewed` and `past_due` both count as LIVE (parallel-subscription guards, billing UI, plan change), and cancelling must never *improve* a status
- **A refund is not all-or-nothing (since #547).** A PARTIAL refund keeps `transactions.status = 'successful'` and records the slice in `refunded_amount` (major units of the row's own currency); only a FULL refund sets `refunded_amount = amount`, flips `status` to `'refunded'` and revokes the entitlement. Every money sum must use `amount - refunded_amount` (`netOfRefunds()` in `lib/payments/payouts-owed.ts`). `NormalizedBillingEvent.amount` is always MAJOR units, converted in each provider's own mapper (Lemon Squeezy reports cents, Binance a USD-pegged stablecoin); an absent amount or a currency mismatch falls back to a full refund
- **Whether the platform takes a fee is `ProviderCapabilities.bearsPlatformFee`, never `revenue_splits.applies_to_providers`** (retired in #547 — it stored the labels `stripe`/`manual`, not provider slugs, so every PayPal/LS/Binance sale bore 0% on the school's screens while `getPayoutsOwed` applied the full split). The *rate* always comes from the transaction's own `school_percentage_snapshot`, so the school-facing and platform-facing figures reconcile. `transactions` has **no `created_at`** — it is `transaction_date`; querying or merely ordering by the former 42703s the whole request
- **Access control lives in `entitlements`, not `enrollments`** (since migration `20260516150000`): `entitlements` (`user_id`, `course_id`, `tenant_id`, `source_type`, `source_id`, `status`, `expires_at`) is the polymorphic source of truth for product/subscription access. `enrollments.product_id`/`subscription_id` and their old CHECK constraint were dropped — `enrollments` is now a learning-progress record only (`user_id`, `course_id`, `status`, `tenant_id`, `enrollment_date`)
- `enroll_user()` RPC loops through ALL courses for a product (a product can map to multiple courses via `product_courses`) and writes to `entitlements`
- **Subscriptions grant access, not auto-enrollment** — students self-enroll via `/dashboard/student/browse` (`useEnrollment()` hook); `plan_courses` defines which courses a plan covers
- Transactions have two partial unique indexes (not one): `(user_id, product_id) WHERE plan_id IS NULL AND status IN ('pending','successful')` and `(user_id, plan_id) WHERE product_id IS NULL AND status IN (...)`, plus `transactions_provider_charge_id_unique` for Solana idempotency
- **`transactions` is server-write-only.** `authenticated` has no INSERT grant (#538) and an UPDATE grant on only `status`, `provider_subscription_id`, `stripe_payment_intent_id` (#528) — every insert uses `createAdminClient()` or a SECURITY DEFINER function. `amount` and the `settlement_*` columns decide what the buyer owes (`settlement_base` is what the on-chain Solana payment is verified against), so they are derived from `products`/`plans` server-side, never taken from the request. A user-scoped insert fails with `permission denied for table transactions` — by design, not a bug to re-grant around

### Routing & i18n

All routes live under `app/[locale]/` (`[locale]` is always `/en/` or `/es/`). Public routes (no auth): `/auth/*`, `/`, `/create-school`, `/creators`, `/join-school`, `/platform-pricing`, `/pricing`, `/courses`, `/verify`, `/oauth/consent`. Role routing after login: `/dashboard/student` · `/dashboard/teacher` · `/dashboard/admin`. `/platform/*` is guarded separately by `checkSuperAdmin()` in `proxy.ts`, independent of tenant role.

### Database Schema Essentials

116 tables. Key groups: multi-tenancy (`tenants`, `tenant_users`, `tenant_settings`, `super_admins`) · users (`profiles` — global, no tenant_id) · content (`courses`, `lessons`, `exercises`, `exams`, `exam_questions`) · progress (`enrollments` — progress only, `lesson_completions`, `exam_submissions`) · commerce (`products`, `plans`, `transactions`, `subscriptions`, `payment_requests`, `entitlements` — course-access source of truth) · revenue (`revenue_splits`, `payouts`, `invoices`) · platform billing (`platform_plans`, `platform_subscriptions`, `platform_payment_requests`) · gamification (10 `gamification_*` tables incl. `gamification_profiles`, `gamification_xp_transactions`, `gamification_achievements`; plus leagues in `league_tiers`/`league_memberships`) · certificates · notifications.

`profiles` and `gamification_levels` are global (no `tenant_id`).

**Key RPCs:**
```typescript
supabase.rpc('enroll_user', { _user_id, _product_id })
supabase.rpc('handle_new_subscription', { _user_id, _plan_id, _transaction_id, _start_date })  // trigger-invoked; writes to entitlements
supabase.rpc('has_course_access', { _user_id, _course_id })  // access check; _course_id is integer — cast ::int from SQL
supabase.rpc('award_xp', { _user_id, _action_type, _xp_amount, _reference_id, _reference_type })  // overload adds _tenant_id
supabase.rpc('create_exam_submission', { p_student_id, p_exam_id, p_answers })
supabase.rpc('save_exam_feedback', { p_submission_id, p_exam_id, p_student_id, p_answers, p_overall_feedback, p_score, p_question_feedback, p_ai_model, p_processing_time_ms })
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

E2E tests in `tests/playwright/` — 33 spec files (tenant isolation, auth security, payment flows, enrollment, entitlements, gamification, community, i18n, platform panel, plan change, teacher/admin CRUD). Read the directory rather than a list here; it changes often. Highest-priority: `tenant-isolation.spec.ts`, `auth-security.spec.ts`, `payment-flows.spec.ts`, `evaluations-security.spec.ts`.

The Playwright config has no `webServer` — start `npm run dev` yourself first, use `lvh.me` (never `localhost`), and keep `--workers=1` locally or GoTrue rate-limits the sign-ins. Unit tests: `npm run test:unit` (Vitest, `tests/unit/`).

Test accounts (from `supabase/seed.sql`, seeded by `supabase db reset`):
- `student@e2etest.com` / `password123` — student (Default School)
- `owner@e2etest.com` / `password123` — admin (Default School) **+ super admin** (`/platform/*`)
- `creator@codeacademy.com` / `password123` — **admin** (Code Academy, subdomain `code-academy.lvh.me:3000`)
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

**Canonical source: [`PRODUCT.md`](PRODUCT.md) (strategy) + [`DESIGN.md`](DESIGN.md) (visual system).** Read PRODUCT.md before any UI work — it carries the register (`product`, with `(public)/*` and Puck blocks in `brand`), the four user groups, the anti-references, and the five design principles. The summary below is a pointer, not the authority.

Users span independent creators/solo educators and multi-staff schools, across LATAM and English-speaking markets (en/es). Brand personality: **minimal, elegant, focused** — content over chrome, no visual noise.

- **Aesthetic:** clean, spacious, content-first; hierarchy via typography weight/size over color/ornament. References: Duolingo/Khan Academy, Teachable/Thinkific. Anti-references: cluttered enterprise dashboards, generic Bootstrap.
- **Theme:** light + dark, tenant theming overrides primary/accent via CSS custom properties. Default primary is **teal-cyan** `oklch(0.52 0.105 223.128)` light / `oklch(0.45 0.085 224.283)` dark — hue ~223, not 293. Nothing may depend on that hue holding; tenants override it.
- **Typography/icons:** Noto Sans (body), Geist Sans/Mono (UI/code); Tabler Icons + Lucide (outline style).
- **Motion:** subtle, via `motion` lib; respect `prefers-reduced-motion`; convey state changes, not decoration.
- **Principles:** content over chrome · obvious over clever · consistent structure across tenants (brand via color/logo, not layout) · WCAG AA by default · progressive disclosure (sheets/dialogs for detail).
- **Stack:** Shadcn UI (base-mira, `@base-ui/react` primitives) · Tailwind v4 with OKLCH tokens · `motion` + `tw-animate-css` · `next-themes` + `TenantCssVars` · `--radius: 0.625rem` base.

When reporting information to me, be extremely concise and sacrifice grammar for sake of concision.
