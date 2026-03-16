# Student Exam Flows — Test Specification

> Source of truth for `tests/playwright/student-exams.spec.ts`
> Last updated: 2026-03-16
> Verified via Playwright MCP browser exploration

## Test Data

| Item | Value |
|------|-------|
| Tenant | Code Academy Pro (`00000000-0000-0000-0000-000000000002`) |
| Base URL | `http://code-academy.lvh.me:3000` |
| Student | Alice (`alice@student.com` / `password123`, ID: `a1000000-0000-0000-0000-000000000004`) |
| Course | 2001 "Python for Beginners" |
| Exam | 2001 "Python Fundamentals — Final Exam" (10 questions, 60 min, true/false + multiple choice) |
| Product | 2001 "Python Mastery Bundle" (covers course 2001) |

## Setup / Teardown

**beforeAll:**
- Clean any prior exam submissions for Alice on exam 2001
- Clean any prior enrollment for Alice in course 2001
- Insert enrollment: Alice → course 2001 via product 2001, status `active`

**afterAll:**
- Delete exam submissions for Alice on exam 2001
- Delete seeded enrollment

**Why:** Alice is seeded with enrollment in course 2002 only. Course 2001 (which has the exam) requires explicit enrollment. Without it, the exam taker page redirects to dashboard.

## Test Cases

### 1. Exams List Page (`/dashboard/student/courses/2001/exams`)

| # | Test | Assertions | Selectors |
|---|------|------------|-----------|
| 1.1 | Page loads with exam title | h1 "Assessments" visible, h3 "Python Fundamentals" visible | `getByRole('heading', { level: 1 })`, `getByRole('heading', { name: /Python Fundamentals/i })` |
| 1.2 | Card shows duration + status | "60 minutes" text visible, "Not Started" or "Start Exam" visible | `getByText(/60 minutes/i)`, `getByText(/Not Started\|Start Exam/i)` |
| 1.3 | Start Exam action link | "Start Exam" link visible, href contains `/exams/2001` | `getByRole('link', { name: /Start Exam/i })` |

### 2. Exam Taker UI (`/dashboard/student/courses/2001/exams/2001`)

| # | Test | Assertions | Selectors |
|---|------|------------|-----------|
| 2.1 | Title, progress, timer | h1 "Python Fundamentals", "Progress: 0/10", "Time Left" + MM:SS format | `getByRole('heading', { level: 1 })`, `getByText(/Progress.*0\/10/i)`, `getByText(/Time Left/i)` |
| 2.2 | Question 1 label + text | "Question 1" indicator visible, h2 question text visible | `getByText(/Question 1/i)`, `getByRole('heading', { level: 2 })` |
| 2.3 | Navigation buttons | "Previous" visible + disabled, "Next Question" visible + enabled | `getByRole('button', { name: /Previous/i })`, `getByRole('button', { name: /Next Question/i })` |
| 2.4 | Answer options (radiogroup) | Radiogroup visible, at least 2 radio options | `getByRole('radiogroup')`, `getByRole('radio')` |

### 3. Exam Question Interaction

| # | Test | Assertions | Selectors |
|---|------|------------|-----------|
| 3.1 | Select answer + navigate | Click first radio → progress updates to 1/10, click Next → "Question 2", click Previous → "Question 1" | `getByRole('radio').first()`, `getByText(/Progress.*1\/10/i)`, `getByText(/Question 2/i)` |
| 3.2 | Last question submit button | Navigate to last question (click Next repeatedly until gone), verify `exam-finish-submit` button visible + enabled with "Finish & Submit" text. **NEVER CLICK IT.** | `getByTestId('exam-finish-submit')` |

## UI Reference (from MCP browser snapshot)

```
Exam Taker Layout:
┌─────────────────────────────────────────────────────────┐
│ [icon] Python Fundamentals — Final Exam                 │
│         PROGRESS: 0/10  ━━━━━━━━━━                     │
│                                          TIME LEFT      │
│                                           59:52         │
├─────────────────────────────────────────────────────────┤
│                    QUESTION 1                           │
│                                                         │
│   In Python, variables declared inside a function       │
│   are accessible outside that function by default.      │
│                                                         │
│   ┌──────────────┐  ┌──────────────┐                   │
│   │    True       │  │    False     │                   │
│   │    ( )        │  │    ( )       │                   │
│   └──────────────┘  └──────────────┘                   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  < Previous (disabled)          Next Question >         │
│                           (last Q: Finish & Submit)     │
└─────────────────────────────────────────────────────────┘
```

## Notes

- The exam has 10 questions — navigating to the last takes ~10 clicks
- First question is true/false (radiogroup with 2 options)
- Timer counts down from 60:00
- `data-testid="exam-finish-submit"` only appears on the last question (replaces "Next Question")
- If Alice already submitted, she gets redirected to `/result` — but our beforeAll cleans submissions
- The `valid_enrollment` CHECK constraint requires `product_id` OR `subscription_id` — we use product 2001
