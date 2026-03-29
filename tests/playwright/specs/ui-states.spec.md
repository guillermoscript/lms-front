# UI States E2E Test Specification

Source of truth for empty states, 404 pages, dark mode, and language switching tests.

## Test Accounts

| Account | Email | Tenant | Role |
|---------|-------|--------|------|
| Default Student | `student@e2etest.com` | Default (lvh.me:3000) | student |
| Tenant Student | `alice@student.com` | Code Academy (code-academy.lvh.me:3000) | student |

Password for all: `password123`

---

## 1. Empty States

**File:** `ui-states.spec.ts`

| # | Route | Assertion | Selector | Type |
|---|-------|-----------|----------|------|
| 1.1 | `/en/dashboard/student/certificates` | Page loads with content | `[data-testid="certificates-page"]` | testid |
| 1.2 | `/en/dashboard/student/payments` | Shows empty state or requests | `[data-testid="payments-page"]` | testid |
| 1.3 | `/en/dashboard/student/progress` | Progress page with title | `[data-testid="progress-page"]`, `[data-testid="progress-title"]` | testid |
| 1.4 | `/en/dashboard/student/store` | Store page with heading | `[data-testid="store-page"]`, `h1` | testid/role |

---

## 2. 404 Page

**File:** `ui-states.spec.ts`
**Route:** `/en/this-page-does-not-exist`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 2.1 | Shows "404" text | `text=404` | text |
| 2.2 | Has navigation links (dashboard or home) | `a[href*="/dashboard"]`, `a[href="/"]` | locator |

---

## 3. Dark Mode Toggle

**File:** `ui-states.spec.ts`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 3.1 | Theme toggle button present | `button:has(.sr-only:text("Toggle theme"))` | locator |
| 3.2 | Selecting "Dark" applies `dark` class to `<html>` | `html[class*="dark"]` | attribute |
| 3.3 | Selecting "Light" removes `dark` class | `html[class]` not containing "dark" | attribute |

---

## 4. Language Switching

**File:** `ui-states.spec.ts`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 4.1 | Login page in Spanish has Spanish text | body matches `Iniciar\|Correo\|Contrase` | text |
| 4.2 | URL preserves `/es/` after login | URL check | url |
| 4.3 | Language switcher changes URL to `/es/` | `button:has(.sr-only:text("Toggle language"))` | locator+url |
| 4.4 | Switching to English changes URL to `/en/` | URL check | url |

---

## Notes

- Dark mode and language tests gracefully skip if the toggle/switcher is not visible in the current layout
- No data mutations; read-only tests
