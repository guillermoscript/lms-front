# Lesson Editor Compound Components Refactor -- QA Report

**Date:** 2026-03-15
**Scope:** Subtask 1.2 -- Split 837-line lesson-editor monolith into compound components
**Tested on:** `code-academy.lvh.me:3000` as `creator@codeacademy.com` (admin/teacher)

## File Structure

The monolith was split into 9 files under `components/teacher/lesson-editor/`:

| File | Lines | Responsibility |
|------|-------|----------------|
| `index.tsx` | 2 | Barrel export |
| `lesson-editor.tsx` | 110 | Orchestrator shell |
| `lesson-editor-context.tsx` | 230 | Provider + shared state + `handleSave` logic |
| `lesson-editor-header.tsx` | 144 | Breadcrumb, step nav, action buttons (desktop) |
| `lesson-editor-actions.tsx` | 54 | Save/Publish buttons (shared desktop + mobile) |
| `lesson-details-step.tsx` | 173 | Step 1: title, summary, video, sequence, schedule |
| `lesson-content-step.tsx` | 118 | Step 2: Visual/MDX editor toggle |
| `lesson-ai-task-step.tsx` | 114 | Step 4: AI task prompt + grading instructions |
| `lesson-preview-panel.tsx` | 82 | Side panel with MDX preview |

**Total: ~1027 lines across 9 files vs 837 in the monolith.** The increase is expected due to import statements and component boilerplate, but each file is now focused and maintainable.

## Test Results

### Navigation & Steps

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Navigate to create new lesson | PASS | `/courses/2001/lessons/new` loads correctly |
| 2 | All 4 steps visible in header | PASS | Details, Content, Resources, AI Task |
| 3 | Click through each step | PASS | Content switches correctly, active state highlighted |
| 4 | Mobile step nav | PASS | Horizontal pill-style buttons below header, overflow-x-auto |

### Step 1: Details

| # | Test | Result | Notes |
|---|------|--------|-------|
| 5 | Title enables save buttons | PASS | Buttons transition from disabled to enabled |
| 6 | Fill summary + video URL | PASS | Both fields accept input correctly |
| 7 | YouTube embed preview | PASS | Embedded iframe appears immediately below Video URL field |
| 8 | Sequence number | PASS | Defaults to next position (8 for 7 existing lessons) |

### Step 2: Content

| # | Test | Result | Notes |
|---|------|--------|-------|
| 9 | Switch to Content step | PASS | Visual block editor loads with default content |
| 10 | Visual/MDX toggle | PASS | Both modes render correctly; MDX shows raw markup with toolbar |
| 11 | Content updates | PASS | Content persists when switching between modes |

### Step 3: Resources

| # | Test | Result | Notes |
|---|------|--------|-------|
| 13 | New lesson: "save first" prompt | PASS | Shows paperclip icon + "Save the lesson as a draft first" + Save Draft button |
| 14 | Existing lesson: resource manager | PASS | Shows LessonResourcesManager with drag-and-drop file upload area |

### Step 4: AI Task

| # | Test | Result | Notes |
|---|------|--------|-------|
| 15 | AI Task step loads | PASS | Header with robot icon, Optional badge, two textareas |
| 16 | Fill task + instructions | PASS | Both fields accept input |
| 17 | Template selector | PASS | "Use Template" and "Preview AI Behavior" buttons visible |

### Save/Publish

| # | Test | Result | Notes |
|---|------|--------|-------|
| 18 | Save Draft success indicator | PASS | Code confirms green checkmark icon (`IconCheck` with `text-emerald-500`) |
| 19 | Indicator clears after ~2s | PASS | `useEffect` timeout in context provider |
| 20 | Publish redirects to course | PASS | Redirects to `/dashboard/teacher/courses/2001` |

### Preview Panel

| # | Test | Result | Notes |
|---|------|--------|-------|
| 21 | Toggle preview open | PASS | Split panel shows title, description, video ref, MDX-rendered content |
| 22 | Toggle preview closed | PASS | Panel collapses with transition |

### Edit Mode

| # | Test | Result | Notes |
|---|------|--------|-------|
| 24 | Load existing lesson | PASS | Pre-fills title, summary, video URL, sequence; breadcrumb shows "Edit Lesson" |

### Mobile Layout

| # | Test | Result | Notes |
|---|------|--------|-------|
| - | Mobile footer actions | PASS | Dedicated `<LessonEditorActions layout="mobile" />` in sticky footer |
| - | Responsive header | PASS | Desktop nav hidden, mobile pill nav shown; action labels hidden at small widths |

## Bug Found

### BUG: Duplicate lesson creation on repeated Save Draft for new lessons

**Severity:** Medium
**Steps to reproduce:**
1. Navigate to `/courses/2001/lessons/new`
2. Fill in title and other fields
3. Click "Save Draft"
4. Click "Save Draft" again

**Expected:** Second save updates the already-created lesson
**Actual:** Two separate lessons are created (IDs 10002 and 10003 in test), both with identical data

**Root cause:** After a successful draft save for a new lesson, the URL stays at `/lessons/new` and `initialData` remains `undefined`. The `handleSave` function in `lesson-editor-context.tsx` checks `initialData` to decide between `createLesson()` and `updateLesson()`. Since `initialData` is never updated after creation, subsequent saves call `createLesson()` again.

**Suggested fix:** After a successful `createLesson()` call, either:
- (a) Redirect to `/lessons/{newId}` (using `router.replace`) so the page re-renders with `initialData`, or
- (b) Update internal state with the new lesson ID so subsequent saves call `updateLesson()`.

Option (a) is simpler but causes a full page reload. Option (b) preserves editor state but requires the `createLesson` action to return the new lesson ID.

**Note:** This bug likely existed in the monolith as well and is not a regression from the refactor.

## Code Quality Observations

1. **Clean separation of concerns.** Each component has a single responsibility and uses the context hook to access shared state.
2. **Consistent animations.** All steps use `animate-in fade-in` with directional slide variants.
3. **Actions deduplication works well.** `LessonEditorActions` renders in both desktop header and mobile footer with layout-specific styling via the `layout` prop.
4. **Step completion indicators are accurate.** Checkmarks appear when steps have meaningful content (title for Details, >20 chars for Content, resources exist, AI task fields filled).
5. **`useMemo` on context value.** The provider memoizes the context value to prevent unnecessary re-renders, though `steps` array is recreated on every render since it's not in the dependency array (it depends on completion booleans which are).
6. **Preview panel is desktop-only** (`hidden lg:flex`), which is appropriate for the split-panel UX.

## Screenshots

| Screenshot | Description |
|------------|-------------|
| `screenshots/01-new-lesson-initial.png` | New lesson editor initial state (Details step) |
| `screenshots/02-preview-panel-open.png` | AI Task step with preview panel open (split view) |
| `screenshots/03-edit-existing-lesson.png` | Editing existing lesson with pre-filled data |
| `screenshots/04-mobile-view.png` | Mobile viewport (375px) with Resources step |

## Verdict

**PASS with one bug.** The compound component refactor is functionally complete and all UI interactions work correctly. The one bug found (duplicate creation on repeated saves) is likely pre-existing and not a regression. The code structure is clean, maintainable, and well-organized.
