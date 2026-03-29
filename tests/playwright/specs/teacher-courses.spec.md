# Teacher Course Management E2E Test Specification

Source of truth for teacher-facing E2E tests. Covers dashboard, course listing, course creation form, course detail navigation, revenue, and certificate templates.

## Test Accounts

| Account | Email | Tenant | Role | Landing Page |
|---------|-------|--------|------|--------------|
| Teacher/Owner | `owner@e2etest.com` | Default (lvh.me:3000) | admin | `/dashboard/admin` |
| Code Academy Admin | `creator@codeacademy.com` | Code Academy (code-academy.lvh.me:3000) | admin | `/dashboard/admin` |

Password for all: `password123`

**Important:** The teacher account (`owner@e2etest.com`) has admin role on the default tenant and lands on `/dashboard/admin` after login. All teacher tests must navigate explicitly to `/dashboard/teacher`.

## Seeded Data

- **Course 1001**: "Introduction to Testing" — available on default tenant
- Teacher/owner account has access to teacher dashboard pages

---

## 1. Teacher Dashboard

**File:** `teacher-courses.spec.ts`
**Route:** `/en/dashboard/teacher`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 1.1 | Dashboard container visible | `[data-testid="teacher-dashboard"]` | testid |
| 1.2 | Welcome message visible | `[data-testid="teacher-welcome"]` | testid |

---

## 2. Courses List

**File:** `teacher-courses.spec.ts`
**Route:** `/en/dashboard/teacher/courses`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 2.1 | Courses list container visible | `[data-testid="teacher-courses-list"]` | testid |

---

## 3. Course Creation Form

**File:** `teacher-courses.spec.ts`
**Route:** `/en/dashboard/teacher/courses/new`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 3.1 | Title field visible | `label` matching `/title/i` | label |
| 3.2 | Description field visible | `label` matching `/description/i` | label |
| 3.3 | Status field visible | `label` matching `/status/i` | label |
| 3.4 | Submitting empty form stays on page (validation) | URL still contains `/courses/new` | url |

---

## 4. Course Detail / Edit Navigation

**File:** `teacher-courses.spec.ts`
**Route:** `/en/dashboard/teacher/courses/{courseId}`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 4.1 | Courses list loads first | `[data-testid="teacher-courses-list"]` | testid |
| 4.2 | Edit link for course 1001 visible | `a[href*="/teacher/courses/1001"]` | locator |
| 4.3 | Clicking edit navigates to course detail URL | URL matches `/teacher/courses/\d+` | url |

---

## 5. Revenue Page

**File:** `teacher-courses.spec.ts`
**Route:** `/en/dashboard/teacher/revenue`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 5.1 | Revenue page container visible | `[data-testid="revenue-page"]` | testid |

---

## 6. Certificate Templates Page

**File:** `teacher-courses.spec.ts`
**Route:** `/en/dashboard/teacher/templates`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 6.1 | Templates page container visible | `[data-testid="templates-page"]` | testid |

---

## 7. Smoke Test (Full Navigation Flow)

**File:** `teacher-courses.spec.ts`
**Route:** Multiple routes in sequence

| # | Step | Assertion | Selector |
|---|------|-----------|----------|
| 7.1 | Navigate to dashboard | Dashboard visible | `[data-testid="teacher-dashboard"]` |
| 7.2 | Navigate to courses list | Courses list visible | `[data-testid="teacher-courses-list"]` |
| 7.3 | Navigate to create course | Title and description fields visible | `label` matching `/title/i`, `/description/i` |
| 7.4 | Navigate to revenue | Revenue page visible | `[data-testid="revenue-page"]` |
| 7.5 | Navigate to templates | Templates page visible | `[data-testid="templates-page"]` |
| 7.6 | No console errors | Console error array is empty | `page.on('console')` |

---

## 8. Cross-Tenant: Admin Access to Teacher Pages

**File:** `teacher-courses.spec.ts`
**Tenant:** Code Academy (`code-academy.lvh.me:3000`)

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 8.1 | Admin can access course creation form | Title field visible | `label` matching `/title/i` |
