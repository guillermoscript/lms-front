# Payment System — Complete Reference

## Overview

The LMS has **two separate payment systems** with manual/offline support:

1. **Student Payments** — Students pay schools for courses/plans (`payment_requests` + `transactions` + `enrollments`)
2. **Platform Billing** — Schools pay the platform for their subscription plan (`platform_payment_requests` + `platform_subscriptions`)

Both support **Stripe** (automatic) and **Manual Bank Transfer** (admin-reviewed).

---

## System 1: Student → School Payments

### Sequence Diagram — Product Purchase (Manual)

```
Student                        School Admin                    Database
  │                               │                              │
  │── Browse courses ──────────>  │                              │
  │── /checkout/manual?productId=X                               │
  │── Fill form (name,email,msg)  │                              │
  │── Submit ──────────────────>  │                              │
  │   createPaymentRequest()      │                              │
  │                               │<── payment_request ──────────│ status='pending'
  │                               │                              │
  │                               │── Send Instructions ──────>  │ status='contacted'
  │<── Gets bank details ────────│                              │
  │── Pays offline (bank) ──────> │                              │
  │                               │── Confirm Received ────────> │ status='payment_received'
  │                               │                              │
  │                               │── Complete & Enroll ───────> │
  │                               │   completeAndEnroll():       │
  │                               │   1. INSERT transaction      │ status='successful'
  │                               │   2. enroll_user() RPC       │
  │                               │      FOR EACH product_course │
  │                               │        INSERT enrollment     │ status='active'
  │                               │                              │ tenant_id from product_courses
  │                               │   3. UPDATE payment_request  │ status='completed'
  │                               │                              │
  │── Access course ──────────> ✅│                              │
```

### Sequence Diagram — Plan Subscription (Manual)

```
Student                        School Admin                    Database
  │                               │                              │
  │── Browse plans ────────────>  │                              │
  │── /checkout/manual?planId=X   │                              │
  │── Fill form + Submit ───────> │                              │
  │   createPaymentRequest()      │                              │
  │                               │<── payment_request ──────────│ plan_id set, status='pending'
  │                               │                              │
  │                               │── (same admin review flow)   │
  │                               │                              │
  │                               │── Complete & Enroll ───────> │
  │                               │   completeAndEnroll():       │
  │                               │   1. INSERT transaction      │ plan_id, status='successful'
  │                               │   2. handle_new_sub() RPC    │
  │                               │      INSERT subscription     │ status='active', tenant_id
  │                               │   3. UPDATE payment_request  │ status='completed'
  │                               │                              │
  │── Browse courses ───────────> │                              │
  │   /dashboard/student/browse   │                              │
  │   (sees plan courses)         │                              │
  │── Click "Enroll Now" ──────>  │                              │
  │   useEnrollment() hook        │                              │
  │   INSERT enrollment           │                       ───────│ subscription_id, status='active'
  │── Access enrolled course ──>  ✅                             │
  │                               │                              │
  │         ┌─── [Cron: 3AM UTC daily] ───────────────────────── │
  │         │ subscription.end_date < NOW()                      │
  │         │ → subscription_status = 'expired'                  │
  │         │ → TRIGGER: enrollments.status = 'disabled'         │
  │         └────────────────────────────────────────────────────>│
  │                               │                              │
  │── Loses access (re-subscribe)                                │
```

> **Note:** Subscriptions grant ACCESS to courses — they do NOT auto-enroll.
> Students self-enroll in the courses they want via the browse page.
> This keeps enrollment metrics accurate (only courses the student chose).

### Sequence Diagram — Stripe Payment (Automatic)

```
Student                        Stripe                         Database
  │                               │                              │
  │── Checkout ─────────────────> │                              │
  │── PaymentIntent ──────────> │                              │
  │                               │── webhook: succeeded ──────> │
  │                               │   UPDATE transaction         │ status='successful'
  │                               │   TRIGGER manage_transactions│
  │                               │   → enroll_user() OR         │
  │                               │     handle_new_subscription()│
  │                               │   → enrollments created      │ status='active'
  │                               │                              │
  │── Access course ──────────> ✅│                              │
```

### Payment Request Status Flow

```
  pending ─────── Admin reviews ──────> contacted
     │                                      │
     │                              Student pays offline
     │                                      │
     │                                      ▼
     │                              payment_received
     │                                      │
     │                            Admin clicks "Complete & Enroll"
     │                                      │
     │                                      ▼
     │                                 completed ✅
     │                                  (enrolled)
     │
     └──── Student or Admin cancels ──> cancelled ❌
```

### Student Subscription Lifecycle

```
  ┌──────────┐     end_date passes      ┌──────────┐
  │  active   │ ──── cron 3AM UTC ────> │  expired  │
  └──────────┘                          └──────────┘
       │                                      │
       │ student self-enrolls                 │ trigger
       │ in courses via browse                ▼
       │                              enrollments.status
       │ re-subscribe                  = 'disabled'
       └──────────────────────────────────────┘
```

**Subscription = access grant, not auto-enrollment.**
- `plan_courses` defines which courses the plan covers
- Students browse available courses and click "Enroll Now"
- Only courses the student explicitly chose get enrollment records
- When subscription expires, only those enrollments are disabled

### Key Tables

| Table | Purpose |
|-------|---------|
| `payment_requests` | Student manual payment requests (per tenant) |
| `transactions` | Payment records (Stripe + manual) |
| `enrollments` | Course access (product_id OR subscription_id) |
| `subscriptions` | Time-limited plan access |
| `product_courses` | Product → Course mappings (has tenant_id) |
| `plan_courses` | Plan → Course mappings (no tenant_id, scoped via plan) |

### Key RPCs

| RPC | What It Does |
|-----|-------------|
| `enroll_user(_user_id, _product_id)` | Loops ALL product_courses, creates enrollments with `status='active'`, `tenant_id` |
| `handle_new_subscription(_user_id, _plan_id, _transaction_id)` | Creates subscription only (no auto-enrollment; students self-enroll via browse) |
| `handle_student_subscription_expiry()` | Cron: expires active subscriptions past `end_date` |

### Key Files

| File | Purpose |
|------|---------|
| `app/[locale]/checkout/manual/page.tsx` | Manual checkout page (products + plans) |
| `components/student/payment-request-form.tsx` | Student payment request form |
| `app/actions/payment-requests.ts` | Server actions: create, review, complete & enroll |
| `app/[locale]/dashboard/admin/payment-requests/page.tsx` | Admin payment requests management |
| `components/admin/payment-requests-table.tsx` | Admin table with manage dialog |
| `lib/hooks/use-enrollment.ts` | Client hook for subscription-based self-enrollment |
| `components/student/browse-course-card.tsx` | Course card with "Enroll Now" for plan subscribers |
| `supabase/migrations/20260316000000_fix_enrollment_rpcs.sql` | RPC rewrites, trigger, cron |

---

## System 2: School → Platform Billing

### Sequence Diagram — Manual Plan Upgrade

```
Tenant Admin                   Super Admin                    Database
  │                               │                              │
  │── /dashboard/admin/billing/upgrade                           │
  │── See plan comparison table   │                              │
  │── Click "Pay via bank transfer"                              │
  │── Fill ManualTransferForm     │                              │
  │   (bank ref, proof, notes)    │                              │
  │── Submit ──────────────────>  │                              │
  │   requestManualPlanUpgrade()  │                              │
  │                               │<── platform_payment_request ─│ status='pending'
  │                               │                              │ request_type='upgrade'
  │                               │                              │
  │                               │── /platform/billing          │
  │                               │   See pending requests table │
  │                               │   Review: school, plan, amt  │
  │                               │                              │
  │                               │── Click "Confirm" ─────────> │
  │                               │   confirmManualPayment():    │
  │                               │   1. Validate plan limits    │
  │                               │   2. UPDATE request          │ status='confirmed'
  │                               │   3. UPSERT subscription     │ status='active'
  │                               │                              │ payment_method='manual_transfer'
  │                               │   4. UPDATE tenant           │ plan='starter'
  │                               │                              │ billing_status='active'
  │                               │   5. UPSERT revenue_splits   │ transaction_fee updated
  │                               │                              │
  │── Features unlocked ────────> ✅                             │
  │                               │                              │
  │   ── OR ──                    │                              │
  │                               │── Click "Reject" ──────────> │
  │                               │   rejectManualPayment():     │
  │                               │   UPDATE request             │ status='rejected'
  │                               │                              │ notes=reason
  │── Still on old plan ────────> ❌                             │
```

### Sequence Diagram — Stripe Plan Upgrade

```
Tenant Admin                   Stripe                         Database
  │                               │                              │
  │── Click "Subscribe" ────────> │                              │
  │── /api/stripe/checkout-session│                              │
  │── Stripe Checkout hosted page │                              │
  │── Pays with card ───────────> │                              │
  │                               │── webhook: session.completed─│
  │                               │   UPSERT subscription        │ status='active'
  │                               │   UPDATE tenant              │ plan=new_plan
  │                               │   UPSERT revenue_splits      │
  │                               │                              │
  │── Plan activated ──────────── ✅                             │
```

### Platform Payment Request Status Flow

```
  pending ──────── Super admin reviews ──────> confirmed ✅
     │                                           │
     │                                   subscription activated
     │                                   tenant plan upgraded
     │                                   revenue splits updated
     │
     └──────── Super admin rejects ──────────> rejected ❌
                                                  │
                                          notes = rejection reason
                                          tenant stays on current plan
```

### Platform Subscription Lifecycle

```
  ┌──────────┐   period_end passes    ┌──────────┐   grace_period_end   ┌──────────┐
  │  active   │ ── cron 2AM UTC ───> │ past_due  │ ── cron 2AM UTC ──> │ canceled  │
  └──────────┘                       └──────────┘   (7 days later)     └──────────┘
       ▲                                   │                                │
       │          grace_period_end =       │                                │
       │          period_end + 7 days      │                      tenant.plan = 'free'
       │                                   │                      billing_status = 'free'
       │                                   │                      revenue_splits reset
       │ renew (new manual request         │                      to 10% platform fee
       │  or Stripe payment)               │
       └───────────────────────────────────┘
```

### Platform Plan Limits

| Plan | Courses | Students | Fee | Price/mo |
|------|---------|----------|-----|----------|
| Free | 5 | 50 | 10% | $0 |
| Starter | 15 | 200 | 5% | $9 |
| Pro | 100 | 1,000 | 2% | $29 |
| Business | Unlimited | 5,000 | 0% | $79 |
| Enterprise | Unlimited | Unlimited | 0% | $199 |

### Key Tables

| Table | Purpose |
|-------|---------|
| `platform_plans` | Plan definitions (slug, prices, features, limits) |
| `platform_subscriptions` | One per tenant (UNIQUE on tenant_id) |
| `platform_payment_requests` | Manual upgrade/renewal requests |
| `tenants` | `plan`, `billing_status`, `billing_period_end` columns |
| `revenue_splits` | Platform fee % per tenant (updated on plan change) |

### Key Files

| File | Purpose |
|------|---------|
| `app/[locale]/dashboard/admin/billing/upgrade/` | Tenant upgrade page (plan comparison + manual form) |
| `app/actions/admin/billing.ts` | Tenant actions: request upgrade, upload proof, renew |
| `app/[locale]/platform/billing/` | Super admin billing panel |
| `app/[locale]/platform/billing/billing-actions.tsx` | Super admin confirm/reject buttons |
| `app/actions/platform/plans.ts` | Super admin actions: confirm, reject, force change |
| `app/api/stripe/checkout-session/route.ts` | Stripe Checkout for plan upgrades |
| `app/api/stripe/platform-webhook/route.ts` | Stripe webhook for billing events |

---

## Two Stripe Integrations

| | Student Payments (Connect) | School Billing (Platform) |
|--|--|--|
| **Who pays** | Student pays school | School admin pays platform |
| **Stripe mode** | Stripe Connect (PaymentIntents) | Stripe Billing (Checkout + Subscriptions) |
| **Webhook** | `/api/stripe/webhook` | `/api/stripe/platform-webhook` |
| **Env var** | `STRIPE_WEBHOOK_SECRET` | `STRIPE_PLATFORM_WEBHOOK_SECRET` |
| **Customer ID** | `profiles.stripe_customer_id` | `tenants.stripe_customer_id` |
| **Manual flow** | `payment_requests` table | `platform_payment_requests` table |
| **Result** | Course enrollment | Plan upgrade + feature unlock |
| **Expiry cron** | `handle_student_subscription_expiry()` 3AM | `handle_manual_subscription_expiry()` 2AM |

---

## Configuration

```bash
# Student Payments (Connect)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# School Billing (Platform)
STRIPE_PLATFORM_WEBHOOK_SECRET=whsec_...

# No additional env vars needed for manual payments
```
