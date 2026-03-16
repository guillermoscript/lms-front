# Student Features — Test Specification

> Source of truth for `tests/playwright/student-features.spec.ts`
> Last updated: 2026-03-16

## Test Data

| Item | Value |
|------|-------|
| Default tenant base URL | `http://lvh.me:3000` (BASE) |
| Code Academy tenant base URL | `http://code-academy.lvh.me:3000` (TENANT_BASE) |
| Default student | `student@e2etest.com` / `password123` |
| Tenant student (Code Academy) | `alice@student.com` / `password123` |

## Test Cases

### Progress Page (P1)

Precondition: logged in as default student.

| # | Test | Route | Assertions | Selectors |
|---|------|-------|------------|-----------|
| 1 | shows progress stats and per-course progress | `/en/dashboard/student/progress` | Page and title visible; either stats grid cards OR empty state ("No enrollments" / "Browse Courses") visible; if stats visible, numeric values present | `[data-testid="progress-page"]`, `[data-testid="progress-title"]`; `[class*="grid"] [class*="p-6"]` or `text=/No enrollments\|Browse Courses/i`; `text=/\d+/` |

### Certificates Page (P1)

Precondition: logged in as default student.

| # | Test | Route | Assertions | Selectors |
|---|------|-------|------------|-----------|
| 2 | certificates page loads with title | `/en/dashboard/student/certificates` | Page and title visible | `[data-testid="certificates-page"]`, `[data-testid="certificates-title"]` |

### Payments Page (P1)

Precondition: logged in as default student.

| # | Test | Route | Assertions | Selectors |
|---|------|-------|------------|-----------|
| 3 | payments page loads with title and content | `/en/dashboard/student/payments` | Page and title visible | `[data-testid="payments-page"]`, `[data-testid="payments-title"]` |

### Profile Page (P1)

Precondition: logged in as default student.

| # | Test | Route | Assertions | Selectors |
|---|------|-------|------------|-----------|
| 4 | profile page loads with user settings | `/en/dashboard/student/profile` | Page visible; body not empty | `[data-testid="profile-page"]`; `body` not empty |

### Gamification Store (P2)

Precondition: logged in as default student.

| # | Test | Route | Assertions | Selectors |
|---|------|-------|------------|-----------|
| 5 | store page loads with heading and store section | `/en/dashboard/student/store` | Page visible; h1 heading visible | `[data-testid="store-page"]`; `h1` first |

### Sidebar Navigation (P1)

Precondition: logged in as default student.

| # | Test | Route | Assertions | Selectors |
|---|------|-------|------------|-----------|
| 6 | sidebar contains links to all student sections | `/en/dashboard/student` (after login) | Links to courses, browse, progress, certificates visible | `a[href*="/dashboard/student/courses"]`, `a[href*="/dashboard/student/browse"]`, `a[href*="/dashboard/student/progress"]`, `a[href*="/dashboard/student/certificates"]` — all `.first()` |
| 7 | sidebar links navigate to correct pages (60s timeout) | `/en/dashboard/student` (after login) | Click courses link -> courses page visible; click browse -> browse page visible; click progress -> progress page visible | Click `a[href*="/dashboard/student/courses"]` -> `[data-testid="student-courses-page"]`; click `a[href*="/dashboard/student/browse"]` -> `[data-testid="browse-courses-page"]`; click `a[href*="/dashboard/student/progress"]` -> `[data-testid="progress-page"]` (each 15s timeout) |

### Code Academy Tenant (P1)

| # | Test | Assertions | Selectors |
|---|------|------------|-----------|
| 8 | tenant student payments page loads | Payments page visible on TENANT_BASE | `[data-testid="payments-page"]` |
| 9 | tenant student progress page loads | Progress page and title visible on TENANT_BASE | `[data-testid="progress-page"]`, `[data-testid="progress-title"]` |

## Notes

- Test 1 handles two states: enrolled (shows stats grid with numeric values) or not enrolled (shows empty state with CTA). Uses `.catch(() => false)` for graceful timeout handling.
- Test 7 has a 60-second overall timeout and 15-second per-navigation timeouts due to sequential page transitions.
- Tests 8-9 log in as `alice@student.com` on Code Academy (TENANT_BASE) via `loginAsTenantStudent`.
- This spec validates that the composition refactor (server data props, select narrowing) did not break student feature pages.
