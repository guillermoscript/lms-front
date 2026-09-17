# T2-grading — teacher grading & student progress (issue #764, surface 3)

Measured with the exact guard regexes from `tests/unit/palette-class-guard.test.ts`
(script in the scratchpad), 2026-09-16 on `refactor/staff-theme-tokens-764` @ f52bcafc.
Every measured count matches `tests/unit/palette-class-baseline.json` — no drift.

| file | palette | raw | target |
|---|---|---|---|
| `components/teacher/submission-review.tsx` | 62 | 2 | **0 / 0** |
| `components/teacher/exam-submissions-review.tsx` | 15 | 0 | **0 / 0** |
| `components/teacher/student-progress-cells.tsx` | 8 | 0 | **0 / 0** |
| `components/teacher/student-progress-sheet.tsx` | 2 | 0 | **0 / 0** |
| `components/teacher/analytics-cells.tsx` | 1 | 0 | **0 / 0** |
| `components/teacher/lesson-funnel.tsx` | 3 | 0 | **0 / 0** |

**No keeps in this group.** Nothing here is content colour — no code theme, no medal, no
user-picked colour, no scrim. All six files end at `[0, 0]`, so after the sweep all six
entries are **deleted** from `palette-class-baseline.json` (the guard omits clean files),
via `UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts`.

## Group-wide conventions (apply everywhere below, do not re-derive)

Taken from what #770 actually shipped on the learner surface, so the staff screens match:

- tinted brand panel / badge → `bg-brand-tint text-brand-text border-primary/25`
  (`border-primary/20` where the original border was faint)
- brand text or icon → `text-brand-text` (never `text-primary` on a tint)
- solid brand button → drop the class and let the Button default (`bg-primary`) apply
- success tint → `bg-success/10 text-success border-success/30`; solid → `bg-success text-success-foreground`
- warning tint → `bg-warning/10 text-warning border-warning/30`; icon/text → `text-warning`
- destructive tint → `bg-destructive/10 text-destructive border-destructive/30`; solid →
  `bg-destructive text-destructive-foreground`
- **delete every `dark:` twin.** `tests/unit/theme-kit-tokens.test.ts` already proves
  `success` / `warning` / `destructive` and `brand-text` clear 4.5:1 on background, card,
  muted and their own tint in **both** modes on **every** kit surface, so a `dark:` pair is
  pure noise after the swap.
- `hover:` twins on non-interactive Badges are dropped, not translated (#770 precedent).
- Both `getStatusBadge()` helpers in this group (submission-review, exam-submissions-review)
  cover the same four statuses. **Map them identically** — same classes, same variant — so the
  list view and the detail view agree.

---

## 1. `components/teacher/submission-review.tsx` — palette 62, raw 2 → 0 / 0

The whole file: blue = "the AI did this", purple = "a human teacher did this",
green/red = right/wrong. Highest-leverage edit is `getStatusBadge` (lines 140–161); the
rest is five repeated panel shapes.

### Rules

1. **`getStatusBadge`, lines 144–155 (12 palette).** Highest leverage — mirrors
   exam-submissions-review's copy exactly.
   - `ai_reviewed`: `bg-blue-100 text-blue-700 hover:bg-blue-100/80 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950/40`
     → `<Badge variant="outline" className="bg-brand-tint text-brand-text border-primary/25">`
   - `teacher_reviewed`: the green equivalent →
     `<Badge variant="outline" className="bg-success/10 text-success border-success/30">`
   - `pending` (outline) and `needs_attention` (`variant="destructive"`, already a token tint
     in `components/ui/badge.tsx`) are untouched.
   - Text labels already carry the meaning; no icon needed here (the list view adds icons).

2. **Header scores, lines 181 & 189 (2 palette).** `text-blue-600` (AI score) /
   `text-green-600` (final score). See judgment call **T2-grading-2** — do not decide alone.
   Default if no decision comes back: `text-brand-text` for the AI score and
   `text-foreground` for the final score.

3. **Question card left border, line 211 — INVISIBLE TO THE GUARD, sweep anyway.**
   `isCorrect ? "border-l-green-500" : "border-l-red-500"` →
   `isCorrect ? "border-l-success" : "border-l-destructive"`.
   The guard's `PREFIX-<hue>-<n>` regex never matches `border-l-green-500` (the side letter
   breaks it), so these two are in neither count, yet they defeat the theme the same way.
   `--color-success` / destructive are registered in `@theme`, so `border-l-success` compiles.
   See judgment call **T2-grading-5** about the ungraded third state.

4. **"Overridden" badge, line 221 (1 palette).** `className="text-xs border-purple-300"` →
   `className="text-xs border-primary/25 bg-brand-tint text-brand-text"` (it already carries
   `IconUser` + a label). Depends on **T2-grading-1**; if the orchestrator picks the neutral
   option for teacher-override, use `className="text-xs"` and let `variant="outline"` stand.

5. **"Needs grading" badge, line 227 (6 palette).**
   `border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-700`
   → `bg-warning/10 text-warning border-warning/30`. Keeps `IconHourglass` + label.

6. **Answer options, lines 258–262 (12 palette).** This is the teacher-side twin of the
   learner exam result that #770 already swept — copy its result verbatim:
   - correct: `bg-green-50 border-green-200 text-green-900 dark:bg-green-950/30 dark:border-green-800 dark:text-green-200`
     → `bg-success/10 border-success/40 text-success`
   - selected-but-wrong: the red equivalent → `bg-destructive/10 border-destructive/40 text-destructive`
   - neither: `bg-muted/30` stays.
   Both coloured states keep a Badge ("Selected" / "Correct"), so meaning never rests on colour.

7. **"Correct" pill, line 266 (2 palette + 1 raw).** `<Badge className="bg-green-600 text-white text-xs">`
   → `<Badge className="bg-success text-success-foreground text-xs">`.

8. **AI feedback panel, lines 296–299 (7 palette).**
   `bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800` →
   `bg-brand-tint border border-primary/25`; `IconRobot` `text-blue-600` → `text-brand-text`;
   heading `text-blue-900 dark:text-blue-300` → `text-brand-text`.
   (#770 did exactly this to the learner feedback block.)

9. **Teacher-override editor, lines 312–315 (7 palette), and the read-only teacher-notes
   panel, lines 378–381 (7 palette).** Same shape, same answer — decided by
   **T2-grading-1**. Recommended (option B): editor and notes become
   `bg-muted/50 border border-border`, `IconPencil` / `IconUser` become
   `text-muted-foreground`, headings become `text-foreground`. They keep their icon and their
   bold label, so they stay a distinct region from the brand-tinted AI panel above them.

10. **Faux status field, line 331 (1 raw).** `bg-white dark:bg-background` → `bg-background`.

11. **Mark-correct / mark-incorrect buttons, lines 343 & 352 (4 palette).**
    - `cn(override?.is_correct && "bg-green-600 hover:bg-green-700")` →
      `cn(override?.is_correct && "bg-success text-success-foreground hover:bg-success/90")`
    - `cn(!override?.is_correct && "bg-red-600 hover:bg-red-700")` →
      `cn(!override?.is_correct && "bg-destructive text-destructive-foreground hover:bg-destructive/90")`
    `cn` is `extendTailwindMerge`, so these beat the `variant="default"` (`bg-primary`) classes.
    Both buttons keep `IconCheck` / `IconX` + label.

12. **"Done" button, line 369 (2 palette).** `className="w-full bg-purple-600 hover:bg-purple-700"`
    → `className="w-full"`. The Button default is already the brand fill; do not restate it.

13. **Final-notice icon, line 425 (1 palette).** `text-amber-500` → `text-warning`.

### Things NOT to touch in this file

`bg-muted/30` band (166), `bg-muted` answer box (278), `border-primary/20` +
`bg-primary/5` + `border-primary/10` + `text-primary` + `shadow-primary/20` on the final
review card (405–431) — all already tokens.

### Inline styles / hex

None. No `style={{ color }}`, no hex constant, no chart.

---

## 2. `components/teacher/exam-submissions-review.tsx` — palette 15 → 0 / 0

### Rules

1. **`getStatusBadge`, lines 80–96 (12 palette). Highest-leverage edit.** Identical mapping to
   submission-review rule 1, and the badges here already pair each tone with an icon:
   - `ai_reviewed` (IconRobot): `variant="secondary"` + blue classes →
     `variant="outline"` + `"flex w-fit items-center gap-1 bg-brand-tint text-brand-text border-primary/25"`
   - `teacher_reviewed` (IconCheck): green classes →
     `variant="outline"` + `"flex w-fit items-center gap-1 bg-success/10 text-success border-success/30"`
   - `pending` / `needs_attention` unchanged.
   Drop the `hover:` twins — these Badges are not links.

2. **Stat-tile icons, lines 129 / 138 / 147 (3 palette).**
   - `text-amber-500` (IconClock, pending) → `text-warning` — see **T2-grading-4**
   - `text-blue-500` (IconRobot, AI reviewed) → `text-brand-text`
   - `text-green-500` (IconCheck, graded) → `text-success`
   The `total` tile's `text-muted-foreground` stays. Each tile has its own title, so the icon
   colour is redundant reinforcement, never the sole signal.

### Inline styles / hex

None.

---

## 3. `components/teacher/student-progress-cells.tsx` — palette 8 → 0 / 0

`STATUS_STYLE` (lines 25–42) is the whole job — one map, consumed by both
`course-students-table.tsx` (already `[0,0]`) and `student-progress-sheet.tsx`.

### Rules

1. **`STATUS_STYLE.active`, line 28 (4 palette).**
   `border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`
   → `border-success/30 bg-success/10 text-success`
2. **`STATUS_STYLE.stalled`, line 32 (4 palette).**
   `border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400`
   → `border-warning/30 bg-warning/10 text-warning`
3. **`STATUS_STYLE.not_started`** (`border-border bg-muted/40 text-muted-foreground`) — unchanged.
4. **`STATUS_STYLE.completed`, line 40 — not counted, still wrong.**
   `border-primary/30 bg-primary/10 text-primary` is `text-primary` on a tint, which the
   convention forbids (fails AA for light brands) → `border-primary/30 bg-brand-tint text-brand-text`.
5. **`CountCell`, line 120 — `text-primary` → `text-brand-text`** (plain text on the page
   background; `brand-text` is the AA-proven shade). Gated on **T2-grading-3**.
6. Untouched: `ProgressCell`'s `bg-muted` track and `bg-primary` / `bg-primary/70` fills
   (fills, not text — `primary` is correct there).

### Must not break

- Keep `data-status={status}` on the Badge — `tests/playwright/teacher-content.spec.ts:133-139`
  selects on it.
- Keep the file header comment's promise ("every status badge pairs its tone with an icon and a
  text label") true; the icons are untouched, so it stays true. Consider appending one clause:
  the tones are now the platform status tokens, so a tenant brand can never recolour a status.

### Inline styles / hex

`style={{ width }}` on the meter fill (line 107) — geometry, not colour. Leave it.

---

## 4. `components/teacher/student-progress-sheet.tsx` — palette 2 → 0 / 0

### Rules

1. **Exam verdict tone, line 254 (2 palette).** `tone = 'text-amber-700 dark:text-amber-400'`
   (ungraded) → `tone = 'text-warning'`. The verdict string itself says "ungraded", and the
   row keeps `IconCircle`, so colour is not load-bearing.
2. **`text-primary` sweep (not counted; gated on T2-grading-3).** Lines 187, 223, 265
   (`IconCheck` completion ticks) and line 257 (`tone = 'text-primary'` for a passed exam) →
   `text-brand-text`. Leave line 141's `border-primary/30 bg-primary/5` band (a fill, and the
   `text-muted-foreground`/`foreground` text on it is unchanged).
3. `text-destructive`, `text-muted-foreground/50` and the rest are already tokens.

### Inline styles / hex

None.

---

## 5. `components/teacher/analytics-cells.tsx` — palette 1 → 0 / 0

### Rules

1. **`SeverityBar` middle band, line 46 (1 palette).** `'bg-amber-500'` → `'bg-warning'`.
   The high band is already `bg-destructive` and the low band `bg-muted-foreground/60`, so the
   three-step scale ends up entirely on fixed platform tokens.
2. **Rewrite the comment above it (lines 41–43).** It currently reads "Amber is spelled out
   rather than themed: severity is a fixed diagnostic scale, and mapping its middle band onto
   the tenant's brand colour would make 'moderately hard' look different in every school." That
   reasoning is still right but the mechanism changed — the warning token *is* the fixed
   platform colour, not the school's. Replace with:

   ```
   // The middle band uses the platform warning token, not the school's brand: severity is a
   // fixed diagnostic scale, so "moderately hard" must look the same in every school. The
   // number above the bar is the real signal; the bar only reinforces it.
   ```
   (Deliberately contains no utility-class literal, so it can never bank a guard allowance.)
3. `HotspotScopeBadge` and `DifficultyDelta` are already token-only — do not touch.

### Inline styles / hex

`style={{ width: value% }}` (line 60) — geometry. Leave it.

---

## 6. `components/teacher/lesson-funnel.tsx` — palette 3 → 0 / 0

### Rules

1. **Sharp-drop bar, line 66 (1 palette).** `sharp ? 'bg-amber-500' : 'bg-primary/70'`
   → `sharp ? 'bg-warning' : 'bg-primary/70'`. The normal bar stays on `primary` (a fill, so
   the school's colour is right there), the alarm bar stays on the fixed platform warning.
2. **Drop label, line 74 (2 palette).**
   `sharp ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-muted-foreground'`
   → `sharp ? 'font-semibold text-warning' : 'text-muted-foreground'`.
   The `−N` number and the weight already carry the signal; colour only reinforces.
3. The `bg-muted` meter track stays.

### Inline styles / hex

`style={{ width: pct% }}` (line 67) — geometry. Leave it.

---

## After the sweep

1. `npx vitest run tests/unit/palette-class-guard.test.ts` will fail on the *stale-baseline*
   assertion (that is the ratchet working). Re-record with
   `UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts`
   and confirm all six files disappeared from the JSON.
2. Visual check worth doing in both modes: the submission-review question card (three tinted
   states stacked — AI panel, options, override panel) is the only place in this group where
   two tints touch. #770 hit exactly this and had to put `bg-card` back under the option tints;
   watch for the same muddying here.
