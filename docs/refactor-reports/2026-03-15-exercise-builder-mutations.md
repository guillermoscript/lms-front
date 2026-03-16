# QA Report: Exercise Builder Mutations Extracted to Server Actions

**Date:** 2026-03-15
**Subtask:** 1.3 -- Extract exercise-builder mutations to server actions
**Tester:** QA+Report Agent
**Tenant:** Code Academy Pro (`code-academy.lvh.me:3000`)
**Account:** `creator@codeacademy.com` (admin role)

## Files Changed

| File | Change |
|------|--------|
| `app/actions/teacher/exercises.ts` | **New** -- `createExercise` and `updateExercise` server actions with `ExerciseFormData` interface and `buildAudioConfig` helper |
| `components/teacher/exercise-builder.tsx` | **Modified** -- Calls server actions instead of direct Supabase mutations; `createClient` import removed |

## Bug Found and Fixed

### `instructions` column NOT NULL violation (CRITICAL)

**Symptom:** Clicking "Save Draft" on a new exercise returned "An unexpected error occurred."

**Root cause:** Both `createExercise` and `updateExercise` in `app/actions/teacher/exercises.ts` used `data.instructions || null` (line 62 and 106). When the instructions field is left empty (empty string `""`), this evaluates to `null`. However, the `exercises.instructions` column is `NOT NULL` in the database schema, causing a PostgreSQL constraint violation.

**Fix applied:** Changed `data.instructions || null` to `data.instructions || ''` in both `createExercise` (line 62) and `updateExercise` (line 106). This sends an empty string instead of null when no instructions are provided, satisfying the NOT NULL constraint.

## Test Results

### Create Exercise -- PASS (after fix)

| Step | Result |
|------|--------|
| Navigate to teacher dashboard > My Courses > Python for Beginners > Exercises > Add Exercise | Form loads correctly with all fields |
| Buttons disabled when title is empty | Confirmed -- Save Draft and Publish both disabled |
| Fill in title "QA Test Exercise - Server Action" | Buttons become enabled |
| Fill in description | Text accepted |
| Exercise type dropdown shows all 6 types (essay, coding challenge, quiz, discussion, audio evaluation, video evaluation) | Confirmed |
| Difficulty buttons (Easy/Medium/Hard) render correctly | Confirmed |
| Click "Save Draft" | Success -- no error, exercise created in DB (id=10001, status=draft) |

### Edit Exercise -- PASS

| Step | Result |
|------|--------|
| Navigate to exercise edit page (`/exercises/10001`) | Form loads with all saved data pre-populated (title, description, type, difficulty, time limit, status) |
| Change title to "QA Test Exercise - Updated Title" | Field updates |
| Click "Save Draft" | Success -- no error, title updated in DB |
| Hard refresh the page | Updated title persists correctly |

### Publish Exercise -- PASS

| Step | Result |
|------|--------|
| Click "Publish" on exercise edit page | Redirects to exercises list (`/dashboard/teacher/courses/2001/exercises`) |
| Exercise appears in list with updated title | Confirmed |
| Database status changed to "published" | Confirmed via SQL query |

### Smoke Tests -- PASS

| Check | Result |
|-------|--------|
| No console errors | 0 errors across all test flows |
| Loading states on buttons | Spinner icon appears during save |
| `createClient` removed from exercise-builder.tsx | Confirmed -- grep returns no matches |
| Server action uses `requireTeacherOrAdmin()` for auth | Confirmed |
| Server action uses `verifyCourseOwnership()` for authorization | Confirmed |
| Server action filters by `tenant_id` on update query | Confirmed (`.eq('tenant_id', ctx.tenantId)`) |
| `revalidatePath` called after mutations | Confirmed -- exercises list and individual exercise paths |

## Architecture Review

The refactoring correctly follows the established pattern from subtask 1.1 (lesson-editor):

1. **Server action** (`app/actions/teacher/exercises.ts`) handles all mutations with proper auth (`requireTeacherOrAdmin`), ownership verification (`verifyCourseOwnership`), tenant isolation (`.eq('tenant_id', ctx.tenantId)`), and error handling (`actionHandler` wrapper).
2. **Client component** (`components/teacher/exercise-builder.tsx`) is now a pure presentation layer that calls server actions and handles UI state (loading, errors, success feedback).
3. **Audio/video config** is properly handled via `buildAudioConfig()` helper, only included when exercise type is `audio_evaluation` or `video_evaluation`.

## Cleanup

Test exercise (id=10001) was deleted from the database after testing.
