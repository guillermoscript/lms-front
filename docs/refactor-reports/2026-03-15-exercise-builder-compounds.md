# Exercise Builder Compound Components -- QA Report

**Date:** 2026-03-15
**Subtask:** 1.4 -- Split exercise-builder monolith into compound components
**Tester:** QA+Report Agent
**Tenant:** Code Academy Pro (`code-academy.lvh.me:3000`)
**Account:** `creator@codeacademy.com` (admin/teacher)

## Summary

The 726-line `exercise-builder.tsx` monolith was successfully split into 7 files under `components/teacher/exercise-builder/`. All tested flows pass with zero console errors and zero TypeScript errors.

## File Structure

| File | Lines | Responsibility |
|------|------:|----------------|
| `index.tsx` | 2 | Barrel export |
| `exercise-builder.tsx` | 50 | Thin orchestrator shell |
| `exercise-builder-context.tsx` | 226 | Context provider, form state, save logic |
| `exercise-builder-toolbar.tsx` | 102 | Step nav tabs + save/publish buttons |
| `exercise-details-step.tsx` | 207 | Title, description, type, difficulty, time, status |
| `exercise-ai-config-step.tsx` | 129 | Instructions, system prompt, template selector |
| `exercise-audio-config-step.tsx` | 174 | Topic prompt, duration, limits, rubric toggles |
| **Total** | **890** | (vs ~726 original -- slight growth from explicit imports/context boilerplate) |

## Test Results

### Navigation & Step Tabs
| # | Test | Result |
|---|------|--------|
| 1 | Navigate to teacher dashboard > course > exercises > create new | PASS |
| 2 | Step tabs appear (Details + AI Evaluation for non-audio types) | PASS |
| 3 | Click through steps -- panels switch correctly | PASS |

### Details Step
| # | Test | Result |
|---|------|--------|
| 4 | Fill title, exercise type selector, difficulty buttons, time limit spinner | PASS |
| 5 | Change type to `audio_evaluation` -- tab changes from "AI Evaluation" to "Recording Setup" | PASS |
| 6 | Change type to `video_evaluation` -- same dynamic step switch | PASS (code review) |
| 7 | Title completion toggles checkmark icon on Details tab | PASS |
| 8 | Save Draft / Publish buttons disabled when title is empty, enabled when filled | PASS |

### AI Config Step
| # | Test | Result |
|---|------|--------|
| 9 | Instructions textarea with "Visible" badge renders | PASS |
| 10 | System prompt in code-editor-style dark panel renders | PASS |
| 11 | "Use Template" and "Preview AI Behavior" buttons present | PASS |

### Audio Config Step
| # | Test | Result |
|---|------|--------|
| 12 | Topic prompt with "Visible" badge renders | PASS |
| 13 | Min/max duration spinners with defaults (30/300) | PASS |
| 14 | Passing score (70) and daily attempts (5) spinners | PASS |
| 15 | 4 rubric toggles (Filler Words, Pace, Structure, Confidence) | PASS |
| 16 | Toggle rubric item off -- visual state updates immediately | PASS |

### Save & Edit Existing
| # | Test | Result |
|---|------|--------|
| 17 | Save as draft -- exercise created successfully, appears in exercise list | PASS |
| 18 | Edit existing exercise (FizzBuzz Challenge) -- all fields pre-populated | PASS |
| 19 | Edit mode shows "History" button (VersionHistorySheet) | PASS |
| 20 | Edit mode breadcrumb shows "Update Exercise" | PASS |
| 21 | AI Config step loads existing instructions and system prompt | PASS |

### State Persistence
| # | Test | Result |
|---|------|--------|
| 22 | Fill title on Details, switch to Audio Config, fill topic, switch back -- title persists | PASS |
| 23 | Change exercise type, switch steps, switch back -- type selection persists | PASS |

### Smoke Checks
| # | Test | Result |
|---|------|--------|
| 24 | Zero console errors across all tested pages | PASS |
| 25 | Zero TypeScript errors (`tsc --noEmit`) | PASS |
| 26 | Dynamic import from page components works (both new and edit pages) | PASS |
| 27 | Old monolith file removed -- no `components/teacher/exercise-builder.tsx` exists | PASS |

## Architecture Review

- **Context pattern:** `ExerciseBuilderContext` with `use()` (React 19) -- clean and correct
- **Provider wrapping:** `ExerciseBuilder` wraps `ExerciseBuilderShell` in provider -- standard compound component pattern
- **Memoization:** `useMemo` on context value with correct dependency array
- **Step logic:** Dynamic step array based on `isAudioType` -- clean conditional rendering
- **Error handling:** Error banner with dismiss button in the shell, errors set via context
- **Save success:** Auto-dismiss after 2s via `useEffect` timer with cleanup

## Issues Found

None. The refactoring is clean and functionally equivalent to the original monolith.

## Cleanup

- Test exercise "QA Test Exercise - Audio" was deleted from the database after verification.
