# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant SaaS LMS built with Next.js 16 (App Router, React 19) and Supabase. Schools operate as independent tenants on subdomains (`school-slug.platform.com`). The platform uses **RLS for data security** — database queries go directly from components, not through server actions.

**Stack:** Next.js 16.1.5 · Supabase (PostgreSQL 15, Auth, Storage) · Shadcn UI (base-mira) · Tailwind CSS v4 · TypeScript strict · Stripe Connect · next-intl (en/es)

## Commands

```bash
npm run dev          # Dev server at http://localhost:3000
npm run build        # Production build (TypeScript + lint check)
npm run lint         # ESLint

supabase db push     # Apply local migrations to cloud
supabase migration new <name>  # Create migration file

npx playwright test                    # Run all E2E tests
npx playwright test --ui               # Interactive test runner
npx playwright test -g "test name"     # Run single test
```

## Available Skills

```bash
/web-design-guidelines app/dashboard/student/page.tsx   # Audit UI for accessibility + best practices
```

## Architecture

### Multi-Tenancy

Every request goes through `proxy.ts` (the single middleware file — **not** `middleware.ts`), which:
1. Extracts tenant slug from subdomain (`school.lmsplatform.com` → `"school"`)
2. Resolves tenant ID from `tenants` table
3. Injects `x-tenant-id` header into the response
4. Checks `tenant_users` membership; redirects non-members to `/join-school`
5. Enforces role-based route guards (`/dashboard/student`, `/dashboard/teacher`, `/dashboard/admin`)

In development, pass `x-tenant-slug` header to simulate a subdomain.

**Getting tenant context in server components:**
```typescript
import { getCurrentTenantId } from '@/lib/supabase/tenant'
const tenantId = await getCurrentTenantId() // reads x-tenant-id header
```

**Default tenant ID** (single-tenant fallback): `00000000-0000-0000-0000-000000000001`

### JWT Claims

The `custom_access_token_hook()` DB function injects into every JWT:
- `user_role` — global role
- `tenant_role` — role within current tenant (`student` | `teacher` | `admin`)
- `tenant_id` — current tenant UUID
- `is_super_admin` — platform super admin flag

Read claims in components via:
```typescript
import { getUserRole } from '@/lib/supabase/get-user-role'
const role = await getUserRole()  // reads tenant_role, falls back to user_role
```

After a tenant switch, **always call `supabase.auth.refreshSession()`** to get updated claims.

### Database Query Pattern

**All queries must filter by tenant_id** — RLS is enabled on ALL tenant-scoped tables (courses, enrollments, transactions, products, exams, exercises, lessons, plans, product_courses, subscriptions, course_categories, exam_submissions, and more). Explicit filters are still required for clarity and performance:

```typescript
// ✅ Correct — server component
const supabase = await createClient()       // @/lib/supabase/server
const tenantId = await getCurrentTenantId()
const { data } = await supabase
  .from('courses')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('status', 'published')

// ❌ Wrong — missing tenant filter
const { data } = await supabase.from('courses').select('*')
```

**Client imports:**
- Server components / Route Handlers → `@/lib/supabase/server`
- Client components → `@/lib/supabase/client`
- Admin operations (bypass RLS) → `createAdminClient()` from `@/lib/supabase/admin`

**When using `createAdminClient()` in server actions**, manually validate tenant ownership before writes:
```typescript
const { data: resource } = await adminClient
  .from('products')
  .select('tenant_id')
  .eq('product_id', id)
  .single()
if (resource.tenant_id !== tenantId) throw new Error('Access denied')
```

### Server Actions vs Direct Queries

**Use direct RLS queries** for all reads. **Use server actions** only for:
- Multi-step mutations (payment processing, enrollment)
- Service-role operations (admin actions)
- External API calls (Stripe, email)

Server actions live in `app/actions/` (`admin/`, `teacher/`, `payment-requests.ts`, `join-school.ts`, `onboarding.ts`).

### Payment Architecture

Two flows, both produce a `transaction` record and call `enroll_user()` RPC on success:

**Stripe (Connect):**
- `app/api/stripe/create-payment-intent/route.ts` — creates PaymentIntent with `application_fee_amount` (platform fee) and `transfer_data.destination` (school's Stripe account)
- Revenue splits in `revenue_splits` table (default 20% platform / 80% school)
- Webhook at `app/api/stripe/webhook/route.ts` handles `payment_intent.succeeded`, `charge.refunded`, `payout.paid`

**Manual/Offline:**
- Student creates a `payment_requests` row via `app/actions/payment-requests.ts`
- Admin sends instructions → confirms receipt → system calls `enroll_user()` RPC

**Key invariants:**
- Transaction `status` values: `pending`, `successful`, `failed`, `archived`, `canceled`, `refunded`
- `enrollments` require either `product_id` OR `subscription_id` (CHECK constraint — not both, not neither)
- `enroll_user()` RPC sets `status = 'active'`; enrollment status is `'active'` or `'disabled'`
- Products have `payment_provider` column: `stripe` | `manual` | `paypal`

### Routing & i18n

All app routes live under `app/[locale]/`. The `[locale]` segment is always present (`/en/`, `/es/`).

Public routes (no auth required): `/auth/*`, `/`, `/create-school`, `/creators`, `/join-school`, `/platform-pricing`, `/pricing`, `/courses`, `/verify`

Role routing after login: `/dashboard/student` · `/dashboard/teacher` · `/dashboard/admin`

### Database Schema Essentials

**65+ tables total.** Key groups:

| Group | Tables |
|-------|--------|
| Multi-tenancy | `tenants`, `tenant_users`, `tenant_settings`, `super_admins` |
| Users | `profiles` (global — no tenant_id), `user_roles` |
| Content | `courses`, `lessons`, `exercises`, `exams`, `exam_questions`, `question_options` |
| Progress | `enrollments`, `lesson_completions`, `exam_submissions` |
| Commerce | `products`, `plans`, `transactions`, `subscriptions`, `payment_requests` |
| Revenue | `revenue_splits`, `payouts`, `invoices` |
| Platform Billing | `platform_plans`, `platform_subscriptions`, `platform_payment_requests` |
| Gamification | 12 tables: `gamification_profiles`, `xp_transactions`, `levels`, `achievements`, `user_achievements`, `store_items`, `redemptions`, `challenges`, `challenge_participants`, `leaderboard_cache`, `daily_caps`, `user_rewards` |
| Certificates | `certificates`, `certificate_templates` |
| Notifications | `notifications` (has tenant_id), `user_notifications`, `notification_templates`, `notification_preferences` |

**`profiles` and `gamification_levels` are global** (no `tenant_id` column).

**Key RPCs:**
```typescript
supabase.rpc('enroll_user', { _user_id, _product_id })
supabase.rpc('handle_new_subscription', { _user_id, _plan_id })
supabase.rpc('award_xp', { p_user_id, p_action_type, p_reference_id })
supabase.rpc('create_exam_submission', { student_id, exam_id, answers })
supabase.rpc('save_exam_feedback', { submission_id, exam_id, student_id, answers, overall_feedback, score })
supabase.rpc('get_plan_features', { _tenant_id })  // Returns plan features/limits for billing
```

**`product_courses`** can have multiple rows per course (one course → many products). Never use `.single()` on it.

### Plan Limits & Feature Gating

Plan limits are stored in `platform_plans` table (JSONB `limits` column) and enforced dynamically:
- `free` → 5 courses, 50 students, 10% transaction fee
- `starter` → 15 courses, 200 students, 5% fee ($9/mo)
- `pro` → 100 courses, 1000 students, 2% fee ($29/mo)
- `business` → unlimited courses/students, 0% fee ($79/mo)
- `enterprise` → unlimited, 0% fee ($199/mo)

Feature gating uses `get_plan_features(_tenant_id)` RPC as single source of truth. Client hook: `usePlanFeatures()` from `lib/hooks/use-plan-features.ts`. Component: `<FeatureGate feature="..." />` from `components/shared/feature-gate.tsx`.

### Payment Architecture — Two Stripe Integrations

| | School Billing (Platform) | Student Payments (Connect) |
|--|--|--|
| **Who pays** | School admin pays platform | Student pays school |
| **Stripe mode** | Stripe Billing (Checkout + Subscriptions) | Stripe Connect (PaymentIntents) |
| **Webhook** | `/api/stripe/platform-webhook` | `/api/stripe/webhook` |
| **Env var** | `STRIPE_PLATFORM_WEBHOOK_SECRET` | `STRIPE_WEBHOOK_SECRET` |
| **Customer ID** | `tenants.stripe_customer_id` | `profiles.stripe_customer_id` |

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # Bypasses RLS — admin ops only
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=             # For Connect webhook (student payments)
STRIPE_PLATFORM_WEBHOOK_SECRET=    # For Billing webhook (school plan payments)
NEXT_PUBLIC_PLATFORM_DOMAIN=       # e.g. lmsplatform.com (for subdomain routing)
```

## Testing

E2E tests in `tests/playwright/`. Four files by priority:
- `multi-tenant-isolation.spec.ts` — P0, 8 tests
- `authentication-security.spec.ts` — P0, 6 tests
- `payment-security.spec.ts` — P0, 7 tests
- `comprehensive-security-audit.spec.ts` — P1/P2, 26 tests

Test accounts: `student@test.com` / `teacher@test.com` / `admin@test.com` — all `password123`

Pre-commit checklist: `npm run build` · tenant filter on every query · tested with all relevant roles · loading + error states handled

## Known Pitfalls

- **`product_courses` — never `.single()`**: a course can belong to multiple products.
- **`lesson_completions` uses `user_id`**, not `student_id`.
- **`exam_submissions` order column** is `submission_date`, not `submitted_at`.
- **Transaction status** is `'successful'`, not `'succeeded'`.
- **Creating test users via SQL** won't fire `handle_new_user()` trigger — manually insert `profiles`, `user_roles`, and `auth.identities`. Use `NULL` for `phone` (unique constraint), `''` for nullable string columns.
- **`proxy.ts` is the only middleware** — do not create `middleware.ts` (conflict).
- **After tenant switch**, call `supabase.auth.refreshSession()` to update JWT claims.
- **`createAdminClient()`** lives in `@/lib/supabase/admin`, NOT `@/lib/supabase/server`.
- **Button component** uses `@base-ui/react` — no `asChild` prop. Wrap `<Link>` around `<Button>` instead.
- **Stripe API v2025** types need `any` casts for `Subscription` and `Invoice` objects (type breaking changes).
- **`getUserRole()` uses `getUser()`** (server-verified), NOT `getSession()` (reads unverified JWT from cookies).
- **`isSuperAdmin()` queries `super_admins` table** directly — does NOT trust JWT claims.
- **API routes get tenant context** via `proxy.ts` — the `x-tenant-id` header is set for all routes including `/api/*`.
- **`enroll_user()` RPC** loops through ALL courses per product (FOR loop) — a product can have multiple courses via `product_courses`.
- **Transactions unique constraint** is a partial index on `(user_id, product_id, plan_id) WHERE status IN ('pending', 'successful')` — allows retries after failed payments.

## Key Documentation

- `docs/DATABASE_SCHEMA.md` — complete schema with relationships
- `docs/AUTH.md` — auth flows
- `docs/AI_AGENT_GUIDE.md` — detailed patterns
- `docs/MONETIZATION.md` — school billing, feature gating, LATAM payments, revenue dashboard
- `docs/FEBRUARY_2026_IMPLEMENTATION_SUMMARY.md` — full record of multi-tenant SaaS implementation
- `MULTI_TENANT_IMPLEMENTATION_SUMMARY.md` — multi-tenant architecture deep dive
- `E2E_TESTING_AND_SECURITY_AUDIT_PLAN.md` — 47 test scenarios with steps

## Design Context

### Users
Both independent educators/creators and established schools/academies. Creators sell courses online as solo operators or small teams; institutions manage students, staff, and curriculum. Users span LATAM and English-speaking markets (en/es). Students need a focused learning environment; teachers/admins need efficient management tools.

### Brand Personality
**Minimal, elegant, focused.** The interface should feel refined and quiet — letting course content and learning activities take center stage. No visual noise, no unnecessary decoration.

### Emotional Goals
- **Confidence & clarity** — users feel in control, navigation is obvious, actions are unambiguous
- **Calm & focus** — distraction-free environment for learning and teaching
- **Progress & achievement** — sense of momentum through the gamification system, completions, and certificates

### Aesthetic Direction
- **Visual tone:** Clean, spacious, content-first. Generous whitespace. Subtle hierarchy through typography weight and size rather than color or ornament.
- **References:** Duolingo/Khan Academy (engaging learning with personality, progress mechanics), Teachable/Thinkific (familiar course platform patterns, functional clarity)
- **Anti-references:** Overly complex enterprise dashboards, cluttered admin panels, generic Bootstrap templates
- **Theme:** Light + dark mode supported. Default primary color is open to evolution (currently purple ~293 hue OKLCH). Tenant theming overrides primary/accent via CSS custom properties.
- **Typography:** Noto Sans (body), Geist Sans/Mono (UI/code). Clean, readable hierarchy.
- **Icons:** Tabler Icons + Lucide React. Consistent stroke-based outline style.
- **Motion:** Purposeful and subtle (`motion` library). Respect `prefers-reduced-motion`. Animations should convey state changes, not decorate.

### Design Principles
1. **Content over chrome** — every pixel should serve the learning experience. Remove anything that doesn't help the user accomplish their task.
2. **Obvious over clever** — navigation, actions, and status should be immediately understandable. No hidden gestures, no mystery icons.
3. **Consistent across tenants** — the platform provides a cohesive structural experience while tenants express brand through color and logo, not layout.
4. **Accessible by default** — WCAG AA compliance. Good contrast ratios, keyboard navigable, screen-reader friendly. Respect reduced-motion preferences.
5. **Progressive disclosure** — show what's needed now, reveal complexity as users go deeper. Keep surfaces clean, use sheets/dialogs/expandable sections for detail.

### Technical Design Stack
- **Component library:** Shadcn UI (base-mira variant) with `@base-ui/react` primitives
- **Styling:** Tailwind CSS v4 with OKLCH color tokens in CSS custom properties
- **Animations:** `motion` (Framer Motion v12) + `tw-animate-css`
- **Theming:** `next-themes` (system/light/dark) + tenant CSS variable overrides via `TenantCssVars`
- **Spacing/radius:** Shadcn defaults with `--radius: 0.625rem` base
