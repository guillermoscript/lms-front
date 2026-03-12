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
