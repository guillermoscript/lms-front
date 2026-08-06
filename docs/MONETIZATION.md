# Monetization System — School Billing, Feature Gating & LATAM Payments

**Implementation Date:** February 18, 2026
**Status:** COMPLETE — All 5 phases implemented
**Files Created:** 23 new files
**Files Modified:** 9 existing files

---

## Executive Summary

Implemented the full business monetization stack for the LMS platform:
- **School billing** on any priced rail — Stripe, Lemon Squeezy, Binance Pay, Solana or manual bank transfer (#600)
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
| `platform_plans` | Plan definitions: slug, name, list prices (monthly/yearly), features JSONB, limits JSONB, transaction_fee_percent. Carries **no** provider price ids — those moved to `platform_plan_prices` in #601 |
| `platform_plan_prices` | One row per (plan, provider, interval): `provider_price_id` for catalog rails, `amount` for catalog-less ones. An active row is what makes a rail selectable at checkout (#602) |
| `platform_subscriptions` | One per tenant. Tracks `payment_provider`, `provider_subscription_id`, status, interval, billing period, `cancel_at_period_end`, `grace_period_end`. `UNIQUE(tenant_id)` |
| `tenant_billing_customers` | The tenant's customer id **per provider** (#601) — replaces the single `tenants.stripe_customer_id` column, which no longer exists |
| `platform_payment_requests` | Manual bank transfer requests for plan upgrades. Status flow: `pending` → `instructions_sent` → `payment_received` → `confirmed` |

### Altered Tables

- **`tenants`** — Added: `billing_email`, `billing_period_end`, `billing_status` (and `stripe_customer_id`, since dropped by #601 in favour of `tenant_billing_customers`)
- **`currency_type` enum** — Added: `mxn`, `cop`, `clp`, `pen`, `ars`, `brl`

### Which rails a school can pay the platform with

`supportsPlatformBillingCheckout` in `lib/payments/types.ts` decides, and a rail
needs an active `platform_plan_prices` row before it appears in the payment-method
dialog.

| Rail | Shape | Who owns the period |
|--|--|--|
| Stripe | Checkout Session on the platform account | Stripe (renewal webhooks) |
| Lemon Squeezy | Hosted page, Merchant of Record (remits VAT) | Lemon Squeezy |
| PayPal | Hosted page — off until #479 proves it against real credentials | PayPal |
| Binance Pay | Hosted C2B order, USDT-denominated (#610) | **Us** — one payment buys one period |
| Solana | QR (Solana Pay transaction request), confirmed on chain (#610) | **Us** |

The crypto rails have no native subscription: each payment buys one period, and
`/api/cron/expire-platform-subscriptions` reminds, grace-windows and downgrades them
exactly as it does a bank transfer. That is also why a second checkout on the SAME
crypto rail is allowed — it is how a school renews — while a second checkout on
Stripe is refused as a double subscription.

Two rails stay out on purpose: `solana_subs` (auto-pull, but only the payer's wallet
can revoke the delegation, so a school could not cancel from the billing page) and
`binance_personal` (pays a *school's* own account; the payee here is the platform).
They have no price rows, 404 on the webhook route, and are filtered out of the dialog
by capability rather than by slug.

Neither Binance Pay nor Solana has a product catalog, so their price rows carry
`provider_price_id = NULL` and the row's own `amount` is what the school is charged
(falling back to the plan's list price). Requiring an id there would only produce
placeholders — the #602 failure mode.

**Both crypto rails are dormant until someone prices them.** The code and the schema
are deployed, but a rail appears in the payment-method dialog only when
`platform_plan_prices` holds an active row for that plan/interval/provider — which is
the on/off switch, not a feature flag. Only the local seed writes crypto rows, so a
fresh production database has none. The go-live checklist (credentials, webhook
registration, wallet, the mainnet USDC mint, and how to revert) is in
[`DEPLOYMENT.md → Going live with the crypto rails`](DEPLOYMENT.md#going-live-with-the-crypto-rails--checklist).

### Key Distinction: Two Money Loops

Both loops are provider-agnostic — the student loop since #280, the school loop
since #600. They are separate *loops*, not separate Stripe integrations, and the
only thing they share is the `IPaymentProvider` contract in `lib/payments`.

| | School Billing (school → platform) | Student Payments (student → school) |
|--|--|--|
| **Who pays** | School admin pays the platform | Student pays the school |
| **Rails** | Stripe, Lemon Squeezy, Binance Pay, Solana, manual bank transfer (PayPal coded, off until #479) | Stripe Connect, PayPal, Lemon Squeezy, Binance Pay, `binance_personal`, Solana, `solana_subs`, manual |
| **Which rail** | whichever has an active `platform_plan_prices` row and `supportsPlatformBillingCheckout` | `products.payment_provider` / `plans.payment_provider`, enabled per tenant in `tenant_settings` |
| **Entry point** | `POST /api/billing/checkout` | `components/public/checkout-form.tsx` |
| **Webhook** | `/api/billing/webhook/[provider]`, namespaced `platform:<provider>` | `/api/payments/webhook/[provider]`; Stripe Connect also on `/api/stripe/webhook` |
| **Applier** | `dispatchPlatformBillingEvent` | `dispatchBillingEvent` |
| **Customer ID stored in** | `tenant_billing_customers(tenant_id, payment_provider, provider_customer_id)` — per rail since #601 | `profiles.stripe_customer_id` |
| **Grants** | `tenants.plan` + `platform_subscriptions` → plan features and limits | `entitlements` → course access |
| **Revenue** | Platform revenue (SaaS subscription fees) | School revenue, less the platform's transaction fee |

Where Stripe *is* still special, it is special twice over, and the two must not be
confused: school billing uses **Stripe Billing** on the platform account with
`STRIPE_PLATFORM_WEBHOOK_SECRET`, while student payments use **Stripe Connect** with
`STRIPE_WEBHOOK_SECRET` and the school's connected account. Two registrations, two
secrets, one Stripe account.

The two loops can run on the same merchant account for a Merchant-of-Record or crypto
rail (Lemon Squeezy, Binance Pay), which is why `webhook_events` namespaces the
platform loop as `platform:<provider>`: the same provider event id can legitimately
arrive at both endpoints, and one shared key space would let whichever route ran first
mark it processed and make the other skip work it had not done.

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
| `/api/billing/checkout` | POST | Starts a hosted subscription checkout for a school plan, on whichever provider has an active `platform_plan_prices` row. Verifies admin role; supersedes a live subscription when the school switches provider. |
| `/api/billing/portal` | POST | Opens the school's subscription-management page on whichever provider bills it. Gated by `supportsCustomerPortal` (Stripe only today) — a provider without a hosted portal returns `portal_unsupported` and the billing screen renders its in-app cancel / reactivate / change-plan controls instead (#604). |
| `/api/billing/webhook/[provider]` | POST | Platform-billing webhook for `stripe` / `lemonsqueezy` / `paypal` / `binance`. Verify → `webhook_events` (idempotent, namespaced `platform:<provider>`) → normalize → `dispatchPlatformBillingEvent`. A provider with no signed webhook (Solana, manual) is deliberately absent: the endpoint would be an unauthenticated way to activate a plan. |
| `/api/billing/solana/tx` | GET/POST | Solana Pay transaction request for a platform plan (#610). Called by the WALLET, with no session — it loads the pending `platform_payment_requests` row by its unguessable `provider_reference` and returns a single transfer of the locked amount to `SOLANA_PLATFORM_WALLET`. |
| `/api/billing/solana/verify` | POST | Polled by the QR page. Proves the transfer on chain, claims the signature into `provider_charge_id` (UNIQUE — one payment settles one request), then dispatches `subscription.activated` through the same dispatcher the webhooks use. |

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

### Via hosted checkout (any priced rail)

One path for every rail that carries `supportsPlatformBillingCheckout` — Stripe,
Lemon Squeezy, Binance Pay, Solana. Which one runs is resolved from
`platform_plan_prices` by `resolveCheckoutProvider`, never from a provider name in
the route.

```
Admin picks a plan, then a payment method → POST /api/billing/checkout
  → resolveCheckoutProvider(prices, interval): explicit choice > rail already on
    file > the only priced one
  → provider.createCheckoutSession({ hosted: true })
  → school pays on the provider's page (or scans the QR, for Solana)
  → confirmation arrives:
      webhook rails  → POST /api/billing/webhook/[provider]  (signature verified,
                       deduped in webhook_events under `platform:<provider>`)
      Solana         → the QR page polls POST /api/billing/solana/verify, which
                       proves the transfer on chain
  → both call dispatchPlatformBillingEvent, which:
    1. Upserts platform_subscriptions (provider, ids, status, period)
    2. Updates tenants.plan / billing_status / billing_period_end
    3. Rewrites revenue_splits to the new plan's transaction_fee_percent
    4. Reconciles any access cutoff left over from being over-limit
```

On a rail with no subscription object of its own (`selfManagedPeriod` — Binance Pay,
Solana), step 1 *derives* `current_period_end` from the interval, because the provider
reports no period. A subscription with a NULL period end never lapses, never reminds
and shows no next-payment date, so this is the whole difference between a paid month
and a free one.

### Via manual bank transfer

```
Admin clicks "Bank transfer" → requestManualPlanUpgrade()
  → Creates platform_payment_requests row (status 'pending', expires_at +14d)
  → Super admin marks instructions sent → 'instructions_sent'
  → School transfers, optionally uploads proof → 'payment_received'
  → Super admin calls confirmManualPayment(requestId) on /platform/billing
    0. Blocks if the tenant is over the target plan's limits
    1. Updates request status to 'confirmed'
    2. Upserts platform_subscriptions (payment_provider: 'manual'), extending
       from the old period end on a renewal rather than restarting it
    3. Updates tenants.plan / billing_status / billing_period_end
    4. Rewrites revenue_splits
    5. Reconciles the access cutoff
```

### Cancellation and lapse

```
Admin clicks "Cancel" → cancelSubscription()
  → supportsNativeSubscriptions (Stripe, Lemon Squeezy, PayPal):
      cancel at period end AT THE PROVIDER; its renewal webhook stops arriving
      and the terminal event downgrades us
  → selfManagedPeriod (manual, Binance Pay, Solana):
      set cancel_at_period_end in the DB; nothing renews it anyway
  → either way cancel_at_period_end is the ONLY signal a cancel is scheduled
    (#545); cancel_at is informational and the two are cleared together

/api/cron/expire-platform-subscriptions sweeps every selfManagedPeriod rail daily:
  phase 0  retire payment requests past expires_at
  phase 1  remind, once, within 7 days of period end
  phase 2  period end passed → 'past_due' + 7-day grace window
  phase 3  grace closed → downgradeTenantToFree(), unless a renewal request is
           still open (a school that has already sent money is not cut off)
  phase 4  cancel_at_period_end and the period has ended → downgradeTenantToFree()
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
- **Call sites** — two families, and both are needed (issue #550). Plan-change events *schedule* a cutoff; usage-reduction events *clear* it. Until #550 only the first family existed, so a school that did exactly what the email asked (archive courses, remove members) stayed locked out until the next daily sweep — or indefinitely, since nothing on the Dokploy host currently calls `/api/cron/*` (issue #513).
  - **Plan-state transitions:** `downgradeTenantToFree()` (both the Stripe `customer.subscription.deleted` webhook and the manual-transfer expiry cron), `changePlan()` and `confirmManualPayment()` in `app/actions/admin/billing.ts`, and `applyPortalPlanChange()` (`lib/payments/platform-plan-change.ts`).
  - **Usage reductions**, via `reconcileAccessCutoffSafely()` — the same reconciler wrapped in a `try/catch` that logs and swallows, because the caller's own write has already succeeded and reconciliation must never fail it: `archiveCourse()` and `deleteCourse()` (`app/actions/teacher/courses.ts`) and `removeTenantMember()` (`app/actions/admin/users.ts`).
  - **Manual:** `recheckPlanLimits()` (`app/actions/admin/billing.ts`), behind a "Re-check limits" button that the billing page renders only while a cutoff is live. This is the guarantee that recovery never depends on a scheduler existing at all.
  - **Daily sweep:** `app/api/cron/enforce-plan-limits/route.ts` walks every tenant to catch organic over-limit growth with no associated plan-change event, and is the only call site that passes `notifyDueStages`.
- **`removeTenantMember()` is the only action that changes the student count.** `deactivateUser()` stamps `profiles.deactivated_at`, which is read nowhere but the admin users screens; `countTenantUsage` counts `tenant_users` rows with `role = 'student' AND status = 'active'`. Removal sets that row to `status = 'removed'` rather than deleting it, so `joinCurrentSchool()` can reinstate the member through the same `max_students` pre-check a first-time join runs. A removed admin who re-joins comes back as a student or teacher, never an admin.
- **A missing `platform_plans` row does not clear enforcement** (issue #550 §3). `decideAccessCutoffAction`'s `limitsKnown` flag makes an unresolvable plan lookup mean "limits unknown" rather than "limits met": no new cutoff is scheduled off limits that were never read, and an existing cutoff is left standing instead of cleared. The asymmetry is deliberate — a lookup miss is an operator error (a renamed slug, a deleted row), clearing on it lifts live enforcement school-wide with only a plan purchase or a super admin row edit to recover, whereas preserving it costs nothing because the next successful reconcile clears it anyway. Note this differs from `checkPlanLimits`'s blanket fail-open, which only ever governs whether a *new* restriction is applied.
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
- **A failed ledger write counts as a failed delivery** (issue #550 §2). `deliverCutoffStage()` used to log the upsert error and return `{ delivered: true }` regardless, which inverted the retry rule above into a defect: the rung stayed unrecorded, so the next sweep re-derived and re-sent it, while the cron counted every repeat under `notified` and reported a healthy run. Every tenant admin got the identical email daily until the cutoff cleared. RLS is enabled on `access_cutoff_notifications` with **no policy**, so any non-service-role caller hit this on every single send. It now returns `delivered: false`, surfacing as `notifyFailures`; the cost is at most one extra send on the next sweep, against an unbounded daily repeat that looked like success.
- **Where it runs:** `app/api/cron/enforce-plan-limits/route.ts` passes `notifyDueStages: true`. No new cron entry was added — the sweep that already visits every tenant daily is exactly the cadence the ladder needs. Its response reports `notified` (per stage) and `notifyFailures`, so a failing mail provider is visible in the cron log instead of silent. No other call site passes the flag, so user-facing actions never pay email latency for a reminder the cron will send anyway. The one exception is the `scheduled` rung, which any call site can send because scheduling a cutoff is exactly when the school first needs to hear about it — and since #550 that path consults the ledger like every other rung, so a sweep racing a plan change can no longer send it twice.

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

### Required for school billing

Per rail, and only for the rails you actually price. The full annotated list is in
[`DEPLOYMENT.md → Environment Variables`](DEPLOYMENT.md#33-environment-variables).

```env
STRIPE_PLATFORM_WEBHOOK_SECRET=whsec_...   # Stripe — separate from the Connect webhook
LEMONSQUEEZY_API_KEY=                      # Lemon Squeezy — same account as the student loop
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
BINANCE_PAY_API_KEY=                       # Binance Pay — same merchant account as the student loop
BINANCE_PAY_API_SECRET=
SOLANA_RPC_URL=                            # Solana — no webhook exists; /api/billing/solana/verify proves it on chain
SOLANA_PLATFORM_WALLET=
SOLANA_USDC_MINT=
```

Manual bank transfer needs no credentials at all — it settles through
`platform_payment_requests` under a super admin's eye.

### Stripe setup steps

1. Create a Stripe Product, e.g. "LMS Platform Subscription"
2. Create 8 Prices (4 monthly + 4 yearly, for Starter / Pro / Business / Enterprise)
3. Enter each price id in **Platform → Plans → Edit plan → Prices**, which writes
   `platform_plan_prices(plan_id, payment_provider, interval, provider_price_id)`.
   **Do not look for a price column on `platform_plans`** — there is none, and
   there never was one anything wrote, which is what made every card upgrade 400
   until #602. A plan with no active price row for a rail simply does not offer
   that rail; it no longer fails at checkout.
4. Create a webhook endpoint at `https://yourdomain.com/api/billing/webhook/stripe`
5. Subscribe to events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`
6. Copy the webhook signing secret to `STRIPE_PLATFORM_WEBHOOK_SECRET`

### Other rails

Same shape, one step shorter. Lemon Squeezy takes its variant id in the same
Prices editor; Binance Pay and Solana have no catalog, so their rows carry a plain
`amount` and no `provider_price_id`. Registering the webhook (or, for Solana,
deliberately not registering one) is covered in
[`DEPLOYMENT.md → Payment Webhook Configuration`](DEPLOYMENT.md#6-payment-webhook-configuration).

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
3. Select Starter ($9/mo) → the payment-method dialog lists every rail with an active price row, plus bank transfer
4. Pick Stripe, pay with test card `4242 4242 4242 4242` → webhook fires → `tenants.plan` = `starter`. On a crypto rail the same assertion holds once the QR / hosted order settles; on bank transfer, once a super admin confirms
5. Billing page now shows Starter, next billing date, usage meters updated (15 courses max)
6. `revenue_splits.platform_percentage` updated from 10 to 5
7. Test manual transfer: request upgrade to Pro → `platform_payment_requests` created → super admin confirms → plan activates
8. Test cancel: click cancel → subscription marked `cancel_at_period_end` → at period end, plan reverts to free
9. Free school → 51st student blocked with upgrade message
10. Teacher at 4/5 courses → yellow warning; at 5/5 → red with upgrade CTA
11. Set school currency to MXN → Stripe PaymentIntent uses `currency: 'mxn'`
12. Revenue dashboard shows correct totals and trends
13. `npm run build` passes (excluding pre-existing mcp-server type error)
