# Tenant Isolation — Test Specification

> Source of truth for `tests/playwright/tenant-isolation.spec.ts`
> Last updated: 2026-03-16

## Test Data

| Item | Value |
|------|-------|
| Default tenant base URL | `http://lvh.me:3000` (BASE) |
| Code Academy tenant base URL | `http://code-academy.lvh.me:3000` (TENANT_BASE) |
| Default student | `student@e2etest.com` / `password123` |
| Tenant student (Code Academy) | `alice@student.com` / `password123` |
| Teacher/Owner (Default) | `owner@e2etest.com` / `password123` |
| Tenant admin (Code Academy) | `creator@codeacademy.com` / `password123` |
| Default tenant course | "Introduction to Testing" (course 1001) |
| Code Academy course | "Python for Beginners" (course 2001) |

## Test Cases

### Tenant Isolation (P0)

| # | Test | Assertions | Selectors / Patterns |
|---|------|------------|----------------------|
| 1 | student on default tenant cannot see code-academy courses via browse | Browse page loads; "Python for Beginners" NOT visible | `[data-testid="browse-course-count"]` visible; `text=/Python for Beginners/i` not visible |
| 2 | student on code-academy cannot see default tenant courses | Browse page loads; "Introduction to Testing" NOT visible | `[data-testid="browse-course-count"]` visible; `text=/Introduction to Testing/i` not visible |
| 3 | non-member accessing code-academy subdomain redirected to join-school | Default student navigates to TENANT_BASE dashboard; redirected to /join-school or /auth/login | URL matches `/join-school\|/auth/login` |
| 4 | admin dashboard on code-academy shows only code-academy data | Admin dashboard loads with stats; body contains "Code Academy" | `[data-testid="admin-dashboard"]`, `[data-testid="admin-stats-grid"]` visible; body text includes "Code Academy" |
| 5 | pricing page on code-academy shows only code-academy products | Pricing page loads; "Code Academy Pro Monthly" visible | `[data-testid="pricing-title"]` visible; `text=/Code Academy Pro Monthly/i` visible |
| 6 | teacher courses list scoped to current tenant | Teacher courses page loads on default tenant; "Python for Beginners" NOT visible | `[data-testid="teacher-courses-list"]` visible; `text=/Python for Beginners/i` not visible |
| 7 | student browse page scoped to current tenant | Tenant student browse shows Code Academy courses; "Python for Beginners" IS visible | `[data-testid="browse-title"]` visible; `text=/Python for Beginners/i` visible |
| 8 | API request to pages includes tenant context | Tenant student navigates to dashboard on code-academy domain; URL confirms subdomain | URL matches `/code-academy\.lvh\.me/` |
| 9 | platform root (lvh.me) loads | Navigate to BASE/en; URL contains lvh.me:3000/en | `page.toHaveURL(/lvh\.me:3000\/en/)` |
| 10 | subdomain (code-academy.lvh.me) shows Code Academy Pro | Navigate to TENANT_BASE/en; "Code Academy Pro" text visible | `text=/Code Academy Pro/i` visible (first match, timeout 15s) |

## Notes

- Tests 1-8 are the original tenant-isolation tests.
- Tests 9-10 were absorbed from `lms-functional.spec.ts` (Multi-Tenant section) because they verify subdomain routing and tenant identity, which is core to tenant isolation.
- Test 3 relies on cross-domain session behavior: default student logs in on lvh.me, then navigates to code-academy.lvh.me. Since cookies are per-origin, the student may appear unauthenticated on the subdomain and get redirected to /auth/login instead of /join-school.
- `loginAsAdmin` logs in on TENANT_BASE (code-academy) by default.
- `loginAsTenantStudent` logs in as alice@student.com on TENANT_BASE.
- All priority: **P0** (tenant isolation is the highest-priority security boundary).
