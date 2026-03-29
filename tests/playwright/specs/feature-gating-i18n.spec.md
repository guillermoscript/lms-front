# Feature Gating & Internationalization — Test Specification

> Source of truth for `tests/playwright/feature-gating.spec.ts` and `tests/playwright/i18n.spec.ts`
> Last updated: 2026-03-16

## Test Data

| Item | Value |
|------|-------|
| Default tenant base URL | `http://lvh.me:3000` (BASE) |
| Code Academy tenant base URL | `http://code-academy.lvh.me:3000` (TENANT_BASE) |
| Admin account (Code Academy) | `creator@codeacademy.com` / `password123` |
| Student account (Default) | `student@e2etest.com` / `password123` |

## Test Cases

### Feature Gating (P2) — `feature-gating.spec.ts`

| # | Test | Route | Assertions | Selectors |
|---|------|-------|------------|-----------|
| 1 | billing page shows usage meters | `TENANT_BASE/en/dashboard/admin/billing` | Billing page visible; body has substantial content (>100 chars) | `[data-testid="billing-page"]`; body textContent length > 100 |
| 2 | upgrade page shows plans with pricing | `TENANT_BASE/en/dashboard/admin/billing/upgrade` | Upgrade page visible; body matches plan names | `[data-testid="upgrade-page"]`; body matches `/free\|starter\|pro\|business\|enterprise/i` |
| 3 | public platform-pricing page renders plan comparison | `BASE/en/platform-pricing` | Page loads (body visible); may redirect | `body` visible (no specific testid — page may redirect) |
| 4 | course creation shows plan limit info | `TENANT_BASE/en/dashboard/teacher/courses` | Teacher courses list visible; body has content (>50 chars) | `[data-testid="teacher-courses-list"]`; body textContent length > 50 |

### Internationalization (P2) — `i18n.spec.ts`

| # | Test | Route | Assertions | Selectors |
|---|------|-------|------------|-----------|
| 5 | default route includes /en locale | `BASE/` | URL contains /en after navigation + networkidle | `page.toHaveURL(/\/en/)` |
| 6 | /es locale route loads correctly | `BASE/es` | URL contains /es | `page.toHaveURL(/\/es/)` |
| 7 | login page renders in Spanish | `BASE/es/auth/login` | Login title and email visible; body contains Spanish text (Iniciar/Correo/Contrasena) | `[data-testid="login-title"]`, `[data-testid="login-email"]`; body matches `/Iniciar\|Correo\|Contrasena/i` |
| 8 | dashboard respects locale from URL | `BASE/es/auth/login` | Login with student credentials via /es; after redirect, URL preserves /es/ | `[data-testid="login-email"]` fill, `[data-testid="login-password"]` fill, `[data-testid="login-submit"]` click; URL contains `/es/` |

## Notes

- Feature gating tests (1-4) all require admin login on Code Academy tenant via `loginAsAdmin`.
- Test 3 (platform-pricing) is a public page that requires no authentication. It may redirect depending on configuration — the test only verifies the page loads.
- Test 8 (i18n dashboard locale) uses inline login (not the helper) to test the /es locale path explicitly.
- All tests in both files are **P2** (lower priority — feature completeness, not security).
- Feature gating tests verify the billing/upgrade UI renders plan information but do NOT test actual enforcement of limits (e.g., blocking course creation when at plan max).
