# Auth & Security E2E Test Specification

Source of truth for authentication, authorization, and security E2E tests. Covers login UI, sign-up UI, route guards, role-based access, CSRF protection, and security headers.

## Test Accounts

| Account | Email | Tenant | Role |
|---------|-------|--------|------|
| Default Student | `student@e2etest.com` | Default (lvh.me:3000) | student |
| Teacher/Owner | `owner@e2etest.com` | Default (lvh.me:3000) | teacher/admin |
| Tenant Admin | `creator@codeacademy.com` | Code Academy (code-academy.lvh.me:3000) | admin |

Password for all: `password123`

## Constants

| Name | Value |
|------|-------|
| `BASE` | `http://lvh.me:3000` |
| `TENANT_BASE` | `http://code-academy.lvh.me:3000` |
| `LOCALE` | `en` |

---

## 1. Login Page UI

**Route:** `/en/auth/login`

| # | Test | Selector | Expected |
|---|------|----------|----------|
| 1.1 | Login title visible | `[data-testid="login-title"]` | visible |
| 1.2 | Email input visible | `[data-testid="login-email"]` | visible |
| 1.3 | Password input visible | `[data-testid="login-password"]` | visible |
| 1.4 | Submit button visible | `[data-testid="login-submit"]` | visible |

---

## 2. Sign-Up Page UI

**Route:** `/en/auth/sign-up`

| # | Test | Selector | Expected |
|---|------|----------|----------|
| 2.1 | Sign-up title visible | `[data-testid="signup-title"]` | visible |
| 2.2 | Email input visible | `[data-testid="signup-email"]` | visible |
| 2.3 | Password input visible | `[data-testid="signup-password"]` | visible |
| 2.4 | Repeat password input visible | `[data-testid="signup-repeat-password"]` | visible |
| 2.5 | Submit button visible | `[data-testid="signup-submit"]` | visible |

---

## 3. Route Guards — Unauthenticated Redirect

**Precondition:** No authenticated session.

| # | Test | Route | Expected URL Pattern |
|---|------|-------|---------------------|
| 3.1 | Student dashboard redirects | `/en/dashboard/student` | `/auth/login` or `/en` |
| 3.2 | Teacher dashboard redirects | `/en/dashboard/teacher` | `/auth/login` or `/en` |
| 3.3 | Admin dashboard redirects | `/en/dashboard/admin` | `/auth/login` or `/en` |

---

## 4. Route Guards — Role-Based Access

**Precondition:** Logged in as student (`student@e2etest.com`).

| # | Test | Route | Expected |
|---|------|-------|----------|
| 4.1 | Student cannot access teacher dashboard | `/en/dashboard/teacher` | URL does NOT end with `/dashboard/teacher` |
| 4.2 | Student cannot access admin dashboard | `/en/dashboard/admin` | URL does NOT end with `/dashboard/admin` |
| 4.3 | Role-based redirect: /dashboard -> /dashboard/student | `/en/dashboard` | URL matches `/dashboard/student` |

---

## 5. Authentication Flows

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 5.1 | Invalid credentials rejected | Fill `nobody@test.com` / `wrongpassword`, submit | Stay on `/auth/login` |
| 5.2 | Tenant subdomain preserved after login | Login as admin on `TENANT_BASE` | URL contains `code-academy.lvh.me` |

---

## 6. Protected Routes Redirect (Batch)

**Precondition:** No authenticated session. Tests multiple protected routes in a loop.

| # | Route | Expected |
|---|-------|----------|
| 6.1 | `/en/dashboard/student` | Redirects to `/auth/login`, `/auth/sign-in`, `/`, or `/en` |
| 6.2 | `/en/dashboard/teacher/courses` | Same |
| 6.3 | `/en/dashboard/admin/users` | Same |

---

## 7. CSRF Protection

**Route:** `/en/auth/login`

| # | Test | Expected |
|---|------|----------|
| 7.1 | Login form uses CSRF protection | Form innerHTML checked for `csrf`, `token`, or `_token`. Logs whether token-based or cookie-based protection is used. |

---

## 8. Security Headers

**Route:** `/en`

| # | Header | Expected |
|---|--------|----------|
| 8.1 | `x-frame-options` | Logged (may be present or absent depending on config) |
| 8.2 | `x-content-type-options` | Logged |
| 8.3 | `strict-transport-security` | Logged |

---

## Helper Functions

From `utils/auth.ts`:

- `login(page, email, password, baseUrl?)` — navigates to login, fills form via data-testid selectors, clicks submit, waits for `/dashboard/**`, dismisses tours
- `loginAsStudent(page, baseUrl?)` — calls `login()` with student account
- `loginAsTeacher(page, baseUrl?)` — calls `login()` with teacher account
- `loginAsAdmin(page, baseUrl?)` — calls `login()` with admin account on `TENANT_BASE`
