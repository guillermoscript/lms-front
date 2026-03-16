# QA Report: Exam Builder Mutations (Server Actions)

**Date:** 2026-03-15
**Subtask:** 1.5 — exam-builder mutations to server actions
**Tested by:** QA+Report Agent
**Status:** FAIL (2 bugs found and fixed during testing)

## Files Changed

| File | Change |
|------|--------|
| `app/actions/teacher/exams.ts` | New server actions: `createExam`, `updateExam` |
| `components/teacher/exam-builder.tsx` | Calls server actions instead of direct Supabase client |
| `app/[locale]/dashboard/teacher/courses/[courseId]/exams/new/page.tsx` | Removed `tenantId` prop |
| `app/[locale]/dashboard/teacher/courses/[courseId]/exams/[examId]/page.tsx` | Removed `tenantId` prop |

## Test Results

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Login + navigate to teacher > course > exams > create new | PASS | Page loads correctly with form fields and question buttons |
| 2 | Fill exam title, add MC question with 3 options, mark one correct | PASS | UI works as expected |
| 3 | Save as draft | FAIL (initial) | Server action inserted non-existent columns; fixed, then PASS |
| 4 | Add True/False question | PASS | Pre-populates True/False options, correct answer toggling works |
| 5 | Save and verify questions persist after reload | PASS | After fix, questions and options persist correctly |
| 6 | Edit existing exam (exam 2001) | FAIL (initial) | Crashed on null `expected_keywords`; fixed, then PASS |
| 7 | Publish exam | PASS | Status changes, "Draft" badge removed |
| 8 | No console errors | PASS | After fixes, zero console errors |

## Bugs Found and Fixed

### Bug 1 (Critical): Server action inserted columns that don't exist in database

**Symptom:** "An unexpected error occurred" on save.

**Root cause:** `insertQuestionsAndOptions()` in `app/actions/teacher/exams.ts` tried to insert:
- `exam_questions`: `tenant_id`, `points_possible`, `sequence`, `grading_rubric` -- none of these columns exist
- `question_options`: `tenant_id` -- does not exist

The server action was written against an assumed schema that didn't match the actual database.

**Fix applied:** Removed all non-existent column references from insert statements. Removed unused `tenantId` parameter from `insertQuestionsAndOptions()` function signature and call sites.

**Files:** `app/actions/teacher/exams.ts`

### Bug 2 (Critical): ExamBuilder crashes when loading exams with null `expected_keywords`

**Symptom:** "Cannot read properties of null (reading 'join')" -- crashes the entire page via ErrorBoundary when editing exam 2001.

**Root cause:** The `expected_keywords` column in `exam_questions` is nullable. The ExamBuilder component's initial state mapping spread the raw DB value (`null`) without defaulting, then the JSX called `.join(', ')` on it.

**Fix applied:** Added null-safe defaults in the `questions` mapping inside `useState` initialization:
```typescript
expected_keywords: q.expected_keywords || [],
ai_grading_criteria: q.ai_grading_criteria || '',
points_possible: q.points_possible ?? 10,
```

**File:** `components/teacher/exam-builder.tsx`

## Architectural Observations

### Non-Transactional Multi-Table Writes

`createExam` inserts into `exams` first, then loops through `exam_questions` and `question_options`. If question/option insertion fails (as it did with Bug 1), the exam row is left orphaned in the database. During testing, this produced an orphaned exam (ID 10000) with no questions.

**Recommendation:** Consider wrapping the multi-table write in a Postgres function (RPC) or using Supabase's transaction support to ensure atomicity. Alternatively, add cleanup logic that deletes the exam row if question insertion fails.

### Schema Mismatch Between Interface and Database

The `ExamQuestionData` interface defines `points_possible`, `sequence`, and `grading_rubric` fields that are not columns in the `exam_questions` table. These fields are used for client-side UI/validation but silently ignored now after the fix. This could cause confusion for future developers who expect these values to persist.

**Recommendation:** Either add the missing columns to the database via migration, or remove them from the interface and adjust the UI accordingly.

## Cleanup Performed

- Deleted orphaned test exams (IDs 10000 and 10001) and their associated questions/options from the database.

## Checklist Summary

- [x] Create exam with multiple choice + true/false questions
- [x] Save as draft
- [x] Edit existing exam with data loading correctly
- [x] Publish exam
- [x] No console errors after fixes
- [x] Server actions use `requireTeacherOrAdmin()` + `verifyCourseOwnership()`
- [x] `actionHandler` wraps all mutations with error handling
- [x] `revalidatePath` called after mutations
- [x] Component no longer imports `createClient` directly
