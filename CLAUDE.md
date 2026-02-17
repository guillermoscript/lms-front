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

**All queries must filter by tenant_id** — RLS enforces this at DB level too, but explicit filters are required:

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
- Admin operations (bypass RLS) → `createAdminClient()` from `@/lib/supabase/server`

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

Public routes (no auth required): `/auth/*`, `/`, `/create-school`, `/creators`, `/join-school`

Role routing after login: `/dashboard/student` · `/dashboard/teacher` · `/dashboard/admin`

### Database Schema Essentials

**56 tables total.** Key groups:

| Group | Tables |
|-------|--------|
| Multi-tenancy | `tenants`, `tenant_users`, `tenant_settings`, `super_admins` |
| Users | `profiles` (global — no tenant_id), `user_roles` |
| Content | `courses`, `lessons`, `exercises`, `exams`, `exam_questions`, `question_options` |
| Progress | `enrollments`, `lesson_completions`, `exam_submissions` |
| Commerce | `products`, `plans`, `transactions`, `subscriptions`, `payment_requests` |
| Revenue | `revenue_splits`, `payouts`, `invoices` |
| Gamification | 12 tables: `gamification_profiles`, `xp_transactions`, `levels`, `achievements`, `user_achievements`, `store_items`, `redemptions`, `challenges`, `challenge_participants`, `leaderboard_cache`, `daily_caps`, `user_rewards` |
| Certificates | `certificates`, `certificate_templates` |
| Notifications | `notifications` |

**`profiles` and `gamification_levels` are global** (no `tenant_id` column).

**Key RPCs:**
```typescript
supabase.rpc('enroll_user', { _user_id, _product_id })
supabase.rpc('handle_new_subscription', { _user_id, _plan_id })
supabase.rpc('award_xp', { p_user_id, p_action_type, p_reference_id })
supabase.rpc('create_exam_submission', { student_id, exam_id, answers })
supabase.rpc('save_exam_feedback', { submission_id, exam_id, student_id, answers, overall_feedback, score })
```

**`product_courses`** can have multiple rows per course (one course → many products). Never use `.single()` on it.

### Plan Limits

Enforced in `app/actions/teacher/courses.ts`:
- `free` → 5 courses
- `basic` → 20 courses
- `professional` → 100 courses
- `enterprise` → unlimited

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # Bypasses RLS — admin ops only
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
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

## Key Documentation

- `docs/DATABASE_SCHEMA.md` — complete schema with relationships
- `docs/AUTH.md` — auth flows
- `docs/AI_AGENT_GUIDE.md` — detailed patterns
- `docs/FEBRUARY_2026_IMPLEMENTATION_SUMMARY.md` — full record of multi-tenant SaaS implementation
- `MULTI_TENANT_IMPLEMENTATION_SUMMARY.md` — multi-tenant architecture deep dive
- `E2E_TESTING_AND_SECURITY_AUDIT_PLAN.md` — 47 test scenarios with steps
