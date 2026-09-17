# T5-builders — teacher exercise / lesson / exam builders

Surface 3 sweep plan for issue #764 (epic #766). Read-only survey; no code was edited.

Counts below are what I measured against the two detectors in
`tests/unit/palette-class-guard.test.ts` and they match
`tests/unit/palette-class-baseline.json` exactly for all 12 files.

## Group totals

| file | palette | raw | keeps planned (recommended) |
|--|--|--|--|
| `components/teacher/exercise-builder/exercise-ai-config-step.tsx` | 13 | 7 | 0 |
| `components/teacher/exercise-builder/exercise-details-step.tsx` | 12 | 0 | 0 |
| `components/teacher/exercise-builder/exercise-audio-config-step.tsx` | 6 | 0 | 0 |
| `components/teacher/exercise-builder/exercise-builder-toolbar.tsx` | 3 | 0 | 0 |
| `components/teacher/lesson-editor/markdown-field.tsx` | 3 | 16 | 0 palette / 13 raw |
| `components/teacher/lesson-editor/lesson-ai-task-step.tsx` | 10 | 0 | 0 |
| `components/teacher/lesson-editor/lesson-editor-header.tsx` | 2 | 0 | 0 |
| `components/teacher/lesson-editor/lesson-editor-actions.tsx` | 1 | 0 | 0 |
| `components/teacher/lesson-editor/generate-questions-dialog.tsx` | 1 | 0 | 0 |
| `components/teacher/lesson-resources-manager.tsx` | 4 | 0 | 0 |
| `components/teacher/exam-builder/exam-question-options.tsx` | 8 | 1 | 0 |
| `components/teacher/exam-builder/exam-question-ai-grading.tsx` | 0 | 6 | 0 |
| **total** | **63** | **30** | **0 / 13** |

## Recurring rules across the whole group (apply everywhere, then read the per-file notes)

These four shapes account for ~50 of the 63 palette hits. Apply them identically
in every file so the group converges with the sibling groups.

- **R-A — "AI" icon tile (violet) → brand.**
  `bg-violet-500/10` → `bg-brand-tint`; `text-violet-600` / `dark:text-violet-400` →
  `text-brand-text` (the `dark:` pair is deleted — `brand-text` already carries both modes).
  Precedent: #770 mapped every indigo/violet AI tile to `bg-brand-tint` + `text-brand-text`
  (e.g. `bg-indigo-500/10 text-indigo-600` → `bg-brand-tint text-brand-text`).
  Never `text-primary` on the tint.
- **R-B — "visible to students" badge (emerald) → success.**
  `border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400` →
  `border-success/30 bg-success/10 text-success`. Opacity goes /5 → /10 to match the
  #771 badge recipe (`border-*/30 bg-*/10 text-*`). The `IconEye` glyph stays, so
  meaning never rests on colour. Delete the `dark:` pair.
- **R-C — step-complete chip (emerald) → success.**
  `bg-emerald-500/15 text-emerald-600` → `bg-success/15 text-success`.
  `IconCheck` already carries the meaning.
- **R-D — save-succeeded tick (emerald) → success.**
  `text-emerald-500` → `text-success`.

Status hues in this group map: emerald/green → `success`, amber/yellow → `warning`,
red/rose → `destructive` (except where a per-file note says otherwise).

---

## 1. `components/teacher/exercise-builder/exercise-ai-config-step.tsx`

**Counts: palette 13, raw 7.** Highest-leverage edit: the fake terminal panel at
lines 85–104 (3 palette + 7 raw = half the file in one block).

1. **L24–25, AI header tile → brand.** Apply **R-A**.
   `bg-violet-500/10` → `bg-brand-tint`, `text-violet-600` → `text-brand-text`. (−2 palette)
2. **L46–52, "visible to students" badge → success.** Apply **R-B**. (−4 palette)
3. **L78–83, "hidden from students" badge → neutral chip.**
   `bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20` →
   `bg-muted text-muted-foreground border-transparent` (keep `variant="secondary"`, keep the
   text label). Rationale: "hidden from students" is not a warning, it is a visibility fact,
   and the sibling `lesson-ai-task-step.tsx` L115–118 already renders the *identical* concept
   (`aiHiddenBadge`) as a neutral `bg-muted text-muted-foreground` chip with `IconEyeOff`.
   Converging on the sibling is the most obvious mapping. Consider also adding
   `IconEyeOff` here so the two badges read the same. See judgment call **T5-builders-2**.
   (−4 palette)
4. **L85–104, drop the fake terminal skin for the system-prompt field.**
   Replace the whole decorative shell (dark surface, macOS traffic lights, filename strip,
   white hairlines) with the plain token-styled mono textarea that
   `lesson-ai-task-step.tsx` L129–135 already uses for the same field:

   - delete the `<div className="overflow-hidden rounded-xl border bg-[#1e1e2e]">` wrapper
     **and** its header row (L86–95: hairline, `bg-white/5`, the three coloured dots, the
     `system_prompt` caption) entirely;
   - the `<Textarea>` keeps its id/value/onChange/placeholder/rows and takes the sibling's
     class string: `border bg-input/20 font-mono text-sm leading-relaxed transition-colors
     placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2
     focus-visible:ring-ring/30 dark:bg-input/30`.

   Rationale: a system prompt is English prose addressed to the model, not code, so the
   code-editor skin here is chrome, not content — and the two builders already disagree
   about how to render the same field. This removes 3 palette (`bg-red-500/60`,
   `bg-yellow-500/60`, `bg-green-500/60`) and all 7 raw
   (`bg-[#1e1e2e]`, `border-white/10`, `bg-white/5`, `text-white/30`, `text-[#cdd6f4]`,
   `caret-[#89b4fa]`, `placeholder:text-white/20`) with no keep comment needed.
   See judgment call **T5-builders-1** — if the orchestrator wants the terminal skin to
   stay, the fallback is to import the `TERMINAL` constant from
   `../lesson-editor/markdown-field` (export it) instead of re-declaring the hexes here,
   and delete only the three traffic-light dots. (−3 palette, −7 raw)

**Result: 0 palette, 0 raw. No keeps.**

## 2. `components/teacher/exercise-builder/exercise-details-step.tsx`

**Counts: palette 12, raw 0.** Highest-leverage edit: the `DIFFICULTY_COLORS` map at
lines 24–28 — it is the *only* source of palette classes in this file (12 of 12).

1. **L24–28, `DIFFICULTY_COLORS` → status tokens, one line each.**
   ```
   easy:   'bg-success/10 text-success border-success/20'
   medium: 'bg-warning/10 text-warning border-warning/20'
   hard:   'bg-destructive/10 text-destructive border-destructive/20'
   ```
   Every `dark:text-*` pair is deleted — the three tokens already carry both modes.
   The buttons keep their translated labels (`difficultyEasy/Medium/Hard`), so the
   three-step heat scale never rests on colour alone. See judgment call
   **T5-builders-3** — difficulty is a heat scale, not literally a status.
   (−12 palette)

Nothing else in this file needs touching: the cards are already `bg-card`, the inputs
`border-muted bg-muted/30`, the unselected chip `bg-muted/40 text-muted-foreground`,
and the next-step band `border-dashed border-muted-foreground/20 bg-muted/20`.

**Result: 0 palette, 0 raw. No keeps.**

## 3. `components/teacher/exercise-builder/exercise-audio-config-step.tsx`

**Counts: palette 6, raw 0.**

1. **L26–27, microphone header tile → brand.** Apply **R-A** with rose in place of violet:
   `bg-rose-500/10` → `bg-brand-tint`, `text-rose-600` → `text-brand-text`.
   This is a decorative section-icon tile, not an error or a recording-live indicator,
   so it is brand, not `destructive`. (−2 palette)
2. **L39–42, "visible to students" badge → success.** Apply **R-B** — byte-identical to
   rule 2 of file 1, so both files end up with the same badge string. (−4 palette)

The rubric toggles (L151–161) are already on `primary` / `muted` tokens — leave them.

**Result: 0 palette, 0 raw. No keeps.**

## 4. `components/teacher/exercise-builder/exercise-builder-toolbar.tsx`

**Counts: palette 3, raw 0.**

1. **L45, step-complete chip → success.** Apply **R-C**:
   `bg-emerald-500/15 text-emerald-600` → `bg-success/15 text-success`. (−2 palette)
2. **L79, save-succeeded tick → success.** Apply **R-D**:
   `text-emerald-500` → `text-success`. (−1 palette)

Identical to rules 1–2 of `lesson-editor-header.tsx` / `lesson-editor-actions.tsx`; the
two step-navs must end up with the same string.

**Result: 0 palette, 0 raw. No keeps.**

## 5. `components/teacher/lesson-editor/markdown-field.tsx`

**Counts: palette 3, raw 16.** Highest-leverage edit: the `TERMINAL` constant at
lines 51–56 plus the `isTerminal` branches that hang off it.

This is the one file in the group where a keep is genuinely defensible, and it already
carries a justification comment (L46–50) written before this epic. The
**dark code-editor shell is the lesson-MDX editor** — the thing being edited really is
code, and #770 kept the same `#1e1e2e` surface for rendered code blocks
(`prose-pre:bg-[#1e1e2e]` in
`app/[locale]/dashboard/student/courses/[courseId]/lessons/[lessonId]/lesson-content.tsx`).
The `-white/N` chrome is not separable from it: the theme tokens flip with the *app*
theme, so `text-muted-foreground` on a fixed-dark panel is a dark grey on near-black in
light mode. The skin is all-or-nothing.

1. **L335–339, delete the three macOS traffic-light dots.** They are pure ornament —
   `bg-red-500/70` / `bg-yellow-500/70` / `bg-green-500/70` on an `aria-hidden` div that
   conveys nothing. Remove the whole `<div aria-hidden="true" className="flex gap-1.5">`
   block and drop the now-redundant `ml-2` from the filename span (L341) so the filename
   sits flush after the gap. "Content over chrome", and it takes the file to 0 palette.
   (−3 palette)
2. **Keep the rest of the terminal skin**, but move every remaining fixed-skin class into
   the `TERMINAL` constant so there is exactly one place to read, and replace the comment
   at L46–50 with the exact text in *Keeps* below. Concretely, add to `TERMINAL`:
   ```
   chromeBg:     'bg-white/5',
   chromeText:   'text-white/40',
   chromeDim:    'text-white/30',
   chromeHover:  'hover:bg-white/10 hover:text-white/80',
   tabActive:    'bg-white/15 text-white/90',
   tabIdle:      'text-white/40 hover:text-white/70',
   placeholder:  'placeholder:text-white/20',
   ```
   and reference them at L222 (mode-switch shell), L239–240 (tab active/idle), L271
   (toolbar buttons), L297 (textarea placeholder), L330 (header bar), L341 (filename),
   L347 (line count). This is a refactor of *placement*, not of colour: the 13 raw
   counts stay, they just all live in one block. Baseline for this file becomes
   `[0, 13]`.
3. **Touch nothing in the `field` (non-terminal) variant** — L222, 242–243, 272, 299,
   309–310, 320, 384, 394, 398 are already tokens (`bg-muted/40`, `bg-background`,
   `text-foreground`, `bg-input/20`, `border-ring`, `ring-ring/30`,
   `text-muted-foreground`). Leave them exactly as they are.

**Keeps (exact comment text to place above the `TERMINAL` constant):**

```ts
/**
 * The code-editor skin for the MDX editor is deliberately theme-independent: what
 * is being edited is code, and the panel reads as a file you are editing rather
 * than as a page surface. The fixed dark surface and the hairlines and labels that
 * sit on it are one skin — the theme tokens flip with the app theme, so a muted
 * token on this panel would be dark grey on near-black in light mode. Content, not
 * chrome; kept in one place so the skin cannot drift.
 */
```

(Deliberately names no utility class, so the guard cannot bank a false allowance.)

**Result: 0 palette, 13 raw — all inside `TERMINAL`, all justified.**
See judgment call **T5-builders-4** for the alternative (promote the skin to
`--editor-*` CSS custom properties in `app/globals.css` and reach it through
`bg-[var(--editor-surface)]`, which would take the file to `[0, 0]`).

## 6. `components/teacher/lesson-editor/lesson-ai-task-step.tsx`

**Counts: palette 10, raw 0.** Highest-leverage edit: the `STATE_STYLES` map at
lines 21–25.

1. **L23, `STATE_STYLES.unsaved` → warning.**
   `bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20` →
   `bg-warning/10 text-warning border-warning/20`. The chip keeps `IconPencil` and its
   translated label, so the three states stay distinguishable without colour.
   `none` (`text-muted-foreground` + dashed border) and `saved` (`bg-muted text-foreground`)
   are already tokens — leave them. (−4 palette)
2. **L51–52, AI header tile → brand.** Apply **R-A**:
   `bg-violet-500/10` → `bg-brand-tint`; `text-violet-600 dark:text-violet-400` →
   `text-brand-text` (delete the `dark:` pair). (−3 palette)
3. **L81, "saving will remove the task" banner → warning.**
   `bg-amber-500/10 ... text-amber-700 dark:text-amber-400` →
   `bg-warning/10 ... text-warning` (delete the `dark:` pair). Keep `IconAlertTriangle`
   and the sentence — the warning never rests on colour. Do **not** add a border; the
   surrounding layout has none and the tint alone matches the #771 inline-notice recipe
   closely enough. (−3 palette)

**Result: 0 palette, 0 raw. No keeps.**

## 7. `components/teacher/lesson-editor/lesson-editor-header.tsx`

**Counts: palette 2, raw 0.**

1. **L74, step-complete chip → success.** Apply **R-C**:
   `bg-emerald-500/15 text-emerald-600` → `bg-success/15 text-success`.
   Must end up byte-identical to rule 1 of `exercise-builder-toolbar.tsx`. (−2 palette)

Everything else in this header is already tokens (`bg-background/95`, `bg-muted/50`,
`bg-primary text-primary-foreground`, `text-muted-foreground`).

**Result: 0 palette, 0 raw. No keeps.**

## 8. `components/teacher/lesson-editor/lesson-editor-actions.tsx`

**Counts: palette 1, raw 0.**

1. **L31, save-succeeded tick → success.** Apply **R-D**:
   `text-emerald-500` → `text-success`. Byte-identical to rule 2 of
   `exercise-builder-toolbar.tsx`. (−1 palette)

**Result: 0 palette, 0 raw. No keeps.**

## 9. `components/teacher/lesson-editor/generate-questions-dialog.tsx`

**Counts: palette 1, raw 0.**

1. **L361, "saved N questions" tick → success.**
   `<IconCircleCheck className="h-5 w-5 text-green-600" />` → `text-success`.
   The sentence next to it carries the meaning. (−1 palette)

The rest of the dialog is already on tokens (`border-destructive/30 bg-destructive/10
text-destructive` for the error, `text-primary` for the sparkles, `text-muted-foreground`
throughout) — leave it.

**Result: 0 palette, 0 raw. No keeps.**

## 10. `components/teacher/lesson-resources-manager.tsx`

**Counts: palette 4, raw 0.** Highest-leverage edit: the `getFileIcon` helper at
lines 52–60 — all 4 hits live there and nowhere else.

1. **L52–60, `getFileIcon` → one neutral icon colour.**
   `text-red-500` (PDF), `text-emerald-500` (spreadsheet), `text-blue-500` (document),
   `text-violet-500` (image) all → `text-muted-foreground`, which is what the fallback
   branch already returns. The distinct **glyphs** (`IconFileTypePdf`,
   `IconFileSpreadsheet`, `IconFileText`, `IconPhoto`) carry the file type; the hues add
   nothing a reader needs and read as four unrelated brand colours next to the school's
   own. Simplest form after the change: keep the four branches (they still pick the
   glyph) and hoist the shared `className="h-5 w-5 text-muted-foreground"`.
   (−4 palette)
   See judgment call **T5-builders-5**.

Everything else is already tokens: `bg-card`, `ring-primary/20`, `border-primary
bg-primary/5` on drag-over, `text-destructive` for the error, `text-primary` for the
spinner.

**Result: 0 palette, 0 raw. No keeps.**

## 11. `components/teacher/exam-builder/exam-question-options.tsx`

**Counts: palette 8, raw 1.** Highest-leverage edit: the three `opt.is_correct`
branches (L37, L59, L75) — all 9 hits.

1. **L37, correct-answer radio button (solid fill) → success.**
   `bg-green-600 border-green-600 text-white` →
   `bg-success border-success text-success-foreground`.
   This is the solid-fill case, so it takes the paired foreground token, not `text-success`.
   The `IconCircleCheck` / `IconCircleX` glyph distinguishes the two states.
   (−2 palette, −1 raw)
2. **L59, correct-answer option input → success tint.**
   `border-green-400 focus-visible:ring-green-400 bg-green-50/30 dark:bg-green-950/30` →
   `border-success focus-visible:ring-success bg-success/10`.
   The `dark:` variant is deleted — `bg-success/10` already reads correctly in both modes.
   (−4 palette)
3. **L75, "CORRECT" label → success.**
   `text-green-600 dark:text-green-400` → `text-success` (delete the `dark:` pair).
   It is a text label, so colour is redundant by construction. (−2 palette)

**Result: 0 palette, 0 raw. No keeps.**

## 12. `components/teacher/exam-builder/exam-question-ai-grading.tsx`

**Counts: palette 0, raw 6.** All six are the same class pair repeated on three inputs.

1. **L32, L44, L59 — input surface inside the tinted AI panel → `bg-background`.**
   `bg-white/80 dark:bg-white/10` → `bg-background` on all three
   (`<Textarea>` ×2, `<Input>` ×1). The intent is "lift the control off the tinted panel";
   `bg-background` does that in both modes, where the current pair renders a translucent
   white wash that is wrong on a dark theme and invisible on a light brand tint.
   (−6 raw)
2. **Optional, same edit — the panel itself.** L19 is
   `bg-primary/5 ... border border-primary/20`. It is already token-based so the guard is
   satisfied, but `bg-brand-tint` + `border-primary/20` is what #770/#771 settled on for a
   tinted brand panel and reads better for light brands. Recommend making the swap for
   consistency; it is not required to hit zero.

**Result: 0 palette, 0 raw. No keeps.**

---

## Inline `style` / hex-constant findings

I grepped all 12 files for `style={{`, `#rrggbb`, `rgb(`/`rgba(`/`hsl(`, and Recharts
`fill=` / `stroke=` props.

- **No inline colour styles anywhere in this group.** The only `style={...}` is
  `lesson-resources-manager.tsx` L81–84, which is dnd-kit's
  `{ transform, transition }` — geometry, no colour.
- **No charts, no `--chart-N` opportunities** in this group.
- **The only hex literals are the code-editor skin**, already covered above:
  `markdown-field.tsx` L52–54 (`#1e1e2e`, `#cdd6f4`, `#89b4fa`) and
  `exercise-ai-config-step.tsx` L85 + L102 (the same three). They are inside Tailwind
  arbitrary values, so the `raw` detector already sees them — no invisible hex debt here.

## Cross-file findings (NOT in my file list — do not edit)

- `components/teacher/improved-template-selector.tsx` — baseline `[8, 6]`. Imported by
  **two** of my files (`exercise-ai-config-step.tsx` L9, `lesson-ai-task-step.tsx` L14) and
  rendered inline in both. It carries its own copies of `bg-[#1e1e2e]` / `text-[#cdd6f4]`
  (L324–325, L340–341) for the template preview panes. Whatever the orchestrator decides
  in **T5-builders-1** about the exercise builder's terminal skin should be applied here
  too, or the same screen will show one dark prose panel and one light one side by side.
- `components/teacher/ai-preview-modal.tsx` — baseline `[8, 0]`. Imported by
  `exercise-ai-config-step.tsx` L10 and `lesson-ai-task-step.tsx` L15. Its 8 palette
  classes render inside my screens.
- `components/teacher/version-history-sheet.tsx` — baseline `[8, 0]`, and
  `components/teacher/version-diff-panel.tsx` — baseline `[31, 7]` (another copy of the
  `#1e1e2e` / `#cdd6f4` code skin, plus a red/green diff palette that is arguably content).
  `version-history-sheet` is imported by `exercise-builder-toolbar.tsx` L7 and
  `lesson-editor-header.tsx` L17.
- `components/teacher/lesson-editor/lesson-content-step.tsx` — not in the baseline (clean),
  but it is the **other** consumer of `MarkdownField` and the one that actually uses
  `variant="terminal"`. Any change to the `TERMINAL` skin lands on that screen; it needs no
  edit of its own.
- `components/teacher/mdx-preview.tsx` and `components/student/task-instructions.tsx` —
  dynamically imported by `markdown-field.tsx` for the Preview tab. Neither is in the
  baseline, so both are clean.
- `components/ui/*` used here (`Badge`, `Button`, `Input`, `Textarea`, `Label`,
  `Separator`, `Checkbox`, `Dialog`, `Select`) are all clean — none appear in the baseline.

## Judgment calls

See the structured output. Summary: **T5-builders-1** the exercise builder's fake terminal,
**T5-builders-2** the "hidden from students" badge hue, **T5-builders-3** difficulty as a
status scale, **T5-builders-4** whether the MDX editor skin becomes CSS custom properties,
**T5-builders-5** file-type icon colours.

## Baseline edits the sweeping agent must make

After the edits, `tests/unit/palette-class-baseline.json` should have **11 of the 12
entries deleted outright**, and `components/teacher/lesson-editor/markdown-field.tsx`
lowered from `[3, 16]` to `[0, 13]` (or deleted too, if **T5-builders-4** goes the CSS
custom-property way). Regenerate rather than hand-edit:
`UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts`.
