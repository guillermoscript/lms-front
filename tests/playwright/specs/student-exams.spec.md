# Student Exams E2E Test Specification

Source of truth for student exam-taking E2E tests. Covers exam list, exam taker UI, question interaction, and result viewing.

## Test Accounts

| Account | Email | Tenant | Role |
|---------|-------|--------|------|
| Tenant Student | `alice@student.com` | Code Academy (code-academy.lvh.me:3000) | student |

Password: `password123`

## Seeded Data

- **Course 2001**: On Code Academy tenant (00000000-0000-0000-0000-000000000002)
- **Exam 2001**: "Python Fundamentals -- Final Exam" on course 2001
- Alice is enrolled in Code Academy courses
- Exam has questions of types: multiple_choice, true_false, free_text

---

## 1. Course Detail -- Exams Link

**File:** `student-exams.spec.ts`
**Route:** `/en/dashboard/student/courses/2001`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 1.1 | Course detail page loads with title | `h1` | locator |
| 1.2 | Exams button/link is visible when course has exams | `a[href*="/exams"]` | locator |

---

## 2. Exams List Page

**File:** `student-exams.spec.ts`
**Route:** `/en/dashboard/student/courses/2001/exams`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 2.1 | Exams list page loads with title (Assessments heading) | `h1` with text matching "Assessments" or exams title | text |
| 2.2 | At least one exam card is visible with title | Exam card with exam title text | text |
| 2.3 | Exam card shows duration info | Text matching "minutes" | text |

---

## 3. Exam Taker UI

**File:** `student-exams.spec.ts`
**Route:** `/en/dashboard/student/courses/2001/exams/2001`

**Note:** If Alice has already submitted exam 2001, she will be redirected to the result page. Tests must handle both states.

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 3.1 | Exam taker loads with exam title in header | Text matching exam title | text |
| 3.2 | Progress indicator shows question count (e.g. "0/N") | Text matching progress pattern | text |
| 3.3 | Question text is displayed | `h2` element with question text | locator |
| 3.4 | Question type indicator shows "Question 1" | Text matching "Question 1" | text |
| 3.5 | "Next Question" button is visible (if not last question) | Button with text "Next Question" | text |

---

## 4. Exam Question Interaction

**File:** `student-exams.spec.ts`
**Route:** `/en/dashboard/student/courses/2001/exams/2001`

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 4.1 | Multiple choice: radio button options are visible and clickable | `label` elements with radio inputs | locator |
| 4.2 | Navigate to next question via "Next Question" button | Click button, verify Question 2 appears | interaction |
| 4.3 | Navigate back via "Previous" button | Click Previous, verify Question 1 reappears | interaction |

**IMPORTANT:** Do NOT click "Finish & Submit" (`[data-testid="exam-finish-submit"]`). Only test UI rendering and navigation.

---

## 5. Exam Results (Prior Submission)

**File:** `student-exams.spec.ts`
**Route:** `/en/dashboard/student/courses/2001/exams/2001/result`

If Alice has a prior submission for exam 2001, this page should show:

| # | Assertion | Selector | Type |
|---|-----------|----------|------|
| 5.1 | Result page shows "Exam Completed" badge or score | Text matching "Exam Completed" or "Final Score" | text |
| 5.2 | Detailed question review section is visible | Text matching "Detailed Question Review" | text |
| 5.3 | Navigation buttons visible (View All Assessments, Continue Learning) | Buttons/links with those texts | text |

---

## Important Notes

- Use `loginAsTenantStudent` helper (alice@student.com on Code Academy)
- Base URL: `TENANT_BASE` from constants (code-academy.lvh.me:3000)
- `test.setTimeout(60_000)` for all tests (pages involve server-side data fetching)
- The exam-taker page redirects to `/result` if a submission already exists -- tests must handle this
- Do NOT submit the exam (avoid creating exam_submissions records)
- The `[data-testid="exam-finish-submit"]` button exists but must NOT be clicked
