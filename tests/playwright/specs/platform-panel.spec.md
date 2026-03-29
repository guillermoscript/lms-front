# Platform Panel — Test Specification

> Source of truth for `tests/playwright/platform-panel.spec.ts`
> Last updated: 2026-03-16

## Test Data

| Item | Value |
|------|-------|
| Base URL | `http://lvh.me:3000` (BASE) |
| Platform base path | `BASE/en/platform` (PLATFORM_BASE) |
| Super admin | `owner@e2etest.com` / `password123` (has row in `super_admins` table) |
| Default student | `student@e2etest.com` / `password123` |
| School admin | `creator@codeacademy.com` / `password123` (admin on code-academy, NOT super admin) |
| Code Academy tenant ID | `00000000-0000-0000-0000-000000000002` |
| Code Academy tenant URL | `http://code-academy.lvh.me:3000` |

## Test Cases

### Platform Security Guard (P0)

| # | Test | Assertions | Selectors / Patterns |
|---|------|------------|----------------------|
| 1 | unauthenticated user is redirected to login | Navigate to PLATFORM_BASE; URL matches /auth/login | `page.toHaveURL(/\/auth\/login/)` (10s timeout) |
| 2 | student cannot access /platform — redirected to their dashboard | Login as student; navigate to PLATFORM_BASE; URL does NOT contain /platform | `page.waitForURL` where pathname does not start with `/en/platform`; `page.not.toHaveURL(/\/platform/)` |
| 3 | school admin cannot access /platform — redirected away | Login as school admin on code-academy; navigate to PLATFORM_BASE on main domain; URL does NOT contain /platform | Same waitForURL pattern |
| 4 | super admin can access /platform | Login as super admin; platform overview visible | `[data-testid="platform-overview"]` visible |

### Platform Overview (P1)

Precondition: logged in as super admin via `loginAsSuperAdmin`.

| # | Test | Assertions | Selectors |
|---|------|------------|-----------|
| 5 | overview page loads with metric cards | Overview and metrics container visible; at least one metric card rendered | `[data-testid="platform-overview"]`, `[data-testid="platform-metrics"]`; child `[data-testid]` elements visible |
| 6 | MRR metric card shows a currency value | MRR card visible; value contains "$" | `[data-testid="metric-monthly-recurring-revenue"]`; child `[data-testid="metric-value"]` contains "$" |
| 7 | plan distribution card renders | Plan distribution card visible | `[data-testid="plan-distribution"]` |
| 8 | sidebar navigation links are present | Links to /platform, /platform/tenants, /platform/billing, /platform/plans, /platform/referrals, /dashboard/admin all attached | `a[href*="/platform"]`, `a[href*="/platform/tenants"]`, etc. — each `.first().toBeAttached()` (10s timeout) |
| 9 | "Back to School" navigates to admin dashboard | Navigate to /dashboard/admin; URL matches /dashboard/admin | Direct navigation check |

### Platform Tenants (P1)

Precondition: logged in as super admin; navigated to PLATFORM_BASE/tenants.

| # | Test | Assertions | Selectors |
|---|------|------------|-----------|
| 10 | tenants page loads with table | Page, table, and count visible | `[data-testid="platform-tenants-page"]`, `[data-testid="tenants-table"]`, `[data-testid="tenants-count"]` |
| 11 | tenants table shows at least one row | First tenant row visible | `[data-testid="tenant-row"]` first |
| 12 | tenant rows show name, plan badge, and status badge | First row has a link (tenant name) | `[data-testid="tenant-row"]` first -> child `a` visible |
| 13 | search filter narrows results | Fill "Code Academy" in search, submit; filtered count <= initial count; first row contains "Code Academy" | `[data-testid="tenants-search"]` fill; `[data-testid="tenants-filter-submit"]` click; `[data-testid="tenant-row"]` count comparison |
| 14 | plan filter shows only tenants with selected plan | Select "starter" in plan filter, submit; all visible rows contain "starter" | `[data-testid="tenants-plan-filter"]` selectOption("starter"); `[data-testid="tenants-filter-submit"]` click |
| 15 | clear filter restores all tenants | Fill "zzz-no-match", submit (0 results); clear and re-submit; count > 0 | Same search/submit selectors |

### Tenant Detail (P1)

Precondition: logged in as super admin.

| # | Test | Assertions | Selectors |
|---|------|------------|-----------|
| 16 | tenant detail page loads from list link | Navigate to tenants list; click first tenant link (href matches `/tenants/[uuid]`); detail page visible | `[data-testid="tenant-row"]` first -> `a` first; `[data-testid="tenant-detail-page"]` |
| 17 | tenant detail shows stats, subscription, and admin users cards | Navigate to Code Academy detail; stats card visible; h1 contains "Code Academy Pro" | `[data-testid="tenant-detail-page"]`, `[data-testid="tenant-stats"]`; `getByRole('heading', { level: 1 })` contains "Code Academy Pro" |

### Platform Billing (P1)

Precondition: logged in as super admin; navigated to PLATFORM_BASE/billing.

| # | Test | Assertions | Selectors |
|---|------|------------|-----------|
| 18 | billing page loads with tab bar and table | Page, tabs, and table visible | `[data-testid="platform-billing-page"]`, `[data-testid="billing-tabs"]`, `[data-testid="billing-requests-table"]` |
| 19 | tab navigation switches between Pending / Confirmed / Rejected / All | Default: pending tab has data-active="true"; click confirmed tab -> active; click all tab -> active | `[data-testid="billing-tab-pending"]` attr `data-active=true`; `[data-testid="billing-tab-confirmed"]`; `[data-testid="billing-tab-all"]` |
| 20 | All tab shows all requests | Click All tab; table visible | `[data-testid="billing-tab-all"]` click; `[data-testid="billing-requests-table"]` visible |
| 21 | pending request shows Confirm and Reject buttons | Filter rows with confirm button; if count > 0, both buttons visible; otherwise skip annotation | `[data-testid="billing-request-row"]` filtered by `[data-testid="confirm-payment-btn"]`; `[data-testid="reject-payment-btn"]` |

### Platform Plans (P1)

Precondition: logged in as super admin; navigated to PLATFORM_BASE/plans.

| # | Test | Assertions | Selectors |
|---|------|------------|-----------|
| 22 | plans page loads with plan cards | Page visible; at least 3 plan cards (free, starter, pro) | `[data-testid="platform-plans-page"]`; `[data-testid="plan-card"]` count >= 3 |
| 23 | each plan card has Edit and Deactivate/Activate buttons | First card has both buttons | `[data-testid="plan-edit-btn"]`, `[data-testid="plan-toggle-btn"]` on first `[data-testid="plan-card"]` |
| 24 | plan cards show slug, monthly price, and transaction fee | Starter card (data-plan-slug="starter") contains "$" and "%" | `[data-testid="plan-card"][data-plan-slug="starter"]` |
| 25 | clicking Edit opens the plan edit dialog | Click Edit on first card; dialog visible with price input and save button | `[data-testid="plan-edit-dialog"]`, `[data-testid="plan-price-monthly-input"]`, `[data-testid="plan-save-btn"]` |
| 26 | editing plan price saves and closes dialog | Open Pro plan edit; change price; save; dialog closes; restore original value | `[data-plan-slug="pro"]` -> edit btn; `[data-testid="plan-price-monthly-input"]` clear/fill; `[data-testid="plan-save-btn"]` click; dialog not visible (8s timeout) |

### Platform Referrals (P1)

Precondition: logged in as super admin; navigated to PLATFORM_BASE/referrals.

| # | Test | Assertions | Selectors |
|---|------|------------|-----------|
| 27 | referrals page loads with summary cards and tables | Page, form, and table visible | `[data-testid="platform-referrals-page"]`, `[data-testid="generate-code-form"]`, `[data-testid="referral-codes-table"]` |
| 28 | generate code form has code input and submit button | Input and button visible | `[data-testid="referral-code-input"]`, `[data-testid="generate-code-submit"]` |
| 29 | generates a referral code with custom name | Fill unique code, submit, reload, verify row appears (or table is functional) | `[data-testid="referral-code-input"]` fill; `[data-testid="generate-code-submit"]` click; `[data-testid="referral-code-row"]` filtered by code text |
| 30 | all referral codes table shows existing codes | Table visible; rows exist or empty state shown | `[data-testid="referral-codes-table"]`; `[data-testid="referral-code-row"]` count; fallback `text=/No referral codes yet/i` |

### Impersonation Dialog (P2)

Precondition: logged in as super admin; navigated to Code Academy tenant detail.

| # | Test | Assertions | Selectors |
|---|------|------------|-----------|
| 31 | impersonate dialog opens and shows user list | Attempt to open via JS evaluate (base-ui dropdown workaround); if visible: dialog, user list, user rows, sign-in button all visible | `[data-testid="impersonate-dialog"]`, `[data-testid="impersonate-user-list"]`, `[data-testid="impersonate-user-row"]`, `[data-testid="impersonate-signin-btn"]` |

## Notes

- **base-ui DropdownMenu limitation**: DropdownMenu and Select components do not open reliably in Playwright headless mode due to pointer-event differences. Test 31 (impersonation dialog) uses `page.evaluate` to find and click menu items programmatically, and gracefully skips if the dialog cannot be opened.
- Test 26 restores the original plan price after modification to avoid polluting test state.
- Test 29 generates a unique code using `Date.now()` suffix to avoid collisions across runs.
- `loginAsSuperAdmin` logs in as `owner@e2etest.com`, waits for dashboard, then navigates to `/en/platform` and waits for `[data-testid="platform-overview"]`.
- Security guard tests (1-4) are **P0**; all other tests are **P1** or **P2**.
