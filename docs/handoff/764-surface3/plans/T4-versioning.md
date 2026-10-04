# T4-versioning — teacher versioning, preview and templates

Surface 3 of issue #764 (epic #766). Survey only — no code was changed.

Counts below were measured with the exact regexes in `tests/unit/palette-class-guard.test.ts`
(`PALETTE_CLASS`, `ARBITRARY_COLOR`, `WHITE_BLACK_CLASS`) and agree with
`tests/unit/palette-class-baseline.json` for all six files.

| file | palette | raw | after (recommended) |
|--|--|--|--|
| `components/teacher/version-diff-panel.tsx` | 31 | 7 | 0 / 0 |
| `components/teacher/version-preview.tsx` | 29 | 0 | 0 / 0 |
| `components/teacher/version-history-sheet.tsx` | 8 | 0 | 0 / 0 |
| `components/teacher/ai-preview-modal.tsx` | 8 | 0 | 0 / 0 |
| `components/teacher/preview-banner.tsx` | 6 | 0 | 0 / 0 |
| `components/teacher/improved-template-selector.tsx` | 8 | 6 | 0 / 0 |

The whole group can reach **zero with no keeps**, *if* judgment calls T4-versioning-1 and
T4-versioning-2 resolve to "tokenize". If they resolve to "keep", exact keep-comment text is
given under each file (§ Keeps, only if…).

## Facts the sweeping agent should not re-derive

- `app/globals.css:192-195` applies `* { @apply border-border }`. **A bare `border-b` / `border-r` /
  `border-l` / `border-t` already paints `--border`.** So `border-b border-white/5` becomes just
  `border-b`; do NOT write `border-b border-border`.
- Registered tokens (`@theme inline`, `app/globals.css:6-48`): `success`, `success-foreground`,
  `warning`, `warning-foreground`, `destructive`, `destructive-foreground`, `brand`, `brand-text`,
  `brand-tint`, `chart-1..5`, plus the usual shadcn set. All of `bg-`/`text-`/`border-`/`ring-` work
  on them.
- Merged precedent to copy verbatim for a brand-tinted badge (`components/exercises/code-exercise.tsx`,
  PR #770): `bg-brand-tint text-brand-text border-primary/25`. Never `text-primary` on a tint.
- Merged precedent for a "raw text / source" panel inside this same feature:
  `version-preview.tsx` `ExpandableContent` already renders prompt source as
  `rounded-lg border p-4 … bg-muted/40 font-mono whitespace-pre-wrap`. Two of the files in this
  group render the *same kind of content* on a fixed dark Catppuccin panel instead. Converging them
  on `bg-muted/40` is the most obvious mapping and needs no new token.
- There are **no inline `style={{ color }}` / `backgroundColor` literals, no hex constants in arrays,
  and no chart/Recharts props anywhere in this group.** The only non-className `style=` is
  `version-preview.tsx:143`, a `-webkit-line-clamp` clamp with no colour. Every finding below is a
  className.

---

# 1. `components/teacher/version-diff-panel.tsx`

**Current: palette 31, raw 7.** Highest-leverage edits: the `LineDiff` row renderer (lines 119-158,
three `cn()` ternaries = 12 of the 38), and the two byte-identical legends (lines 403-415 and
457-467, 8 more).

## Rules

1. **Diff counters → status tokens.** `DiffStats`, lines 70 and 74.
   - `text-emerald-600 dark:text-emerald-400` → `text-success`
   - `text-red-600 dark:text-red-400` → `text-destructive`
   - Delete both `dark:` halves; the tokens carry both modes. `IconPlus` / `IconMinus` already
     sit next to the numbers, so meaning never rests on colour.

2. **Diff frame surface → `bg-muted/40`.** Line 96.
   `font-mono text-[12px] leading-[1.6] rounded-lg border bg-[#1e1e2e] overflow-hidden`
   → `font-mono text-[12px] leading-[1.6] rounded-lg border bg-muted/40 overflow-hidden`.
   (Note `text-[12px]` and `leading-[1.6]` are arbitrary *sizes*, not colours — the guard ignores
   them, leave them alone.) **Gated on T4-versioning-1.**

3. **All internal rules/dividers drop their colour.** Lines 123, 132, 134.
   - L123 `'flex border-b border-white/5 last:border-b-0'` → `'flex border-b last:border-b-0'`
   - L132 `border-r border-white/5` → `border-r`
   - L134 `border-l border-white/5` → `border-l`
   Reason: the base layer already paints `--border` on every element (see Facts). Three of the
   seven raw hits die here.

4. **Added / removed row fill.** Lines 125, 127 (the first ternary).
   `bg-emerald-500/10` → `bg-success/10`; `bg-red-500/10` → `bg-destructive/10`;
   `bg-transparent` unchanged.

5. **Change-indicator gutter.** Lines 140, 142, 143 (second ternary) — this column prints the
   literal `+` / `-` / space, so it is the label that carries meaning.
   - `'text-emerald-400 bg-emerald-500/15'` → `'text-success bg-success/15'`
   - `'text-red-400 bg-red-500/15'` → `'text-destructive bg-destructive/15'`
   - `'text-[#585b70]'` → `'text-muted-foreground'`

6. **Line-number gutter.** Line 132: `text-[#585b70]` → `text-muted-foreground`.

7. **Line body.** Lines 151, 153, 154 (third ternary).
   - `'text-emerald-300'` → `'text-success'`
   - `'text-red-300'` → `'text-destructive'`
   - `'text-[#cdd6f4]'` → `'text-foreground'`
   Three states stay visually distinct (green / red / neutral) and each sits on its own matching
   `/10` row tint, so the pairing is token-consistent rather than two greens fighting.

8. **`InlineValueDiff` old/new panels.** Lines 173, 178, 184, 189. Both halves already carry a text
   label (`t('version')` / `t('current')`) and the old value keeps `line-through opacity-70`.
   - L173 dot `bg-red-500` → `bg-destructive`
   - L178 `bg-red-500/5 border-red-500/20` → `bg-destructive/5 border-destructive/20`
   - L184 dot `bg-emerald-500` → `bg-success`
   - L189 `bg-emerald-500/5 border-emerald-500/20` → `bg-success/5 border-success/20`

9. **"Changed" field marker.** Lines 222, 224. Amber here is the third diff state (added / removed /
   *modified*), not a school accent. **Gated on T4-versioning-6.**
   - L222 icon `text-amber-500` → `text-warning`
   - L224 `bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20`
     → `bg-warning/10 text-warning border-warning/30`
     (`/30` is the convention's status-border strength; the `dark:` half is deleted.)
   `t('changed')` text label stays.

10. **Both legends, identically.** Lines 405, 409 (embedded) and 460, 464 (standalone). Each swatch
    already has a text label next to it (`t('removed')` / `t('added')`).
    - `bg-red-500/20 border-red-500/40` → `bg-destructive/20 border-destructive/40`
    - `bg-emerald-500/20 border-emerald-500/40` → `bg-success/20 border-success/40`
    Optional, not required by this sweep: the two legend blocks are byte-identical duplicates;
    extracting one `<DiffLegend/>` would halve this edit. Mention in the PR, don't bundle it.

Already-correct and to be left alone: `bg-muted/50`, `bg-muted/30`, `focus-visible:ring-primary`,
`text-muted-foreground`, `text-muted-foreground/40`, `border border-dashed`.

## Keeps, only if T4-versioning-1 resolves to "keep the editor theme"

Then rules 2, 3, 5 (the `#585b70` half), 6 and 7 are **not** applied — see the all-or-nothing note in
T4-versioning-1 — and the file lands at palette 8 / raw 7 with one comment above `LineDiff`'s frame
(line 95). Exact text, containing no utility class:

```
{/* The diff body is an editor surface: it reuses the fixed editor theme that the
    lesson MDX code blocks and the markdown editor already render, so a version of
    a code lesson reads in the diff exactly as it reads on the page. Editor theme,
    not chrome — it stays fixed under every school theme, and so do the add /
    remove / context colours drawn on top of it. */}
```

---

# 2. `components/teacher/version-preview.tsx`

**Current: palette 29, raw 0.** Highest-leverage edits: the two lookup maps —
`StatusBadge`'s `colors` (lines 35-38, 8 hits) and `ExercisePreview`'s `difficultyColors`
(lines 347-351, 12 hits). Those two objects are 20 of the 29.

## Rules

1. **`colors` map, lines 35-38.**
   - `published:` → `'bg-success/10 text-success border-success/30'`
   - `draft:` → `'bg-warning/10 text-warning border-warning/30'`
   - The `colors[status] || 'bg-muted text-muted-foreground border-border'` fallback is already
     tokens — leave it. (`archived` is `known` but has no map entry, so it keeps taking the muted
     fallback; that is existing behaviour, not a regression.)
   - The badge always prints its own label, so no icon is needed.

2. **`difficultyColors` map, lines 347-351.** **Gated on T4-versioning-3.**
   - `beginner:` → `'bg-success/10 text-success border-success/30'`
   - `intermediate:` → `'bg-warning/10 text-warning border-warning/30'`
   - `advanced:` → `'bg-destructive/10 text-destructive border-destructive/30'`
   - Fallback unchanged. The pill prints the difficulty word, so meaning is not colour-only.

3. **AI-task section icon, line 238.** `text-violet-500` → `text-brand-text`. Violet is the decorative
   "this is the AI part" accent, brand-like, not a status. The heading beside it is already
   `text-muted-foreground` — leave that.

4. **Exam correct-answer option, lines 314 and 320.**
   - L314 `'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium'`
     → `'bg-success/10 text-success font-medium'`
   - L320 `o.is_correct ? 'bg-emerald-500' : 'bg-muted-foreground/30'`
     → `o.is_correct ? 'bg-success' : 'bg-muted-foreground/30'`
   - See T4-versioning-4: after the swap, "correct" is still signalled by colour alone.

5. **Template category badge, line 411.**
   `bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20`
   → `bg-brand-tint text-brand-text border-primary/25`
   (verbatim the merged surface-1 pattern; `capitalize` and the rest of the class list stay).

Already correct and to be left alone: every `bg-muted/…`, `bg-background`, `bg-primary/10
text-primary` on the question-number chip (line 296 — that is a solid-ish numeric chip on a card,
already a token), `focus-visible:ring-ring/30`, `text-destructive`.

---

# 3. `components/teacher/version-history-sheet.tsx`

**Current: palette 8, raw 0.** All eight are the same amber accent in three places. No lookup maps;
two of the three sites are branches of the `isSelected` ternary in the timeline button.

## Rules — all gated on T4-versioning-5 (brand, recommended) vs warning

1. **Dialog header icon chip, lines 191-192.**
   - `bg-amber-500/10` → `bg-brand-tint`
   - `text-amber-600 dark:text-amber-400` → `text-brand-text`

2. **Latest timeline dot, line 312.** Three-way ternary; only the middle branch changes.
   - `'bg-amber-500 ring-amber-500/20'` → `'bg-primary ring-primary/20'`
   - Selected branch `'bg-primary-foreground ring-primary-foreground/30'` and the older branch
     `'bg-muted-foreground/30 ring-muted/50'` stay. The three states still read as
     inverted / brand / muted, and a selected row never shows the brand dot, so brand-on-brand
     cannot happen.

3. **"LATEST" badge, line 329.** Only the unselected branch changes.
   - `'bg-amber-500/10 text-amber-600 dark:text-amber-400'` → `'bg-brand-tint text-brand-text'`
   - Selected branch `'bg-primary-foreground/20 text-primary-foreground'` stays.
   - `t('latest')` label stays, so the badge is not colour-only.

Already correct: `bg-primary text-primary-foreground`, every `bg-muted/…`, `bg-background`,
`focus-visible:ring-primary`, `text-muted-foreground/70`, `text-muted-foreground/30`.

---

# 4. `components/teacher/ai-preview-modal.tsx`

**Current: palette 8, raw 0.** Two clusters in the modal header; the whole rest of the file is
`@/components/ai-elements`, which is already token-clean.

## Rules

1. **Robot icon chip, lines 98-99.**
   - `bg-violet-500/10` → `bg-brand-tint`
   - `text-violet-600 dark:text-violet-400` → `text-brand-text`
   Same mapping as `improved-template-selector.tsx` rule 1 — these two headers are visual twins and
   must stay twins.

2. **"PREVIEW SESSION" pill, lines 106-108.** A "this is not the real thing" mode marker → warning.
   - L106 `bg-amber-500/10 … border-amber-500/20` → `bg-warning/10 … border-warning/30`
   - L107 dot `bg-amber-500` → `bg-warning`
   - L108 `text-amber-600 dark:text-amber-400` → `text-warning`
   The `t('previewSession')` label stays, so the pill is never colour-only.

Already correct: `bg-background`, `bg-muted/10`, `bg-muted/50`, `text-foreground`,
`text-muted-foreground`.

---

# 5. `components/teacher/preview-banner.tsx`

**Current: palette 6, raw 0.** 31-line file; all six hits are the amber band. Gated on
T4-versioning-7.

## Rules

1. **Band, line 16.** `sticky top-0 z-50 border-b bg-amber-50 dark:bg-amber-950/40 px-4 py-2`
   → `sticky top-0 z-50 border-b bg-warning/10 px-4 py-2`.
   This is a full-width band, but the convention's `bg-muted` rule is for *neutral* bands; this one
   carries a state ("you are looking at a preview"), so it takes the status tint.
2. **Label, line 18.** `text-amber-800 dark:text-amber-200` → `text-warning`.
   Use the full token, not `text-warning/80` — it sits on its own `/10` tint and needs the contrast.
   `IconEye` + `t('banner')` already carry the meaning.
3. **Back button, line 23.** `border-amber-300 dark:border-amber-700` → `border-warning/40`.
   Everything else on the `Button` (`variant="outline"`, sizing) stays.

---

# 6. `components/teacher/improved-template-selector.tsx`

**Current: palette 8, raw 6.** Two clusters: the header chip / empty-state check (4), and the two
identical dark preview panels at lines 321-335 and 337-351 (10, five each).

## Rules

1. **Template icon chip, lines 149-150.** Identical to `ai-preview-modal.tsx` rule 1.
   - `bg-violet-500/10` → `bg-brand-tint`
   - `text-violet-600 dark:text-violet-400` → `text-brand-text`

2. **"No variables needed" check, lines 304-305.**
   - `bg-emerald-500/10` → `bg-success/10`
   - `text-emerald-600 dark:text-emerald-400` → `text-success`
   `IconCheck` is inside the circle, so the state is not colour-only.

3. **Both preview panels — surface, lines 324 and 340.** **Gated on T4-versioning-2.**
   `rounded-xl border bg-[#1e1e2e] p-5` → `rounded-xl border bg-muted/40 p-5`.
   `bg-muted/40` is exactly what the sibling `version-preview.tsx` `ExpandableContent` already uses
   for the same "prompt source, monospace" role.

4. **Both preview panels — body text, lines 325 and 341.** Delete `text-[#cdd6f4]` outright; the
   paragraph then inherits `foreground`. Result:
   `text-sm whitespace-pre-wrap font-mono leading-relaxed`.

5. **Both "fill all the variables" hints, lines 329 and 345.**
   - `text-amber-400/70` → `text-warning` (drop the `/70`: at 70% on a light tint it falls under AA)
   - `border-white/5` → drop the colour, leaving `border-t` (base layer paints `--border`)
   Final: `text-xs text-warning mt-4 italic border-t pt-3`. The sentence is its own label.

Already correct: `bg-muted/30`, `bg-muted/50`, `bg-muted/60`, `bg-muted/5`, `bg-background`,
`text-destructive`, `border-destructive`, `hover:border-primary/50`,
`focus-visible:ring-primary`, `group-hover:text-primary`.

## Keeps, only if T4-versioning-2 resolves to "keep the editor theme"

Rules 3 and 4 are then not applied; the file lands at palette 2 / raw 6 and each of the two panels
(above lines 324 and 340) gets this comment, which contains no utility class:

```
{/* The prompt preview shows the template on the same fixed editor surface the
    prompt is authored on, so what is previewed matches what was typed. Editor
    theme, not chrome. */}
```

---

# Judgment calls

See the `judgment_calls` array in the structured output; ids `T4-versioning-1` … `T4-versioning-7`.
The two that change the outcome counts are **1** and **2**.

# Cross-file findings (not mine to edit)

- `components/teacher/lesson-editor/markdown-field.tsx:52` defines `surface: 'bg-[#1e1e2e]'` as a
  named constant, and `components/teacher/exercise-builder/exercise-ai-config-step.tsx:85` uses the
  same literal. Together with my two files they are one visual family; whatever T4-versioning-1/2
  decide must be decided the same way for those two files, or the editor and its preview will stop
  matching. Baselines: `markdown-field.tsx [3,16]`, `exercise-ai-config-step.tsx [13,7]`.
- `app/[locale]/dashboard/student/courses/[courseId]/lessons/[lessonId]/lesson-content.tsx` **kept**
  `#1e1e2e` through the merged surface-1 sweep (baseline `[0,3]`), but there it is the backdrop for a
  syntax highlighter whose token colours are that same theme. Neither of my two panels highlights
  anything — they render plain text — which is the crux of T4-versioning-1/2.
- `components/ui/dialog.tsx:34` and `components/ui/alert-dialog.tsx:33` both use a `black/80` modal
  scrim (baseline `[0,1]` each). Every file in this group renders inside one. A scrim is a justified
  keep; flagging only so nobody counts it against these files.
- `components/ui/badge.tsx` is fully tokenised — the `Badge variant="outline"` / `"secondary"` uses
  in `version-diff-panel.tsx`, `version-preview.tsx`, `version-history-sheet.tsx` and
  `improved-template-selector.tsx` need no help.
- The `@/components/ai-elements` pieces `ai-preview-modal.tsx` imports (`Conversation`, `Message`,
  `PromptInput*`, `Suggestion`) are absent from the baseline, i.e. already clean. The ones that are
  dirty (`commit.tsx`, `terminal.tsx`, `schema-display.tsx`, `test-results.tsx`, `tool.tsx`) are not
  reached from this group.
