# Monetization System — School Billing, Feature Gating & LATAM Payments

**Implementation Date:** February 18, 2026
**Status:** COMPLETE — All 5 phases implemented
**Files Created:** 23 new files
**Files Modified:** 9 existing files

---

## Executive Summary

Implemented the full business monetization stack for the LMS platform:
- **School billing** via Stripe Checkout (card) and manual bank transfer
- **5-tier pricing** (Free → Enterprise) with feature gating
- **Dynamic transaction fees** that decrease with higher plans
- **LATAM payment support** with multi-currency and structured bank details
- **Revenue dashboard** for school admins
- **Upgrade nudges** and limit warnings throughout the UI

---

## Pricing Matrix

| | Free | Starter $9/mo | Pro $29/mo | Business $79/mo | Enterprise $199/mo |
|--|:---:|:---:|:---:|:---:|:---:|
| **Courses** | 5 | 15 | 100 | Unlimited | Unlimited |
| **Students** | 50 | 200 | 1,000 | 5,000 | Unlimited |
| **Transaction fee** | 10% | 5% | 2% | 0% | 0% |
| XP / Levels / Streaks | Yes | Yes | Yes | Yes | Yes |
| Leaderboard | — | Yes | Yes | Yes | Yes |
| Achievements | — | Yes | Yes | Yes | Yes |
| Point Store | — | — | Yes | Yes | Yes |
| Certificates | Basic | Custom | Custom | Custom | Custom |
| Analytics | — | Basic | Advanced | Advanced | Advanced |
| AI Auto-Grading | — | — | Yes | Yes | Yes |
| Voice Exercises | — | — | Yes | Yes | Yes |
| Custom Branding | — | — | — | Yes | Yes |
| Custom Domain | — | — | — | Yes | Yes |
| API Access | — | — | — | — | Yes |
| White-Label | — | — | — | — | Yes |
| Priority Support | — | — | Yes | Yes | Yes |

Yearly pricing: ~17% discount (e.g. Starter $90/year instead of $108).

---

## Architecture

### Database Tables (New)

| Table | Purpose |
|-------|---------|
| `platform_plans` | Plan definitions: slug, name, prices (monthly/yearly), Stripe price IDs, features JSONB, limits JSONB, transaction_fee_percent |
| `platform_subscriptions` | One per tenant. Tracks Stripe subscription ID, status, payment method, billing period. `UNIQUE(tenant_id)` |
| `platform_payment_requests` | Manual bank transfer requests for plan upgrades. Status flow: `pending` → `instructions_sent` → `payment_received` → `confirmed` |

### Altered Tables

- **`tenants`** — Added: `stripe_customer_id`, `billing_email`, `billing_period_end`, `billing_status`
- **`currency_type` enum** — Added: `mxn`, `cop`, `clp`, `pen`, `ars`, `brl`

### Key Distinction: Two Stripe Integrations

| | School Billing (NEW) | Student Payments (EXISTING) |
|--|--|--|
| **Who pays** | School admin pays platform | Student pays school |
| **Stripe mode** | Stripe Billing (Checkout + Subscriptions) | Stripe Connect (PaymentIntents) |
| **Webhook** | `/api/stripe/platform-webhook` | `/api/stripe/webhook` |
| **Webhook secret** | `STRIPE_PLATFORM_WEBHOOK_SECRET` | `STRIPE_WEBHOOK_SECRET` |
| **Customer ID stored in** | `tenants.stripe_customer_id` | `profiles.stripe_customer_id` |
| **Revenue** | Platform revenue (SaaS fees) | School revenue (course sales) |

### Single Source of Truth: `get_plan_features()`

The `get_plan_features(_tenant_id UUID)` PostgreSQL function (and its edge function wrapper `get-plan-features`) is the **single source of truth** for what a tenant can access. It:

1. Reads `tenants.plan` (slug like `'free'`, `'starter'`, etc.)
2. Looks up `platform_plans` for the matching slug
3. Returns `{ plan, plan_name, features, limits, transaction_fee_percent }`

All plan checks should go through this function, NOT hardcoded constants.

---

## File Reference

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/stripe/checkout-session` | POST | Creates Stripe Checkout Session for school plan upgrade. Verifies admin role. |
| `/api/stripe/billing-portal` | POST | Creates Stripe Billing Portal session for managing subscription/invoices. |
| `/api/stripe/platform-webhook` | POST | Handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid` |

### Server Actions (`app/actions/admin/billing.ts`)

| Action | Purpose |
|--------|---------|
| `getSubscriptionStatus()` | Current plan, billing dates, usage stats (courses/students vs limits) |
| `getAvailablePlans()` | All active platform plans |
| `requestManualPlanUpgrade(planId, interval)` | Creates `platform_payment_requests` row for bank transfer |
| `getManualPaymentRequests()` | Lists pending requests for current tenant |
| `confirmManualPayment(requestId)` | **Super admin only**: confirms bank transfer, activates plan |
| `cancelSubscription()` | Sets `cancel_at_period_end` via Stripe API or marks manual sub |

### Server Actions (`app/actions/admin/revenue.ts`)

| Action | Purpose |
|--------|---------|
| `getRevenueOverview()` | Total revenue, platform fees, net revenue, revenue by product, monthly trend |

### Pages

| Page | Purpose |
|------|---------|
| `/dashboard/admin/billing` | Billing dashboard: current plan, usage meters, pending requests |
| `/dashboard/admin/billing/upgrade` | Plan comparison + checkout (Stripe or bank transfer) |
| `/dashboard/admin/revenue` | Revenue dashboard with summary cards and trends |
| `/dashboard/admin/landing-page` | Landing page builder using **Puck v0.20** visual editor (feature-gated to Starter+) |
| `/platform-pricing` | **Public** pricing page for school owners (no auth required) |

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `BillingOverview` | `components/admin/billing-overview.tsx` | Current plan card with usage bars |
| `PlanComparisonTable` | `components/admin/plan-comparison-table.tsx` | 5-column feature matrix, monthly/yearly toggle |
| `ManualTransferForm` | `components/admin/manual-transfer-form.tsx` | Bank transfer request form |
| `UsageMeter` | `components/admin/usage-meter.tsx` | Progress bar (green → yellow at 80% → red at 100%) |
| `BankDetailsForm` | `components/admin/bank-details-form.tsx` | Structured bank details with country-specific labels |
| `FeatureGate` | `components/shared/feature-gate.tsx` | Wraps content, shows UpgradeNudge if plan too low |
| `UpgradeNudge` | `components/shared/upgrade-nudge.tsx` | Lock icon + "Upgrade to {plan}" CTA |
| `LimitReachedBanner` | `components/shared/limit-reached-banner.tsx` | Warning/error banner when approaching/at limit |

### Libraries

| File | Purpose |
|------|---------|
| `lib/plans/features.ts` | `PlanFeatures`/`PlanLimits` types, `canAccessFeature()`, `isAtLimit()`, `FEATURE_REQUIRED_PLAN` map (includes `voice_exercises: 'pro'`, `ai_grading: 'pro'`, `landing_pages: 'starter'`) |
| `lib/hooks/use-plan-features.ts` | Client hook: calls `get-plan-features` edge function, returns `{ plan, features, limits, loading }` |
| `lib/currency.ts` | `toCents()`/`fromCents()`/`formatCurrency()`, zero-decimal handling, `SUPPORTED_CURRENCIES`, `getRoutingNumberLabel()` |

### Edge Functions

| Function | Purpose |
|----------|---------|
| `supabase/functions/get-plan-features/` | Returns plan features/limits for authenticated user's tenant |

---

## How Plan Changes Work

### Via Stripe Checkout (Card Payment)

```
Admin clicks "Subscribe" → POST /api/stripe/checkout-session
  → Creates Stripe Checkout Session
  → Redirects to Stripe hosted page
  → Student pays
  → Stripe fires checkout.session.completed webhook
  → platform-webhook handler:
    1. Upserts platform_subscriptions
    2. Updates tenants.plan = new slug
    3. Updates tenants.billing_status = 'active'
    4. Updates revenue_splits.platform_percentage to match new plan's fee
```

### Via Manual Bank Transfer

```
Admin clicks "Pay via bank transfer" → requestManualPlanUpgrade()
  → Creates platform_payment_requests row (status: 'pending')
  → Platform sends bank instructions via email (manual step)
  → Admin makes bank transfer
  → Super admin calls confirmManualPayment(requestId)
    1. Updates request status to 'confirmed'
    2. Upserts platform_subscriptions (payment_method: 'manual_transfer')
    3. Updates tenants.plan
    4. Updates revenue_splits
```

### Cancellation

```
Admin clicks "Cancel" → cancelSubscription()
  → If Stripe: sets cancel_at_period_end on Stripe subscription
  → If manual: marks cancel_at_period_end in DB
  → At period end, Stripe fires customer.subscription.deleted
  → Webhook downgrades to free plan
```

---

## Feature Gating

### Server-Side Check

```typescript
// In server actions/components
import { createAdminClient } from '@/lib/supabase/admin'

const adminClient = createAdminClient()
const { data } = await adminClient.rpc('get_plan_features', { _tenant_id: tenantId })
const features = data?.features
if (!features?.ai_grading) {
  throw new Error('AI grading requires Pro plan')
}
```

### Client-Side Check

```tsx
import { usePlanFeatures } from '@/lib/hooks/use-plan-features'
import { FeatureGate } from '@/components/shared/feature-gate'

function MyComponent() {
  const { plan, features, limits, loading } = usePlanFeatures()

  return (
    <FeatureGate feature="ai_grading" plan={plan} features={features}>
      <AIGradingPanel />
    </FeatureGate>
  )
}
```

### Student Limit Enforcement

`app/actions/join-school.ts` checks `platform_plans.limits.max_students` before allowing a new student to join. Returns an error if at limit.

### Course Limit Enforcement

`app/actions/teacher/courses.ts` reads `platform_plans.limits.max_courses` from the database (not hardcoded). Returns `approaching: true` with `nextPlan` and `nextPlanPrice` when at 80%+ usage.

The two sections above are **creation-time soft caps only** — they block a *new* student from joining or a *new* course from being created once a tenant is at its limit. Neither one does anything about students/courses that already exist when a tenant ends up over its plan's limit (e.g. after a downgrade, or by organically outgrowing its plan with no plan-change event). That gap was issue #494; it's closed by the mechanism below.

### Post-Downgrade Access Enforcement (issue #494)

`lib/billing/access-cutoff.ts` is the single place that decides and schedules `tenants.access_cutoff_at`:

- Whenever a tenant's usage is checked, `countTenantUsage`/`computePlanLimitViolations` (`lib/billing/plan-limits.ts`) compare current course/active-student counts against the tenant's **current** plan limits. If either is over limit and no cutoff is already scheduled, `reconcileAccessCutoff()` schedules `access_cutoff_at` `ACCESS_CUTOFF_GRACE_DAYS` (14 days) out and emails the tenant's admins immediately via `accessCutoffWarningTemplate` (`lib/email/templates/access-cutoff-warning.ts`), naming the exact cutoff date and which limit(s) are exceeded. If usage drops back under the limit, the next reconciliation clears the scheduled cutoff automatically.
- `reconcileAccessCutoff()` is called from every plan-state transition: `downgradeTenantToFree()` (both the Stripe `customer.subscription.deleted` webhook and the manual-transfer expiry cron), `changePlan()` and `confirmManualPayment()` in `app/actions/admin/billing.ts`, `applyPortalPlanChange()` (`lib/payments/platform-plan-change.ts`), and a daily cron `app/api/cron/enforce-plan-limits/route.ts` that sweeps every tenant to catch organic over-limit growth with no associated plan-change event.
- Enforcement itself is in the database: once `access_cutoff_at` passes while the tenant is still over its plan's limits, `has_course_access()` (SQL function, migration `supabase/migrations/20260724130000_access_cutoff_enforcement.sql`) starts returning `false` for every student in that tenant. Access is restored automatically as soon as usage is back under the limit or the tenant upgrades.
- That function is enforced in two layers (issue #509 — before it, the cutoff was a no-op on exactly the pages that serve content):
  - **RLS** (`supabase/migrations/20260724150000_content_entitlement_rls.sql`): the `authenticated` SELECT policies on `lessons`, `exercises`, `exams` and `lesson_resources` all require `has_course_access()`, with escape hatches for the course's author and for active teachers/admins of the tenant (`is_tenant_staff()`). Published preview lessons (`is_preview`) stay readable to everyone. This is the backstop — it holds even where a page uses the service-role client.
  - **Page gates**: `requireCourseAccess()` (`lib/services/course-access-guard.ts`) on every student course route — course detail, lessons, exercises (list + detail), exams (list, taker, result, review), community. A refusal caused by the tenant cutoff (rather than by a missing entitlement) sends the student to `/dashboard/student/access-suspended`, which explains that the school is over its limits and that their enrollment is intact.
  - **API-route gates**: an API route that reads through `createAdminClient()` is outside the RLS backstop by construction, so it has to carry the check itself. The routes that serve or produce paid content all call `hasCourseAccess()` / `resolveCourseAccessState()` (`lib/services/course-access.ts` — the API-safe module; `course-access-guard.ts` imports `next/navigation` and is for pages only): `api/certificates/generate`, `api/chat/aristotle`, `api/exercises/artifact/evaluate`, `api/exercises/media/upload-url`, `api/exercises/media/analyze`, `api/exercises/media/signed-url`, and `api/lesson-checkpoints/[checkpointId]/attempt`. The checkpoint route returns a 403 that distinguishes a suspension from a missing entitlement, so the checkpoint UI can say which one it is.
- **An `enrollments` row is not an access grant** (issue #532). Since migration `20260516150000` it is a learning-progress record: nothing revokes it (refunds revoke *entitlements*, and `access_cutoff_at` is read only inside `has_course_access()`), and its RLS INSERT policy now requires `has_course_access()` precisely because it used to be self-issuable by any tenant member. Gate on entitlements — never on an enrollment row.
- This is a deliberate decision, not an oversight: with no production users yet, real enforcement was shipped directly rather than grandfathering pre-existing over-limit usage.

#### Blast radius — the cutoff is tenant-wide and all-or-nothing (issue #517)

This is the single most important property of the mechanism and the easiest one to misread from the description above, so it is stated here explicitly.

`has_course_access()` gates on `t.access_cutoff_at IS NULL OR t.access_cutoff_at > now()` with **no per-student predicate**. Once the cutoff passes, access is denied for **every student in the tenant, across every course**, regardless of who or what caused the tenant to go over its limit:

- A free-plan school (50-student limit) that enrols its 51st student loses course access for **all 51** — not for the one student over the line, and not only for new enrolments.
- A school over its *course* limit also loses **student** access; the two limits share one cutoff.
- Restoration is equally all-or-nothing: the moment usage is back under the limit or the plan is upgraded, access returns for everyone at once. There is no partial or staged restoration.

What the cutoff does **not** touch:

- `enrollments`, `entitlements`, `transactions` and progress records are untouched — nothing is deleted, revoked or refunded. The cutoff is a gate in front of the data, not a mutation of it.
- Teachers, admins and course authors keep access, via the `is_tenant_staff()` / author escape hatches in the RLS policies — so a school can still fix its content while cut off.
- Published preview lessons (`is_preview`) stay public, so the school's funnel keeps working.
- Other tenants are unaffected; `access_cutoff_at` lives on the `tenants` row.

**Why all-or-nothing.** #493 §1.1 offered two options — "read-only mode past N days over limit" or "a hard student-count cutoff" — and the hard cutoff is the one that shipped. Narrowing it to only the students over the limit (e.g. the most recently enrolled) was considered and rejected: it would make one student's access depend on the join order of their peers, produce a support burden that is impossible to explain to the student affected, and require a per-student ordering rule inside a `STABLE SECURITY DEFINER` function on the hot path of every content read. The blunt version is legible to the school admin — who is the person who can actually fix it — and is reversible in one action. If per-student narrowing is ever revisited it should be its own issue, not a change smuggled into the enforcement function.

#### Notification ladder (issue #517)

Because the blast radius is this wide, the school has to be told more than once. #494 sent exactly one email at scheduling time — a design consequence of `decideAccessCutoffAction()` returning `'schedule'` only once per cutoff — with no retry if it failed and no message on the day access actually stopped.

- **Ladder:** `scheduled` (immediately, T-14) → `reminder_7d` → `reminder_1d` → `enforced` (the first sweep after access actually stops). `accessCutoffWarningTemplate({ stage, ... })` gives each rung its own subject and copy; the `enforced` notice is written in the past tense.
- **Ledger:** `access_cutoff_notifications` (migration `20260725100000_access_cutoff_notifications.sql`), one row per `(tenant_id, cutoff_at, stage)` under a unique constraint. Keyed on `cutoff_at` as well as tenant, so a cleared-then-rescheduled cutoff correctly starts a fresh ladder for its new deadline. Service-role only: RLS is enabled with no policies.
- **Retry:** a ledger row is written **only** when at least one admin address actually received the mail. A rung nobody received stays unrecorded and is therefore still due on the next daily sweep. `dueCutoffNotificationStage()` returns at most one rung — always the most urgent reached-but-unsent one — so an undelivered early rung is superseded rather than queued behind an urgent one (no "you have 7 days" landing beside "access is now paused").
- **Where it runs:** `app/api/cron/enforce-plan-limits/route.ts` passes `notifyDueStages: true`. No new cron entry was added — the sweep that already visits every tenant daily is exactly the cadence the ladder needs. Its response reports `notified` (per stage) and `notifyFailures`, so a failing mail provider is visible in the cron log instead of silent. Event-driven call sites (join-school, course creation, plan changes) do **not** pass the flag, so user-facing actions never pay email latency for a reminder the cron will send anyway.

#### In-app signals (issue #517)

- **Tenant admins**: `<AccessCutoffBanner />` (`components/shared/access-cutoff-banner.tsx`) renders in the dashboard shell (`app/[locale]/dashboard/layout.tsx`) for `role === 'admin'`, on every admin page rather than only on billing. Two states — scheduled (days remaining) and active (access paused) — both naming the school-wide blast radius in the same words as the email. Deliberately **not** dismissible: a dismissed countdown to losing all student access is indistinguishable from no countdown. Backed by `describeAccessCutoff()` / `getAccessCutoffNotice()` (`lib/billing/access-cutoff-notice.ts`), a single indexed single-row read gated to admins.
- **Students**: `/dashboard/student/access-suspended` (shipped in #509, above) is the specific "your school's account needs attention" state — it names the school's plan limits as the cause and states that the enrolment is intact.

---

## Currency Support

### Supported Currencies

| Code | Name | Zero-Decimal |
|------|------|:---:|
| USD | US Dollar | No |
| MXN | Mexican Peso | No |
| COP | Colombian Peso | No |
| CLP | Chilean Peso | **Yes** |
| PEN | Peruvian Sol | No |
| ARS | Argentine Peso | No |
| BRL | Brazilian Real | No |
| EUR | Euro | No |

### Usage

```typescript
import { toCents, fromCents, formatCurrency } from '@/lib/currency'

// Convert for Stripe
const stripeAmount = toCents(1000, 'clp')  // 1000 (zero-decimal)
const stripeAmount2 = toCents(29.99, 'usd') // 2999

// Display
formatCurrency(29.99, 'usd', 'en-US')  // "$29.99"
formatCurrency(1000, 'clp', 'es-CL')   // "$1.000"
```

### Bank Transfer Labels

The `getRoutingNumberLabel(countryCode)` function returns country-specific labels:
- Mexico → "CLABE"
- Argentina → "CBU/CVU"
- Peru → "CCI"
- Others → "Routing Number"

---

## Environment Variables

### New (Required for Stripe billing)

```env
STRIPE_PLATFORM_WEBHOOK_SECRET=whsec_...   # Separate from Connect webhook
```

### Stripe Setup Steps

1. Create Stripe Product "LMS Platform Subscription" in dashboard
2. Create 8 Prices (4 monthly + 4 yearly for Starter/Pro/Business/Enterprise)
3. Store price IDs in `platform_plans.stripe_price_id_monthly` / `stripe_price_id_yearly`
4. Create webhook endpoint at `https://yourdomain.com/api/stripe/platform-webhook`
5. Subscribe to events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`
6. Copy webhook signing secret to `STRIPE_PLATFORM_WEBHOOK_SECRET`

---

## i18n Keys Added

Both `messages/en.json` and `messages/es.json` received:
- `billing.*` — Billing dashboard, plan names, upgrade flow
- `platformPricing.*` — Public pricing page
- `featureGate.*` — Upgrade nudges per feature
- `limits.*` — Limit warnings
- `revenue.*` — Revenue dashboard
- `sidebar.billing` — Admin sidebar link

---

## Testing Checklist

1. As school admin → `/dashboard/admin/billing` shows free plan with 5/5 courses, 0/50 students
2. Click "Upgrade" → plan comparison page renders with monthly/yearly toggle
3. Select Starter ($9/mo) → Stripe Checkout opens
4. Pay with test card `4242 4242 4242 4242` → webhook fires → `tenants.plan` = `starter`
5. Billing page now shows Starter, next billing date, usage meters updated (15 courses max)
6. `revenue_splits.platform_percentage` updated from 10 to 5
7. Test manual transfer: request upgrade to Pro → `platform_payment_requests` created → super admin confirms → plan activates
8. Test cancel: click cancel → subscription marked `cancel_at_period_end` → at period end, plan reverts to free
9. Free school → 51st student blocked with upgrade message
10. Teacher at 4/5 courses → yellow warning; at 5/5 → red with upgrade CTA
11. Set school currency to MXN → Stripe PaymentIntent uses `currency: 'mxn'`
12. Revenue dashboard shows correct totals and trends
13. `npm run build` passes (excluding pre-existing mcp-server type error)
