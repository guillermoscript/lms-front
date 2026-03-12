# Platform Admin Panel

Super-admin interface for operating the multi-tenant LMS SaaS. Completely separate from the per-school `/dashboard/admin` experience.

## Route Architecture

All routes live under `app/[locale]/platform/`:

```
/platform                    → Overview dashboard (MRR, tenant counts, plan distribution)
/platform/tenants            → All schools: search, filter, actions
/platform/tenants/[id]       → Tenant detail: stats, subscription, admin users, transactions
/platform/billing            → Manual bank-transfer payment requests (confirm / reject)
/platform/plans              → Edit platform_plans pricing and feature limits
/platform/referrals          → Manage referral codes and track conversions
```

These routes are **completely separate** from `/dashboard/admin` — they use a dedicated layout (`app/[locale]/platform/layout.tsx`) and sidebar (`components/platform-sidebar.tsx`).

---

## Security Model

### Who is a Super Admin?

Super admins are stored in the `super_admins` table:

```sql
SELECT user_id FROM super_admins WHERE user_id = auth.uid();
```

**This is authoritative.** `isSuperAdmin()` in `lib/supabase/get-user-role.ts` queries the DB directly — it does NOT trust JWT claims.

### Middleware Guard (`proxy.ts`)

For any path starting with `/platform`, the middleware performs a raw REST call to check `super_admins`:

```ts
async function checkSuperAdmin(userId: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/super_admins?user_id=eq.${userId}&select=user_id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  )
  const rows = await res.json()
  return Array.isArray(rows) && rows.length > 0
}
```

Non-super-admin users are redirected to `/[locale]/auth/login`.

### Promoting a Super Admin

```sql
INSERT INTO super_admins (user_id)
VALUES ('your-user-uuid-here');
```

> **Never add super admin rows via user-facing UI** — only via direct DB access or a protected admin CLI.

---

## Database Access

Platform pages use `createAdminClient()` (service role key, bypasses RLS) for all queries. This is intentional — super admins need cross-tenant visibility.

```ts
import { createAdminClient } from '@/lib/supabase/admin'
const adminClient = createAdminClient()
```

**Important gotcha:** PostgREST FK embedding (`table(related_col)`) silently fails with the admin client for some FK relationships. Always fetch related records in a separate query using `.in('id', ids)`.

---

## Feature Areas

### Overview Dashboard

**File:** `app/[locale]/platform/page.tsx`

Uses the `get_platform_stats()` SECURITY DEFINER RPC for a single-round-trip aggregation:

| Metric | Source |
|--------|--------|
| MRR | `platform_subscriptions JOIN platform_plans` |
| Total tenants | `tenants WHERE status='active'` |
| New tenants 30d | `tenants WHERE created_at > now()-30d` |
| Total students | `tenant_users WHERE role='student'` |
| Pending payments | `platform_payment_requests WHERE status='pending'` |
| Referral codes/redemptions | `referral_codes`, `referral_redemptions` |

**testids:** `platform-overview`, `platform-metrics`, `metric-{kebab-title}`, `metric-value`, `plan-distribution`

---

### Tenant Management

**Files:** `app/[locale]/platform/tenants/page.tsx`, `tenants/[tenantId]/page.tsx`

- **List:** filterable by name (ilike), plan, status. Shows student count, course count, plan badge.
- **Detail:** tenant stats, active subscription, admin users list, last 20 transactions.
- **Actions (TenantActionsMenu):** View Details · Impersonate User · Change Plan · Suspend/Reactivate

**Server actions in `app/actions/platform/plans.ts`:**

```ts
forceTenantPlanChange(tenantId, planSlug)   // updates tenants.plan + revenue_splits
suspendTenant(tenantId, isSuspending)       // sets tenants.status = 'suspended' | 'active'
```

**testids:** `platform-tenants-page`, `tenants-count`, `tenants-filter-form`, `tenants-search`, `tenants-plan-filter`, `tenants-status-filter`, `tenants-filter-submit`, `tenants-table`, `tenant-row[data-tenant-id]`, `tenant-detail-page`, `tenant-stats`

---

### Impersonation

**Files:** `app/[locale]/platform/tenants/impersonate-dialog.tsx`, `app/actions/platform/impersonate.ts`

The impersonation flow uses Supabase's admin magic link API:

1. Super admin opens **Impersonate User** dialog on a tenant.
2. Dialog calls `getTenantUsersForImpersonation(tenantId)` — returns active users with name, email, role.
3. Super admin clicks **Sign in as** → `impersonateUser(userId, tenantId)` is called.
4. Server action calls `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })`.
5. The `hashed_token` from the response is assembled into a Supabase confirm URL.
6. An audit row is inserted into `impersonation_log(super_admin_id, target_user_id, tenant_id)`.
7. The browser is redirected to the magic link URL — the super admin is now signed in as the target user.
8. To exit: call `supabase.auth.signOut()` and navigate back to `/platform/tenants`.

**Audit table:**
```sql
SELECT * FROM impersonation_log ORDER BY created_at DESC;
```

**testids:** `impersonate-dialog`, `impersonate-user-list`, `impersonate-user-row[data-user-id][data-role]`, `impersonate-signin-btn`, `impersonate-cancel-btn`, `impersonate-loading`, `impersonate-empty`

---

### Platform Billing

**Files:** `app/[locale]/platform/billing/page.tsx`, `billing/billing-actions.tsx`

Shows all `platform_payment_requests` across all tenants. Tabs: Pending · Confirmed · Rejected · All.

The **Confirm** button calls the existing `confirmManualPayment(requestId)` action from `app/actions/admin/billing.ts` — this:
1. Sets `platform_payment_requests.status = 'confirmed'`
2. Updates `tenants.plan` to the requested plan
3. Updates `tenants.billing_status` and `billing_period_end`

The **Reject** button calls `rejectManualPayment(requestId, reason)` in `app/actions/platform/plans.ts`.

**testids:** `platform-billing-page`, `billing-tabs`, `billing-tab-{value}[data-active]`, `billing-requests-table`, `billing-request-row[data-request-id][data-status]`, `confirm-payment-btn`, `reject-payment-btn`, `reject-payment-dialog`, `reject-reason-input`, `confirm-reject-btn`

---

### Plans Editor

**Files:** `app/[locale]/platform/plans/page.tsx`, `plans/plan-editor.tsx`

CRUD interface for `platform_plans`. Each plan card shows: name, slug, monthly/yearly price, transaction fee %, limits (JSONB), active status.

**Edit:** Opens a dialog to update name, prices, transaction fee %, sort order, and limits JSON.
**Deactivate:** Blocked if the plan has active subscribers (returns an error toast).

Server actions in `app/actions/platform/plans.ts`:
- `updatePlatformPlan(planId, updates)`
- `togglePlanActive(planId, isActive)` — checks active subscriber count before deactivating

**testids:** `platform-plans-page`, `plan-card[data-plan-slug]`, `plan-edit-btn`, `plan-toggle-btn`, `plan-edit-dialog`, `plan-price-monthly-input`, `plan-save-btn`

---

### Referral System

**Files:** `app/[locale]/platform/referrals/page.tsx`, `referrals/generate-code-form.tsx`, `app/actions/platform/referrals.ts`

#### Database Schema

```sql
referral_codes (
  code_id uuid PK,
  code text UNIQUE,          -- e.g. "ACME25"
  tenant_id uuid → tenants,  -- owner school (NULL = platform-level)
  discount_months int,       -- free months for new school (referee)
  referrer_reward_months int,-- free months for referring school
  max_uses int,              -- NULL = unlimited
  used_count int,
  is_active bool,
  created_at timestamptz
)

referral_redemptions (
  redemption_id uuid PK,
  code_id uuid → referral_codes,
  redeemed_by_tenant_id uuid → tenants,
  referrer_rewarded bool,    -- set true after first payment
  referee_rewarded bool,
  created_at timestamptz
)
```

#### Reward Flow

| Event | Action |
|-------|--------|
| New school signs up with `?ref=CODE` | Insert `referral_redemptions` row; extend referee's `billing_period_end` by `discount_months` |
| New school makes first payment | Call `rewardReferrer()`; extend referrer's `billing_period_end` by `referrer_reward_months`; set `referrer_rewarded=true` |

Referrer reward is delayed until first payment to prevent abuse.

#### Integration Points

- `app/[locale]/create-school/page.tsx` — **unified create-school flow** with cross-subdomain authentication; reads `?ref=CODE` from query params
- `app/actions/onboarding.ts` — calls `applyReferralCode(code, newTenantId)` after tenant creation; also handles the **onboarding wizard** that guides new school admins through initial setup
- `app/api/stripe/platform-webhook/route.ts` — calls `rewardReferrer()` on `invoice.paid`
- School settings page — "Get your referral link" card (planned)

**testids:** `platform-referrals-page`, `generate-code-form`, `referral-code-input`, `generate-code-submit`, `referral-codes-table`, `referral-code-row[data-code]`

---

## E2E Testing

### Test File

`tests/playwright/platform-panel.spec.ts`

### Test Accounts

| Account | Role | Notes |
|---------|------|-------|
| `owner@e2etest.com` / `password123` | Super Admin | Has row in `super_admins` table |
| `student@e2etest.com` / `password123` | Student | Should be blocked from `/platform` |
| `creator@codeacademy.com` / `password123` | School Admin | Should be blocked from `/platform` |

### Test Groups

| Group | Tests | Priority |
|-------|-------|----------|
| Platform Security Guard | Unauth redirect, student blocked, admin blocked, super admin allowed | P0 |
| Platform Overview | Metrics render, MRR card, plan distribution, sidebar links | P0 |
| Platform Tenants | Table loads, search filter, plan filter, link to detail | P1 |
| Tenant Detail | Stats cards, heading, link from list | P1 |
| Platform Billing | Tabs, table, confirm/reject buttons visible | P1 |
| Platform Plans | Plan cards, Edit dialog opens, price save, toggle button | P1 |
| Platform Referrals | Generate form, code creation, code appears in table | P1 |
| Impersonation Dialog | Dialog opens, user list renders, Sign in as button | P2 |

### Known Playwright Limitation

base-ui's `DropdownMenu` and `Select` components do not open in Playwright headless mode due to pointer-capture differences. Tests that require those (tenant actions dropdown, select dropdowns) either:
1. Use direct URL navigation to bypass the dropdown
2. Use `page.evaluate()` to click via DOM (fragile — fallback pattern)
3. Are annotated with a skip-reason and should be verified in headed mode (`npx playwright test --headed`)

Run headed: `npx playwright test tests/playwright/platform-panel.spec.ts --headed`

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `app/[locale]/platform/layout.tsx` | Platform layout — verifies super admin, fetches pending count |
| `app/[locale]/platform/page.tsx` | Overview dashboard |
| `app/[locale]/platform/tenants/page.tsx` | Tenant list with filter |
| `app/[locale]/platform/tenants/[tenantId]/page.tsx` | Tenant detail |
| `app/[locale]/platform/tenants/tenant-actions-menu.tsx` | Dropdown actions per tenant |
| `app/[locale]/platform/tenants/impersonate-dialog.tsx` | Impersonation user picker |
| `app/[locale]/platform/billing/page.tsx` | Payment requests UI |
| `app/[locale]/platform/billing/billing-actions.tsx` | Confirm/reject buttons |
| `app/[locale]/platform/plans/page.tsx` | Plans list |
| `app/[locale]/platform/plans/plan-editor.tsx` | Edit dialog + toggle active |
| `app/[locale]/platform/referrals/page.tsx` | Referral dashboard |
| `app/[locale]/platform/referrals/generate-code-form.tsx` | Code generation form |
| `components/platform-sidebar.tsx` | Platform nav sidebar |
| `app/actions/platform/impersonate.ts` | Magic link impersonation + audit log |
| `app/actions/platform/plans.ts` | Plan CRUD, tenant suspend, payment reject |
| `app/actions/platform/referrals.ts` | Referral code generation and redemption |
| `lib/supabase/get-user-role.ts` | `isSuperAdmin()` — queries `super_admins` table |
| `proxy.ts` | Middleware guard for `/platform/*` |
