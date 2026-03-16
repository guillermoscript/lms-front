# Admin Dashboard — Test Specification

> Source of truth for `tests/playwright/admin-pages.spec.ts` and `tests/playwright/admin-management.spec.ts`
> Last updated: 2026-03-16

## Test Data

| Item | Value |
|------|-------|
| Code Academy tenant base URL | `http://code-academy.lvh.me:3000` (TENANT_BASE) |
| Admin account | `creator@codeacademy.com` / `password123` |
| Login helper | `loginAsAdmin(page)` — logs in on TENANT_BASE by default |

## Test Cases

### Admin Pages (P1) — `admin-pages.spec.ts`

All tests use `beforeEach` to call `loginAsAdmin(page)`.

| # | Test | Route | Assertions | Selectors |
|---|------|-------|------------|-----------|
| 1 | admin dashboard loads with stats grid | `/en/dashboard/admin` (default after login) | Dashboard and stats grid visible | `[data-testid="admin-dashboard"]`, `[data-testid="admin-stats-grid"]` |
| 2 | admin users page loads with user list | `/en/dashboard/admin/users` | Users page visible | `[data-testid="users-page"]` |
| 3 | admin can view individual user detail | `/en/dashboard/admin/users` | Click first user link; URL matches `/admin/users/` | `a[href*="/admin/users/"]` first; conditional click if visible |
| 4 | admin courses page loads | `/en/dashboard/admin/courses` | Courses page visible | `[data-testid="admin-courses-page"]` |
| 5 | admin enrollments page loads | `/en/dashboard/admin/enrollments` | Enrollments page visible | `[data-testid="enrollments-page"]` |
| 6 | admin transactions page loads | `/en/dashboard/admin/transactions` | Transactions page visible | `[data-testid="transactions-page"]` |
| 7 | admin products page loads | `/en/dashboard/admin/products` | Products page visible | `[data-testid="products-page"]` |
| 8 | admin plans page loads | `/en/dashboard/admin/plans` | Plans page visible | `[data-testid="plans-page"]` |
| 9 | admin categories page loads | `/en/dashboard/admin/categories` | Categories page visible | `[data-testid="categories-page"]` |
| 10 | admin settings page loads | `/en/dashboard/admin/settings` | Settings page visible | `[data-testid="settings-page"]` |

### Admin Management (P1) — `admin-management.spec.ts`

All tests use `beforeEach` to call `loginAsAdmin(page)`.

| # | Test | Route | Assertions | Selectors |
|---|------|-------|------------|-----------|
| 11 | admin payment requests page loads | `/en/dashboard/admin/payment-requests` | Page visible (30s nav timeout, 15s selector timeout) | `[data-testid="payment-requests-page"]` |
| 12 | admin subscriptions page loads | `/en/dashboard/admin/subscriptions` | Page visible | `[data-testid="subscriptions-page"]` |
| 13 | admin notifications page loads | `/en/dashboard/admin/notifications` | Page visible | `[data-testid="notifications-page"]` |
| 14 | admin notification templates page loads | `/en/dashboard/admin/notifications/templates` | Page visible | `[data-testid="notification-templates-page"]` |
| 15 | admin billing page shows current plan and usage | `/en/dashboard/admin/billing` | Billing page visible; "Billing" text visible | `[data-testid="billing-page"]`; `text=/Billing/i` (first) |
| 16 | admin billing upgrade page shows plan comparison | `/en/dashboard/admin/billing/upgrade` | Upgrade page visible; "Upgrade Your Plan" text visible | `[data-testid="upgrade-page"]`; `text=/Upgrade Your Plan/i` |
| 17 | admin analytics page loads | `/en/dashboard/admin/analytics` | Analytics page visible | `[data-testid="analytics-page"]` |
| 18 | admin can access teacher course creation | `/en/dashboard/teacher/courses/new` | Title input visible (40s nav timeout) | `input` matching `getByLabel(/title/i)` |

## Notes

- All tests run on the Code Academy tenant (TENANT_BASE) since `loginAsAdmin` defaults to that domain.
- Test 3 (user detail) is conditional: it only clicks if a user link is visible in the table. If no users exist, the test passes silently.
- Test 11 uses extended timeouts (30s navigation, 15s selector) because the payment requests page may be slow to load.
- Test 18 crosses the admin/teacher boundary: an admin navigates to the teacher course creation form, verifying that admins have teacher-level access.
- All priority: **P1** (admin pages are important but not security-critical smoke tests).
