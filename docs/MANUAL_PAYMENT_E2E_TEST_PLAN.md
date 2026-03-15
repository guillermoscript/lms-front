# Manual Payment E2E Test Plan & Results

## Overview

End-to-end tests of both payment systems (student→school and school→platform) covering manual payment flows, enrollment RPCs, subscription lifecycle, and expiry crons.

## Test Accounts

| Actor | Email | Password | Role | Tenant |
|-------|-------|----------|------|--------|
| Test Student | `student@e2etest.com` | `password123` | Student | Default School |
| School Owner | `owner@e2etest.com` | `password123` | Admin + Super Admin | Default School |
| Creator | `creator@codeacademy.com` | `password123` | Admin | Code Academy |
| Alice | `alice@student.com` | `password123` | Student | Code Academy |

---

## Test 1: Student Plan Subscription (Manual Payment)

### Flow

```
┌──────────────────────────────────────────────────────────────┐
│  SETUP (SQL)                                                  │
│  Create manual plan + link 2 courses on Code Academy tenant   │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  ACT 1: Student submits payment request                       │
│  → /checkout/manual?planId=X                                  │
│  → See plan name + $15.00 price                               │
│  → Fill form + submit                                         │
│  → Redirect to /dashboard/student/payments                    │
│  → Request visible in table (status: Pending)                 │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  ACT 2: Admin processes request                               │
│  → /dashboard/admin/payment-requests                          │
│  → See pending request in table                               │
│  → Manage → send instructions → Mark as Contacted             │
│  → Manage → change status to Payment Received                 │
│  → Manage → click "Confirm Payment & Enroll Student"          │
│  → completeAndEnroll() → handle_new_subscription() RPC        │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  ACT 3: Verify in DB                                          │
│  → subscription: status='active', tenant_id correct           │
│  → enrollments: 2 rows, status='active', subscription_id set  │
│  → payment_request: status='completed'                        │
│  → transaction: status='successful', amount=$15.00            │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  ACT 4: Subscription expiry                                   │
│  → Set end_date to past                                       │
│  → Run handle_student_subscription_expiry()                   │
│  → subscription_status = 'expired'                            │
│  → Trigger: enrollments.status = 'disabled'                   │
└──────────────────────────────────────────────────────────────┘
```

### Result: PASS

---

## Test 2: Student Product Purchase (Manual Payment)

### Flow

```
Student → /checkout/manual?productId=X → submit
  → Admin fast-tracks to payment_received (SQL)
  → enroll_user() RPC called
  → Enrollment created: status='active', tenant_id correct, product_id set
```

### Result: PASS

---

## Test 3: Platform Manual Billing (Tenant → Super Admin)

### Flow

```
┌──────────────────────────────────────────────────────────────┐
│  ACT 1: Tenant admin requests upgrade                         │
│  → /dashboard/admin/billing/upgrade                           │
│  → See plan comparison (Free → Starter → Pro → Business)      │
│  → Click "Pay via bank transfer" on Starter ($9/mo)           │
│  → platform_payment_request created (status: pending)         │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  ACT 2: Super admin confirms                                  │
│  → /platform/billing                                          │
│  → See: Default School | Starter | $9.00 | pending            │
│  → Click "Confirm"                                            │
│  → confirmManualPayment():                                    │
│     1. Validate usage ≤ plan limits                           │
│     2. Upsert platform_subscriptions (active, manual_transfer)│
│     3. Update tenants.plan = 'starter'                        │
│     4. Update billing_status = 'active'                       │
│     5. Upsert revenue_splits (5% fee)                         │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  ACT 3: Verify in DB                                          │
│  → platform_payment_request: status='confirmed'               │
│  → platform_subscription: status='active', manual_transfer    │
│  → tenant: plan='starter', billing_status='active'            │
│  → Confirmed tab in /platform/billing shows the request       │
└──────────────────────────────────────────────────────────────┘
```

### Result: PASS

---

## Test 4: Platform Subscription Expiry

### Flow

```
┌──────────────────────────────────────────────────────────────┐
│  Step 1: Period expires                                       │
│  → Set current_period_end to past                             │
│  → Run handle_manual_subscription_expiry()                    │
│  → subscription: status='past_due'                            │
│  → grace_period_end = period_end + 7 days                     │
│  → tenant: billing_status='past_due'                          │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 2: Grace period expires                                 │
│  → Set grace_period_end to past                               │
│  → Run handle_manual_subscription_expiry() again              │
│  → subscription: status='canceled', canceled_at set           │
│  → tenant: plan='free', billing_status='free'                 │
│  → revenue_splits: 10% platform / 90% school (free defaults) │
└──────────────────────────────────────────────────────────────┘
```

### Result: PASS

---

## Bugs Found & Fixed

| Bug | Where | Fix |
|-----|-------|-----|
| `completeAndEnroll()` used regular Supabase client | `app/actions/payment-requests.ts` | Changed to `createAdminClient()` — RLS blocked admin inserting transactions for student (`uid() != user_id`) |
| `rejectManualPayment()` wrote to `admin_notes` column | `app/actions/platform/plans.ts` | Changed to `notes` — the actual column name in `platform_payment_requests` |
| `requestManualPlanUpgrade()` discarded bank reference + notes | `app/actions/admin/billing.ts` | Added `bankReference` and `notes` params, saved to DB |
| `handleManualSubmit()` didn't pass form data | `upgrade-page-client.tsx` | Added `(bankReference, notes)` params to match `ManualTransferForm.onSubmit` |
| Seed data: Code Academy had `plan='pro'` but `billing_status='free'` | `supabase/seed.sql` | Added `billing_status='active'` + `platform_subscriptions` record |

## DB Changes

| Migration | Changes |
|-----------|---------|
| `20260316000000_fix_enrollment_rpcs.sql` | Rewritten `enroll_user()`, `handle_new_subscription()`, subscription trigger, student expiry cron |
