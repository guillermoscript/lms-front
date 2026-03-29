# Payment Flows — Test Specification

> Source of truth for `tests/playwright/payment-flows.spec.ts`
> Last updated: 2026-03-16

## Test Data

| Item | Value |
|------|-------|
| Default tenant base URL | `http://lvh.me:3000` (BASE) |
| Code Academy tenant base URL | `http://code-academy.lvh.me:3000` (TENANT_BASE) |
| Default student | `student@e2etest.com` / `password123` |
| Tenant student (Code Academy) | `alice@student.com` / `password123` |
| Code Academy product | "Python for Beginners" — productId=3, courseId=3 |
| Code Academy plan | "Code Academy Pro Monthly" — $19/mo |
| Default tenant product | "Default School Premium" (should NOT appear on Code Academy) |

## Test Cases

### Payment Flows (P0)

| # | Test | Assertions | Selectors / Patterns |
|---|------|------------|----------------------|
| 1 | pricing page shows tenant-specific products | Pricing title visible; "Code Academy Pro Monthly" visible; "$19" visible | `[data-testid="pricing-title"]`; `text=/Code Academy Pro Monthly/i`; `text=/\$19/` |
| 2 | manual checkout page renders product details | Checkout title visible with product name, OR student redirected because already subscribed/enrolled | `[data-testid="manual-checkout-title"]` checked with catch; `text=/Python for Beginners/i`; fallback URL matches `/dashboard\|checkout\|courses/` |
| 3 | student can view payment requests page | Payments title visible on tenant student dashboard | `[data-testid="payments-title"]` visible |
| 4 | checkout page requires authentication | Unauthenticated visit to checkout redirects to login | URL matches `/auth/login/` after 2s wait |
| 5 | default tenant pricing page renders | Default student pricing page loads | `[data-testid="pricing-title"]` visible |
| 6 | payment request list is scoped to current tenant | Payments page loads on Code Academy; body does NOT contain "Default School Premium" | `[data-testid="payments-page"]` visible; body text does not contain "Default School Premium" |

## Notes

- Test 2 handles the case where alice@student.com may already have an active subscription covering productId=3, causing a redirect away from checkout. The test accepts either checkout rendering or a valid redirect.
- Test 4 uses a 2-second `waitForTimeout` before checking the URL (no auth session, no helper login).
- Test 6 verifies tenant scoping of payment data by checking that products from the default tenant do not leak into Code Academy's payment request list.
- Checkout URL pattern: `TENANT_BASE/en/checkout/manual?productId=3&courseId=3`.
- All priority: **P0** (payment security is critical).
