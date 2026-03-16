# Teacher Content CRUD — Test Specification

Source of truth for the `teacher-content.spec.ts` E2E tests. These tests validate the recently-refactored compound component builders (lesson editor, exercise builder, exam builder, certificate template form) and the course detail page that ties them together.

---

## Test Data (seeded in DB)

| Entity        | ID   | Name                              | Parent     |
|---------------|------|-----------------------------------|------------|
| Course        | 1001 | Introduction to Testing           | —          |
| Course        | 1002 | Web Development Basics            | —          |
| Lesson        | 1001 | What is Software Testing?         | Course 1001 |
| Lesson        | 1002 | Writing Your First Unit Test      | Course 1001 |

- **Teacher account:** `owner@e2etest.com` / `password123` (via `loginAsTeacher()`)
- **Base URL:** `http://lvh.me:3000`
- **Locale:** `en`

---

## Flows to Test

### 1. Course Detail Page — Tabs & Layout

**Route:** `/en/dashboard/teacher/courses/1001`

**Assertions:**
- Page loads without error
- Course title "Introduction to Testing" is visible in the header
- Course status badge is visible
- Tab bar is present with five tabs: Lessons, Exercises, Exams, Students, Certificates
- Lessons tab is selected by default
- Lesson count badge shows "2" next to Lessons tab trigger
- Each lesson card links to the lesson editor (`/lessons/1001`, `/lessons/1002`)
- "Add Lesson" button links to `/lessons/new`

**Selectors:**
- `h1` containing course title
- `[data-tour="course-tabs"]` — the TabsList
- `[role="tab"]` — individual tab triggers (text: "Lessons", "Exercises", "Exams", "Students", "Certificates")
- `[data-tour="course-lessons"]` — lessons tab content
- `[data-tour="course-exercises"]` — exercises tab content
- `a[href*="/lessons/new"]` — add lesson button
- `a[href*="/lessons/1001"]` — first lesson link

### 2. Course Detail — Exercises Tab

**Route:** `/en/dashboard/teacher/courses/1001` then click Exercises tab

**Assertions:**
- Exercises tab content renders
- "Add Exercise" button links to `/exercises/new`
- Empty state OR exercise cards render (depending on seeded data)

### 3. Course Detail — Exams Tab

**Route:** `/en/dashboard/teacher/courses/1001` then click Exams tab

**Assertions:**
- Exams tab content renders
- "Add Exam" button links to `/exams/new`

### 4. Course Detail — Certificates Tab

**Route:** `/en/dashboard/teacher/courses/1001` then click Certificates tab

**Assertions:**
- Certificates tab content renders
- Template settings link present (`/certificates/settings`)

### 5. Lesson Editor — Existing Lesson

**Route:** `/en/dashboard/teacher/courses/1001/lessons/1001`

**Assertions:**
- Header shows breadcrumb with course title "Introduction to Testing"
- Header shows "Edit Lesson" (edit mode, not create)
- Step navigation is present with 4 steps: Details, Content, Resources, AI Task
- Details step is shown by default
- Title input is pre-filled with "What is Software Testing?"
- Description textarea is present
- Video URL input is present
- Sequence input is present
- Can click "Content" step and see the content editor (visual/MDX toggle)
- Can click "Resources" step and see resource manager
- Can click "AI Task" step

**Selectors:**
- `[data-tour="lesson-header"]` — header bar
- `[data-tour="lesson-steps"]` — step navigation (desktop)
- `[data-tour="lesson-preview"]` — preview toggle button
- `input[type="text"]` with the lesson title value
- `#description` — description textarea
- `#video_url` — video URL input
- `#sequence` — sequence number input
- `[data-tour="lesson-editor-mode"]` — visual/MDX toggle (on content step)

### 6. Lesson Editor — New Lesson

**Route:** `/en/dashboard/teacher/courses/1001/lessons/new`

**Assertions:**
- Header shows "Create Lesson" (create mode)
- Title input is empty
- Sequence input is pre-filled with next sequence (3, since 2 lessons exist)
- Description textarea is empty
- DO NOT submit — just verify form renders

### 7. Exercise Builder — New Exercise

**Route:** `/en/dashboard/teacher/courses/1001/exercises/new`

**Assertions:**
- Breadcrumb shows course title "Introduction to Testing" and "Create Exercise"
- Step navigation shows 3 steps: Details, AI Configuration, Audio Config
- Details step is shown by default
- Title input (borderless, large) is empty
- Description textarea (`#description`) is present
- Exercise type selector is present (essay, coding_challenge, quiz, discussion, audio_evaluation, video_evaluation)
- Difficulty level buttons (easy, medium, hard) are present
- Time limit input is present
- Status selector is present (draft, published, archived)
- Save Draft and Publish buttons are in the toolbar
- DO NOT submit

**Selectors:**
- `nav` containing step buttons
- `input[type="text"]` — title
- `#description` — description
- Difficulty buttons with text "Easy", "Medium", "Hard"
- Time limit `input[type="number"]`

### 8. Exam Builder — New Exam

**Route:** `/en/dashboard/teacher/courses/1001/exams/new`

**Assertions:**
- Breadcrumb shows course title and "Create Exam"
- Exam Details card is visible with:
  - Title input (`#title`, required)
  - Description textarea (`#description`)
  - Duration input (`#duration`)
  - Sequence input (`#sequence`)
- Questions section header shows "Questions (0)"
- "Add Multiple Choice", "Add True/False", "Add Free Text" buttons are present
- DO NOT submit

**Selectors:**
- `#title` — exam title
- `#description` — exam description
- `#duration` — duration in minutes
- `#sequence` — sequence number
- Buttons containing "Multiple Choice", "True/False", "Free Text"

### 9. Certificate Template Settings

**Route:** `/en/dashboard/teacher/courses/1001/certificates/settings`

**Assertions:**
- Breadcrumb shows course title, "Certificates", and create/edit label
- Certificate Info section:
  - Template name input (`#template_name`, required)
  - Description textarea (`#description`)
  - Issuance criteria textarea (`#issuance_criteria`)
- Issuer Details section:
  - Issuer name input (`#issuer_name`, required)
  - Issuer URL input (`#issuer_url`)
  - Logo upload area
- Preview panel is visible on the right (desktop)
- Submit and Cancel buttons present
- DO NOT submit

**Selectors:**
- `#template_name` — template name
- `#description` — description
- `#issuance_criteria` — issuance criteria
- `#issuer_name` — issuer name
- `#issuer_url` — issuer URL
- `button[type="submit"]` — save
- `button[type="button"]` — cancel

### 10. Revenue Dashboard

**Route:** `/en/dashboard/teacher/revenue`

**Assertions:**
- Revenue page loads (data-testid="revenue-page")
- "Revenue Dashboard" heading visible

### 11. Templates Page

**Route:** `/en/dashboard/teacher/templates`

**Assertions:**
- Templates page loads (data-testid="templates-page")

---

## Test Organization

Tests are grouped into `test.describe` blocks:
1. **Course Detail Page** — tabs, layout, navigation (serial)
2. **Lesson Editor** — existing + new lesson forms
3. **Exercise Builder** — new exercise form
4. **Exam Builder** — new exam form
5. **Certificate Template** — settings form
6. **Teacher Pages** — revenue + templates

---

## Non-Goals

- **No data mutation tests** — forms are navigated and inspected but NOT submitted, to avoid test data pollution across repeated runs.
- **No file upload tests** — logo/signature uploads require Supabase storage.
- **No AI grading configuration** — depends on external LLM config.
