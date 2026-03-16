# QA Report: Lesson Editor Mutations Extracted to Server Actions

**Date:** 2026-03-15
**Subtask:** 1.1 -- Extract lesson-editor mutations to server actions
**Tester:** QA+Report Agent
**Tenant:** Code Academy Pro (`code-academy.lvh.me:3000`)
**Account:** `creator@codeacademy.com` (admin role)

## Files Changed

| File | Change |
|------|--------|
| `app/actions/teacher/lessons.ts` | **New** -- `createLesson` and `updateLesson` server actions |
| `lib/actions/utils.ts` | **New** -- Shared action utilities (`actionHandler`, `requireTeacherOrAdmin`, `verifyCourseOwnership`, `authenticateUser`, `requireAdmin`) |
| `components/teacher/lesson-editor.tsx` | **Modified** -- Calls server actions instead of direct Supabase mutations; `createClient` import removed |

## Bug Found and Fixed

### Missing `tenant_id` in `createLesson` insert (CRITICAL)

**Symptom:** Clicking "Save Draft" on a new lesson returned "An unexpected error occurred."

**Root cause:** The `createLesson` function in `app/actions/teacher/lessons.ts` did not include `tenant_id` in the `.insert()` call. The `lessons` table has `tenant_id NOT NULL` with a default of `'00000000-0000-0000-0000-000000000001'`. For any tenant other than the default, the RLS INSERT policy (`tenant_id = get_tenant_id()`) rejects the row because the default UUID does not match the actual tenant.

**Fix applied:** Added `tenant_id: ctx.tenantId` to the insert object (line 30).

**Note:** The `updateLesson` function was already correct -- it filters by `.eq('tenant_id', ctx.tenantId)`.

## Test Results

### Create Lesson Flow

| Step | Result | Notes |
|------|--------|-------|
| Navigate to course > Add Lesson | PASS | Editor loads at `/lessons/new`, sequence auto-set to 8 |
| Empty title disables Save/Publish buttons | PASS | Both buttons disabled when title is empty |
| Fill title + description, click Save Draft | PASS (after fix) | Lesson created with correct `tenant_id`, status `draft` |
| Page stays on editor after draft save | PASS | URL remains on `/lessons/new` |
| Success indicator appears | PASS | Green checkmark briefly shown on Save Draft button (auto-clears after 2s) |
| Lesson visible in course curriculum | PASS | Shows as lesson #8 with "Draft" badge |

### Edit Lesson Flow

| Step | Result | Notes |
|------|--------|-------|
| Click lesson in curriculum to edit | PASS | Loads at `/lessons/10001` with pre-populated form |
| Breadcrumb shows "Edit Lesson" | PASS | Correctly distinguishes from "New Lesson" |
| Update title, click Save Draft | PASS | Title updated in DB, page stays on editor |
| Data persists after page refresh | PASS | Full reload shows updated title and description |

### Publish Flow

| Step | Result | Notes |
|------|--------|-------|
| Click Publish on edited lesson | PASS | Status changed to `published` in DB |
| Redirects to course page | PASS | Navigates to `/dashboard/teacher/courses/2001` |
| Lesson no longer shows Draft badge | PASS | Published lesson has no badge in curriculum |

### Smoke Tests

| Check | Result | Notes |
|-------|--------|-------|
| No console errors | PASS | Zero errors throughout all flows |
| `createClient` removed from lesson-editor | PASS | No Supabase client imports remain in the component |
| Resources tab loads correctly | PASS | Upload area renders, not affected by refactor |
| Loading spinner during save | PASS | Spinner icon shown while action executes |
| Error banner dismissible | PASS | X button clears the error message |

## Screenshots

1. `screenshots/01-course-page-lessons-tab.png` -- Course page with 7 lessons before test
2. `screenshots/02-new-lesson-empty-form.png` -- Empty lesson form with disabled buttons
3. `screenshots/03-create-lesson-error.png` -- Error before fix (missing tenant_id)
4. `screenshots/04-create-lesson-draft-success.png` -- Successful draft save after fix
5. `screenshots/05-lesson-appears-in-curriculum.png` -- New lesson visible in curriculum with Draft badge
6. `screenshots/06-edit-lesson-save-draft.png` -- Updated title saved as draft
7. `screenshots/07-publish-redirected-to-course.png` -- After publish, redirected to course page
8. `screenshots/08-resources-tab-working.png` -- Resources tab unaffected by refactor

## Observations (Non-blocking)

1. **URL not updated after create:** When saving a new lesson as draft, the URL stays at `/lessons/new` instead of updating to `/lessons/{id}`. If the user clicks "Save Draft" again, it will create a duplicate. This is pre-existing behavior, not a regression from this refactor.

2. **Success indicator timing:** The green checkmark on "Save Draft" auto-clears after 2 seconds, which can be missed if the save takes longer or if the user is not looking at the button. Consider a toast notification instead.

## Verdict

**PASS** (with one fix applied). The `createLesson` server action was missing `tenant_id` in the insert, which caused a critical failure for any non-default tenant. After adding `tenant_id: ctx.tenantId`, all create, update, and publish flows work correctly. The `updateLesson` action was already correct. The lesson-editor component successfully uses server actions instead of direct Supabase mutations, with `createClient` fully removed.
