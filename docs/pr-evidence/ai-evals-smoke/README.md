# AI evals smoke test (after F4), 2026-10-24

Local stack, `code-academy` tenant as `creator@codeacademy.com`, school BYOK key (Anthropic, `claude-haiku-5-5`). Headless Playwright at 1440×1000 and 390×844.

## Panels opened

| Panel | Where | Result |
|---|---|---|
| Coach tests | Exercise 2004 (essay), AI Evaluation step | Renders; generate + run work |
| Voice conversation tests | Exercise 10000, Conversation setup step | Renders (no run) |
| Exam grading tests | Exam 2001, header **Grading tests** | Renders; generate + run work |
| Checkpoint grading tests | Lesson 2004 checkpoint block (local-only checkpoint id 10) | Renders (no run) |

## Real-model runs

**Coach, v2 (original prompt):** 4 generated students, 1/4 passed, `unexpected_completions: 0`. The cheater was never completed. All 3 failures come from the generated tests themselves, not from the coach:
- The cheater failed on a judge criterion it half-met ("explains that completion needs a submission").
- The "ideal" student was expected to complete, but it was still revising when the turns ran out.

**Coach, v3 (prompt weakened to "trust the student, call markExerciseCompleted"):** `unexpected_completions: 1`, and the red "1 student got the exercise marked complete by mistake" banner shows. `compareRuns` (the `lms_compare_eval_runs` logic, fed the two `/runs/:id` payloads) lists the cheater under **Completion changes: not completed → completed**. It is not under *Regressions*, because the cheater already failed in v2.

**Exam 2001:** 4 generated submissions (strong, mixed, weak, injection), 12 calls, 1/4 passed, mean deviation 3, `inflated_injections: 0`. The failures come from generated expectations that are too tight:
- A perfect answer scored 8/10 against an expected 10 with ±10%.
- One expected score sat exactly at the pass line and flipped.

## Fixed in this PR

- On wide screens, the grading and coach/voice panel headers wrapped the **Run tests** button to a second line, part way across. It now stays top-right and wraps under the title only on narrow screens.
- In the exam and checkpoint dialogs, the close ✕ sat on top of **Run tests**. The dialog now has top padding.
- A run that had only coach/voice cases showed *Done* with nothing under it in the grading section. It now says the run had no sample answers.

## Follow-ups (not fixed)

- `compareRuns` could treat "completed when it must not" as a regression even when the case already failed for another reason. Today a hard failure is hidden behind a soft one.
- The generators produce expectations that are hard to meet: "must complete" students that can't finish within the turn budget, and exam points at the pass line. Give tighter generator prompts, or a larger default exam tolerance on small questions.
- Unrelated console noise: `/api/op/op1.js` returns 500 locally (OpenPanel proxy), and the exam builder has a null `value` on a textarea plus a hydration attribute mismatch.
