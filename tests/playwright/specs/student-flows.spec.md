# Student Flows E2E Test Specification

Source of truth for student-facing E2E tests. Covers dashboard, courses, lessons, browse, progress, gamification, profile, payments, and certificates.

## Test Accounts

| Account | Email | Tenant | Role |
|---------|-------|--------|------|
| Default Student | `student@e2etest.com` | Default (lvh.me:3000) | student |
| Tenant Student | `alice@student.com` | Code Academy (code-academy.lvh.me:3000) | student |

Password for all: `password123`

## Seeded Data

- **Course 1001**: "Introduction to Testing" — lessons 1001, 1002
- **Course 1002**: "Web Development Basics" — at least 1 lesson
- Default student is enrolled in both courses
- Code Academy tenant has "Python for Beginners" course

---

## 1. Student Dashboard

**File:** `student-courses.spec.ts`
**Route:** `/en/dashboard/student`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 1.1 | Dashboard container visible | `[data-testid="student-dashboard"]` | testid |
| 1.2 | Welcome hero visible with user greeting | `[data-testid="welcome-hero"]` | testid |
| 1.3 | At least one enrolled course card visible (in-progress section) | `a[href*="/courses/"]` or course card elements | locator |

---

## 2. My Courses Page

**File:** `student-courses.spec.ts`
**Route:** `/en/dashboard/student/courses`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 2.1 | Page container visible | `[data-testid="student-courses-page"]` | testid |
| 2.2 | Page title visible | `[data-testid="my-courses-title"]` | testid |
| 2.3 | At least one course card rendered (enrolled courses exist) | `a[href*="/courses/"]` | locator |
| 2.4 | Course card shows progress information (percentage text) | text matching `%` | text |

---

## 3. Course Detail

**File:** `student-courses.spec.ts`
**Route:** `/en/dashboard/student/courses/{courseId}`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 3.1 | Course title visible (h1) | `h1` | role |
| 3.2 | Curriculum section with lesson list | `a[href*="/lessons/"]` link count > 0 | locator |
| 3.3 | Progress bar visible (percentage text) | text matching `%` | text |
| 3.4 | **Reviews section rendered** (regression: `initialReviews` prop from server) | text matching "Reviews" or Card with review content | text/component |

---

## 4. Lesson Page

**File:** `student-courses.spec.ts`
**Route:** `/en/dashboard/student/courses/{courseId}/lessons/{lessonId}`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 4.1 | Lesson title visible in header (h1) | `h1` | role |
| 4.2 | Complete toggle visible and enabled | `[data-testid="lesson-complete-toggle"]` | testid |
| 4.3 | Sidebar navigation with lesson links visible (desktop) | `nav, aside, [role="navigation"]` | locator |
| 4.4 | **Comments section rendered** (regression: `initialComments` prop from server) | text containing "Comments" or comment form textarea | text/component |

---

## 5. Browse Page

**File:** `student-courses.spec.ts`
**Route:** `/en/dashboard/student/browse`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 5.1 | Page container visible | `[data-testid="browse-courses-page"]` | testid |
| 5.2 | Browse title visible | `[data-testid="browse-title"]` | testid |
| 5.3 | Course count indicator visible | `[data-testid="browse-course-count"]` | testid |
| 5.4 | **Course cards rendered with enrollment status buttons** (regression: `EnrollmentStatus` discriminated union) | Card elements with action buttons (enrolled/enrollable/locked) | component |
| 5.5 | At least one course link present | `a[href*="/courses/"]` count > 0 | locator |

---

## 6. Progress Page

**File:** `student-features.spec.ts`
**Route:** `/en/dashboard/student/progress`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 6.1 | Page container visible | `[data-testid="progress-page"]` | testid |
| 6.2 | Page title visible | `[data-testid="progress-title"]` | testid |
| 6.3 | Stats cards rendered (Courses Enrolled, Lessons Completed, etc.) | Cards with numeric stat values | component |
| 6.4 | Per-course progress section with progress bars | Progress bars or percentage text | component |

---

## 7. Certificates Page

**File:** `student-features.spec.ts`
**Route:** `/en/dashboard/student/certificates`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 7.1 | Page container visible | `[data-testid="certificates-page"]` | testid |
| 7.2 | Page title visible | `[data-testid="certificates-title"]` | testid |

---

## 8. Payments Page

**File:** `student-features.spec.ts`
**Route:** `/en/dashboard/student/payments`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 8.1 | Page container visible | `[data-testid="payments-page"]` | testid |
| 8.2 | Page title visible | `[data-testid="payments-title"]` | testid |

---

## 9. Profile Page

**File:** `student-features.spec.ts`
**Route:** `/en/dashboard/student/profile`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 9.1 | Page container visible | `[data-testid="profile-page"]` | testid |

---

## 10. Gamification Store

**File:** `student-features.spec.ts`
**Route:** `/en/dashboard/student/store`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 10.1 | Page container visible | `[data-testid="store-page"]` | testid |
| 10.2 | Store has heading content | `h1` visible | role |

---

## 11. Sidebar Navigation

**File:** `student-features.spec.ts`
**Route:** `/en/dashboard/student` (any student page)

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 11.1 | Sidebar contains links to: courses, browse, progress, certificates | `a[href*="/dashboard/student/{section}"]` | locator |

---

## 12. Cross-Tenant Isolation

**File:** `student-courses.spec.ts`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 12.1 | Tenant student sees tenant-specific courses on browse page | text "Python for Beginners" visible | text |
| 12.2 | Tenant student courses page loads correctly | `[data-testid="student-courses-page"]` | testid |

---

## Refactor Regression Coverage

These tests specifically validate the composition refactor changes:

| Refactored Component | What Changed | Test Coverage |
|---------------------|--------------|---------------|
| `lesson-comments.tsx` | useEffect removed, `initialComments` prop from server | 4.4 — comments section renders on lesson page |
| `course-reviews.tsx` | useEffect removed, `initialReviews` prop from server | 3.4 — reviews section renders on course detail |
| `browse-course-card.tsx` | Boolean props replaced with `EnrollmentStatus` union | 5.4 — browse cards render with correct status buttons |
| `student/page.tsx` | select('*') narrowed to specific columns | 1.1-1.3 — dashboard loads with data |
| `lessons/[lessonId]/page.tsx` | Queries narrowed | 4.1-4.4 — lesson page loads with all sections |
