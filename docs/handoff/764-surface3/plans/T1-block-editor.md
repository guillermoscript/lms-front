# Surface 3 sweep plan — group `T1-block-editor` (teacher block editor)

Issue #764 surface 3, epic #766. **Survey only — no code was edited.**
All paths are repo-relative to `/Users/guillermomarin/Documents/GitHub/lms-front`.

## Group totals

| file | palette | raw | after sweep (planned) |
|--|--|--|--|
| `components/teacher/block-editor/add-block-menu.tsx` | 92 | 0 | 0 / 0 |
| `components/teacher/block-editor/editors/callout-block.tsx` | 12 | 0 | 0 / 0 |
| `components/teacher/block-editor/editors/code-block.tsx` | 8 | 2 | **8 / 2 (all keeps — see JC-2)** |
| `components/teacher/block-editor/editors/ordering-block.tsx` | 7 | 0 | 0 / 0 |
| `components/teacher/block-editor/editors/quiz-block.tsx` | 6 | 1 | 0 / 0 |
| `components/teacher/block-editor/editors/checkpoint-block.tsx` | 3 | 0 | 0 / 0 |
| `components/teacher/block-editor/editors/fill-in-the-blank-block.tsx` | 3 | 0 | 0 / 0 |
| `components/teacher/block-editor/editors/flashcard-set-block.tsx` | 3 | 0 | 0 / 0 |
| `components/teacher/block-editor/editors/matching-pairs-block.tsx` | 3 | 0 | 0 / 0 |
| `components/teacher/block-editor/editors/vocabulary-block.tsx` | 3 | 0 | 0 / 0 |
| `components/teacher/block-editor/editors/expiring-url-warning.tsx` | 2 | 0 | 0 / 0 |
| **total** | **142** | **3** | **8 / 2** |

Counts measured with the guard's own regexes (`tests/unit/palette-class-guard.test.ts`) and
they match `tests/unit/palette-class-baseline.json` exactly, so no drift to reconcile.

**No inline `style={{ color }}` / `backgroundColor` literals, no hex constants in arrays, no
Recharts props, no chart series anywhere in this group.** The only guard-invisible colour work is
one `bg-primary/10 text-primary` chip (rule F-1 / JC-5). Every colour in the group is a Tailwind
class string.

---

## Precedent this plan follows (do not re-derive)

Surface 1 (PR #770, commit `25f597ca`) already swept the **learner renderers for the very same
blocks**. These editors are the authoring twins of those files, so copy the decisions verbatim:

| learner file (already merged) | decision |
|--|--|
| `components/lesson/callout.tsx` | info → `border-primary/25 bg-brand-tint text-brand-text`; warning → `border-warning/30 bg-warning/10 text-warning`; success/tip → `border-success/30 bg-success/10 text-success`; danger → `border-destructive/30 bg-destructive/10 text-destructive` |
| `components/lesson/quiz.tsx` | correct option marker → `border-success bg-success text-success-foreground`; wrong → `border-destructive bg-destructive text-destructive-foreground` |
| `components/lesson/ordering.tsx` | number pill unchecked → `bg-muted text-muted-foreground`; correct → `bg-success text-success-foreground` |
| `components/lesson/vocabulary.tsx` | brand affordance → `bg-brand-tint text-brand-text` |
| `components/exercises/exercise-result-summary.tsx` | `bg-gradient-to-br from-X-500/[0.06] to-X-500/[0.02]` collapses to a single `bg-<role>/10` fill with `border-<role>/30` |
| `components/lesson/code-block.tsx` | the Shiki `github-dark-default` chrome (`bg-[#0d1117]`, `bg-[#161b22]`, `border-gray-700`, `text-gray-300/400/600`) was **kept**; the file still carries `[9, 2]` in the baseline |

Tokens confirmed registered in `app/globals.css`: `--brand`, `--brand-text`, `--brand-tint`,
`--success`, `--success-foreground`, `--warning`, `--warning-foreground`, `--destructive`,
`--destructive-foreground`, `--chart-1..5`.

---

# 1. `components/teacher/block-editor/add-block-menu.tsx`

**Current: 92 palette, 0 raw. Target: 0 / 0.** This is the single largest file in the whole
baseline. **Highest-leverage edit: the `BLOCK_ICONS` map, lines 38–62** — 23 entries × 4 palette
classes = **all 92 occurrences of the file**. Nothing else in the file is hardcoded; every other
class is already a token (`bg-primary/30`, `bg-background`, `text-muted-foreground`, `hover:bg-accent`,
`border-muted-foreground/20`, `bg-muted/30`, `text-foreground/80`).

### Rule A-1 — `BLOCK_ICONS`: one token pair for all 23 block types (92 → 0)

For **every one of the 23 entries** replace the two colour fields, leaving `icon:` untouched:

```
color: 'text-<hue>-600 dark:text-<hue>-400'   ->  color: 'text-brand-text'
bg:    'bg-<hue>-50 dark:bg-<hue>-950'        ->  bg:    'bg-brand-tint'
```

and for the three neutral-hued entries the same target (`text`/`divider`/`table` currently use
slate / gray / stone — they collapse to the same pair, see JC-1 option C if the orchestrator wants
them neutral instead).

Why: 23 arbitrary hues are pure decoration that no school theme can reach. Each tile already
carries a distinct Tabler glyph **and** a translated text label (`t('blocks.<type>.label')`), and
`sortable-block.tsx` renders the same icon beside the same label — meaning never rested on the hue,
so nothing is lost. `dark:` halves are deleted because both tokens carry light and dark.

### Rule A-2 — do NOT change the shape of `BLOCK_ICONS`

After A-1 every value is identical and the `color`/`bg` fields look redundant. **Leave the
`Record<BlockType, { icon; color; bg }>` type and both fields in place.**
`components/teacher/block-editor/sortable-block.tsx:66` reads `iconData?.bg` and `iconData?.color`
and is **not in this group's file list**; collapsing the type would break a file we may not edit.
See cross-file finding X-1.

### Keeps
None. This file goes to `[0, 0]` and its baseline entry is deleted.

---

# 2. `components/teacher/block-editor/editors/callout-block.tsx`

**Current: 12 palette, 0 raw. Target: 0 / 0.** Highest-leverage edit: the `variants` map,
lines 22–27 — all 12 occurrences live there.

### Rule B-1 — `variants` map → the same four roles `components/lesson/callout.tsx` already ships

| key | `bg` | `border` | `text` |
|--|--|--|--|
| `info` | `bg-blue-500/10` → `bg-brand-tint` | `border-blue-500/30` → `border-primary/25` | `text-blue-600` → `text-brand-text` |
| `warning` | `bg-yellow-500/10` → `bg-warning/10` | `border-yellow-500/30` → `border-warning/30` | `text-yellow-600` → `text-warning` |
| `success` | `bg-green-500/10` → `bg-success/10` | `border-green-500/30` → `border-success/30` | `text-green-600` → `text-success` |
| `error` | `bg-red-500/10` → `bg-destructive/10` | `border-red-500/30` → `border-destructive/30` | `text-destructive` |

Why: this is *the* status case — the four variants are fixed platform meanings, not the school's
brand, except `info` which is the neutral/brand one and takes the brand tint exactly as the learner
renderer does. Each variant keeps its own icon (`IconInfoCircle` / `IconAlertTriangle` /
`IconCircleCheck` / `IconCircleX`) **and** the `<Select>` shows the variant name in words, so meaning
survives without colour.

Leave the container `cn('rounded-lg border p-3', v.bg, v.border)` and the `Textarea`'s
`bg-transparent border-0` untouched — the textarea inherits `foreground`, which is AA on all four
`/10` tints.

### Keeps
None.

---

# 3. `components/teacher/block-editor/editors/code-block.tsx`

**Current: 8 palette, 2 raw. Recommended target: 8 / 2 — every one a justified keep.**
This file is **the one judgment call that changes a baseline number rather than zeroing it** (JC-2).

The whole component is one dark panel that mirrors what the learner sees: the learner renderer
`components/lesson/code-block.tsx` pins Shiki to `theme: 'github-dark-default'` and paints
`bg-[#0d1117]` / `bg-[#161b22]`, and **surface 1 kept that file's `[9, 2]` untouched**. The editor
surface is the same two hex fills plus the toolbar controls that have to stay legible on them.

### Rule C-1 (recommended) — keep all 10, add one keep comment

Add, immediately above the outer `<div>` at line 38:

```tsx
{/* The code surface is content, not chrome: the editor mirrors the fixed Shiki
    github-dark-default panel the learner renderer paints, so the snippet a
    teacher types looks the way it will ship. Its toolbar tints are pinned to
    that dark panel and must not follow the school theme. */}
```

That comment names no utility class, so it cannot bank a false allowance in the guard's text scan.
Leave `components/teacher/block-editor/editors/code-block.tsx: [8, 2]` in the baseline unchanged.

### Rule C-2 — if the orchestrator picks JC-2 option B instead (tokenize)

Then it is **all or nothing**, because a token on a hardcoded dark panel inverts in light mode:

```
bg-[#0d1117]                    -> bg-muted
bg-[#161b22]                    -> bg-card
border-gray-700 / border-gray-600 (x2) -> border   (drop the explicit colour, keep `border-b`)
text-gray-400                   -> text-muted-foreground
text-gray-300 (x3)              -> text-foreground
placeholder:text-gray-500       -> placeholder:text-muted-foreground
```
and the baseline entry for this file is deleted. Do not mix C-1 and C-2.

---

# 4. `components/teacher/block-editor/editors/quiz-block.tsx`

**Current: 6 palette, 1 raw. Target: 0 / 0.**

### Rule D-1 — card wash (line 48), 2 palette
`bg-gradient-to-br from-purple-500/5 to-blue-500/5` → `bg-brand-tint`
(the shared "accent card" rule — see rule set G below, which applies identically to files 4–10).

### Rule D-2 — block-type label row (line 49), 1 palette
`text-purple-600` → `text-brand-text`

### Rule D-3 — correct-answer radio (lines 72–74), 3 palette + 1 raw
```
? 'border-green-500 bg-green-500 text-white'
: 'border-muted-foreground/30 hover:border-green-500/50'
```
→
```
? 'border-success bg-success text-success-foreground'
: 'border-muted-foreground/30 hover:border-success/50'
```
Why: this is a true correct/incorrect status, and it is character-for-character the mapping
`components/lesson/quiz.tsx` already shipped. The selected branch still renders `IconCircleCheck`
inside the dot and the button carries `aria-label={t('quiz.markCorrect', …)}`, so the state is not
colour-only. This also removes the file's single `raw` occurrence.

### Keeps
None.

---

# 5. `components/teacher/block-editor/editors/ordering-block.tsx`

**Current: 7 palette, 0 raw. Target: 0 / 0.**

### Rule E-1 — card wash (line 34), 2 palette
`bg-gradient-to-br from-rose-500/5 to-pink-500/5` → `bg-brand-tint`
Rose here is a **decorative block accent, not `destructive`** — nothing about an ordering block is an
error. See JC-4.

### Rule E-2 — label row (line 35), 1 palette
`text-rose-600` → `text-brand-text`

### Rule E-3 — step-number pill (line 46), 4 palette
`bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200` → `bg-muted text-foreground`
Both `dark:` halves are deleted (the tokens carry both modes). `text-foreground` rather than
`text-muted-foreground`, because `muted-foreground` on `muted` measures only 4.39:1 and this is a
numeral the teacher reads. (The learner twin `components/lesson/ordering.tsx` uses
`bg-muted text-muted-foreground` — noted as cross-file finding X-3, not something to change here.)

### Keeps
None.

---

# 6. `components/teacher/block-editor/editors/checkpoint-block.tsx`

**Current: 3 palette, 0 raw. Target: 0 / 0.**

### Rule F-1 — card wash (line 148), 2 palette
`bg-gradient-to-br from-teal-500/5 to-cyan-500/5` → `bg-brand-tint`

### Rule F-2 — label row (line 149), 1 palette
`text-teal-600` → `text-brand-text`

> Careful: teal/cyan here happens to be the *platform default* brand hue (~223), so on the no-kit
> default this file will look nearly unchanged. That is correct — it is exactly the bug: it looked
> teal for every school that picked something else.

### Optional polish (guard-invisible, not required)
The two inner panels use `rounded-md border bg-background/60` (lines 162, 237). On the no-kit
default `--card` equals `--background`, so on the new `bg-brand-tint` card these read as a
half-transparent wash rather than a raised panel. `bg-card` would be the surface-3 convention for a
bordered raised panel. Apply only if the orchestrator wants it; it changes no count.

### Keeps
None.

---

# 7. `components/teacher/block-editor/editors/fill-in-the-blank-block.tsx`

**Current: 3 palette, 0 raw. Target: 0 / 0.**

### Rule G-1 — card wash (line 35), 2 palette
`bg-gradient-to-br from-teal-500/5 to-cyan-500/5` → `bg-brand-tint`

### Rule G-2 — label row (line 36), 1 palette
`text-teal-600` → `text-brand-text`

### Rule G-3 — segment-type chip (lines 47–52), **guard-invisible but required by the convention**
```
segment.type === 'blank' ? 'bg-primary/10 text-primary font-medium' : 'bg-muted text-muted-foreground'
```
→
```
segment.type === 'blank' ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted text-foreground'
```
Why: `text-primary` on a `primary/10` tint is the exact combination the surface-3 brief forbids (it
fails AA for light brands), and once the card behind it is `bg-brand-tint` the `/10` chip all but
disappears into it. A solid primary chip against a neutral `muted` chip keeps the two segment kinds
plainly distinct on every kit. The chip also renders its own word (see bug B-2), so the distinction
is not colour-only. See JC-5.

`segment.type === 'blank' && 'border-dashed border-primary'` on the `<Input>` (line 61) is already a
token — leave it.

### Keeps
None.

---

# 8. `components/teacher/block-editor/editors/flashcard-set-block.tsx`

**Current: 3 palette, 0 raw. Target: 0 / 0.**

### Rule H-1 — card wash (line 33), 2 palette
`bg-gradient-to-br from-amber-500/5 to-orange-500/5` → `bg-brand-tint`

### Rule H-2 — label row (line 34), 1 palette
`text-amber-600` → `text-brand-text`

Amber here is a **decorative block accent, not `warning`** — a flashcard set is not a caution. See JC-4.

### Keeps
None.

---

# 9. `components/teacher/block-editor/editors/matching-pairs-block.tsx`

**Current: 3 palette, 0 raw. Target: 0 / 0.**

### Rule I-1 — card wash (line 34), 2 palette
`bg-gradient-to-br from-indigo-500/5 to-violet-500/5` → `bg-brand-tint`

### Rule I-2 — label row (line 35), 1 palette
`text-indigo-600` → `text-brand-text`

### Keeps
None. (The learner twin keeps an 8-colour `PAIR_COLORS` array, but that array is *connection
identity* — a content colour — and this editor has no equivalent. Nothing to keep here.)

---

# 10. `components/teacher/block-editor/editors/vocabulary-block.tsx`

**Current: 3 palette, 0 raw. Target: 0 / 0.**

### Rule J-1 — card wash (line 17), 2 palette
`bg-gradient-to-br from-amber-500/5 to-orange-500/5` → `bg-brand-tint`

### Rule J-2 — label row (line 18), 1 palette
`text-amber-600` → `text-brand-text`

Same amber-is-not-warning call as file 8 (JC-4). The learner twin
`components/lesson/vocabulary.tsx` already moved its vocabulary affordance to
`bg-brand-tint text-brand-text`, so this converges.

### Keeps
None.

---

# 11. `components/teacher/block-editor/editors/expiring-url-warning.tsx`

**Current: 2 palette, 0 raw. Target: 0 / 0.**

### Rule K-1 — the warning line (line 20), 2 palette
`text-amber-600 dark:text-amber-500` → `text-warning`

Why: this one **is** a status — a real "this signed URL will expire" caution (#426 QA follow-up) —
so it takes the fixed platform `warning`, and the `dark:` half is deleted because the token carries
both modes. The line keeps `IconAlertTriangle` and its full sentence of copy, so meaning never rests
on the colour.

### Keeps
None.

---

# G. The shared "accent card" rule (applies to files 4, 5, 6, 7, 8, 9, 10)

Seven interactive-block editors share one pattern: a faint two-hue decorative gradient on the
editor card plus a hue-matched block-type label row. The hue differs per block purely for
decoration and is never referenced anywhere else.

```
<div className="space-y-3 rounded-lg border bg-gradient-to-br from-<A>-500/5 to-<B>-500/5 p-4">
  <div className="flex items-center gap-2 text-sm font-medium text-<A>-600">
    <Icon className="h-4 w-4" />
    {t('blocks.<type>.label')}
```
becomes, in every one of the seven:
```
<div className="space-y-3 rounded-lg border bg-brand-tint p-4">
  <div className="flex items-center gap-2 text-sm font-medium text-brand-text">
```
(`space-y-2 … p-3` in `vocabulary-block.tsx` — keep each file's own spacing, change only the colour
utilities.)

Notes for the executing agent:
- Delete `bg-gradient-to-br` itself, not just the stops — a gradient with one stop is dead weight.
- Do **not** reach for `text-primary` on the label: it is text on a tint, which is what
  `brand-text` exists for.
- These cards sit inside `sortable-block.tsx`'s `rounded-xl border bg-card` container, so
  `bg-brand-tint` reads as a tinted panel on card — the intended surface-3 relationship.
- The label row keeps its icon and its translated block name in every file, so collapsing seven
  hues to one costs no information.

---

# Judgment calls for the orchestrator

## `T1-block-editor-1` — `add-block-menu.tsx`, `BLOCK_ICONS` lines 38–62 (92 of the group's 142)
**Question:** the block palette gives each of 23 block types its own hue. Collapsing them to one
token pair makes the picker a grid of 23 identical tinted tiles distinguished only by glyph + label.
Is the per-type hue chrome (sweep it) or a scanning affordance worth preserving in a theme-aware form?

- **A (recommended).** Uniform `color: 'text-brand-text'`, `bg: 'bg-brand-tint'` for all 23.
  92 → 0, one mechanical edit, converges with every sibling group, content-over-chrome.
- **B.** Five colours by `BLOCK_GROUPS` (text / media / interactive / data / structure) using the
  theme-aware chart tokens: `bg-[color-mix(in_oklch,var(--chart-N)_12%,transparent)]` +
  `text-[var(--chart-N)]`. Also 92 → 0 (token-built arbitrary values are not counted). Keeps a
  scanning cue and ties it to the group headings the palette already prints. Costs: restructures the
  map (group → colour instead of type → colour), and `--chart-N` is documented for data series.
- **C.** Uniform brand as in A, except the four structural/neutral types (`text`, `heading`,
  `divider`, `table`) take `bg-muted` / `text-muted-foreground`, roughly preserving today's
  neutral-vs-hued split.

**Recommendation: A.** Obvious over clever, and it is what an independently-surveyed sibling group
would land on. **Why it matters:** 92 of this group's 142 occurrences, and the choice also repaints
`sortable-block.tsx`'s per-block accent strip (X-1).

## `T1-block-editor-2` — `editors/code-block.tsx`, whole component (8 palette + 2 raw)
**Question:** the code editor is a hardcoded GitHub-dark panel (`bg-[#0d1117]`, `bg-[#161b22]`) with
grey toolbar controls sized to it. Is that content (the Shiki syntax theme the learner will see) or
staff chrome that should follow the school theme?

- **A (recommended).** Keep all 10, add the keep comment in rule C-1; baseline entry stays `[8, 2]`.
  Surface 1 made exactly this call for the learner twin `components/lesson/code-block.tsx`, which
  still carries `[9, 2]` — the two files should not disagree about the same panel.
- **B.** Tokenize the whole panel per rule C-2 (`bg-muted` / `bg-card` / `border` /
  `text-foreground` / `text-muted-foreground`); entry deleted, group reaches a true 0 / 0. Costs
  WYSIWYG: the teacher authors on a light panel the learner never sees, and it diverges from the
  merged learner file.
- **C.** Partial — keep the two hex fills, tokenize the toolbar. **Do not pick this:** a light-mode
  `border` / `text-muted-foreground` on a pinned `#161b22` is the worst of both.

**Recommendation: A.** **Why it matters:** it is the only file in the group that does not reach
zero, so the PR description and the baseline diff have to justify it explicitly.

## `T1-block-editor-3` — the seven accent cards (rule set G; 21 of 142)
**Question:** after the sweep all seven interactive-block editors are `bg-brand-tint` +
`text-brand-text`. A teacher scrolling a lesson sees seven identically-tinted cards where seven hues
used to separate them. Brand tint, or a neutral recessed panel?

- **A (recommended).** `bg-brand-tint` + `text-brand-text` — a tinted panel is the brief's own
  mapping for a brand-like hue, and it keeps "this block is interactive" visually distinct from the
  plain `bg-card` text/heading/image editors that carry no wash at all.
- **B.** `bg-muted/30` + `text-foreground` — fully neutral, zero brand weight, but interactive blocks
  then read the same as any other panel and the school's colour never appears in the editor.

**Recommendation: A.** **Why it matters:** seven files must agree, and whichever is chosen is the
pattern other surface-3 groups will copy for their own accent cards.

## `T1-block-editor-4` — amber and rose accents: brand or status?
**Where:** `flashcard-set-block.tsx:33-34` (amber/orange), `vocabulary-block.tsx:17-18`
(amber/orange), `ordering-block.tsx:34-35,46` (rose/pink).
**Question:** the status rule maps amber→`warning` and rose→`destructive` mechanically. Here the hue
is decorative — a flashcard set is not a caution and an ordering block is not an error.

- **A (recommended).** Treat all three as brand accents (rules H, J, E). Status tokens stay reserved
  for real states, so a teacher never sees a flashcard block that looks like a warning.
- **B.** Follow the hue literally: flashcards/vocabulary `warning`, ordering `destructive`.

**Recommendation: A.** **Why it matters:** picking B would put three fixed platform status colours on
blocks that have no state, and would undercut rule K-1's genuine warning in the same surface.

## `T1-block-editor-5` — `fill-in-the-blank-block.tsx:47-52`, the segment-type chip
**Question:** the chip distinguishes a "blank" segment from a "text" segment with
`bg-primary/10 text-primary` vs `bg-muted text-muted-foreground`. The guard does not see it (both are
tokens), but `text-primary` on a primary tint is the AA trap the brief calls out, and once the card
behind it becomes `bg-brand-tint` the two branches nearly merge.

- **A (recommended).** `bg-primary text-primary-foreground` vs `bg-muted text-foreground` — solid
  against neutral, unambiguous on every kit.
- **B.** `bg-card text-brand-text` vs `bg-muted text-muted-foreground` — quieter, keeps both chips as
  tints, but on the no-kit default `--card` equals `--background` so the "blank" chip loses its fill.
- **C.** Leave as-is; it is outside the ratchet.

**Recommendation: A.** **Why it matters:** it is the one place in the group where a ternary's two
branches could stop reading as two states after tokenization, and the brief names this exact
anti-pattern.

---

# Cross-file findings (NOT to be edited by this group)

- **X-1 — `components/teacher/block-editor/sortable-block.tsx`** imports `BLOCK_ICONS`
  (line 22, used line 66) and paints two things with it: the 4px per-block accent strip
  (`cn('absolute left-0 top-3 bottom-3 w-1 rounded-full', iconData?.bg || 'bg-muted')`) and the
  type-label icon (`iconData?.color || 'text-muted-foreground'`). The file is already clean (not in
  the baseline) and its fallbacks are tokens, but after rule A-1 every strip becomes `bg-brand-tint`
  — on the no-kit light default that is `oklch(0.96 0.02 223)` on `bg-card` `oklch(1 0 0)`, i.e.
  almost invisible as a 4px sliver. **Recommend whoever owns `sortable-block.tsx` change the strip
  to `bg-primary/40` (or drop it).** Do not edit it from this group; do not change `BLOCK_ICONS`'
  type (rule A-2) or this file stops compiling.
- **X-2 — `components/lesson/code-block.tsx`** (learner, swept in #770, still `[9, 2]`) is the
  precedent JC-2 option A leans on. If the orchestrator picks option B for the editor, these two
  files disagree about the same panel and the learner file should be revisited in a later surface.
- **X-3 — `components/lesson/ordering.tsx`** uses `bg-muted text-muted-foreground` for its step-number
  pill (4.39:1) where rule E-3 proposes `bg-muted text-foreground` for the editor's. Cosmetic
  divergence only; flagging so the orchestrator can align them if it prefers.
- **X-4 — shared UI primitives are clean.** `components/ui/{popover,select,input,textarea,button,switch,label}`
  — every one used by this group — are absent from the baseline. Nothing to escalate.

# Pre-existing bugs noticed (NOT to be fixed in this sweep)

- **B-1 — `editors/fill-in-the-blank-block.tsx:53`**: `{segment.type === 'blank' ? 'Blanco' : 'Texto'}`
  is hardcoded Spanish in a file that otherwise uses `useTranslations`. An English-locale teacher
  sees Spanish chips. Belongs to the #678/#689 i18n sweep. Severity: low.
- **B-2 — `editors/checkpoint-block.tsx:112-136`**: `handleToggleRequired` / `handleToggleAllowSkip`
  ignore `result.success === false`. The `error` state is only ever written by `handleCreate`, so a
  failed `updateLessonCheckpoint` surfaces nothing at all — the toggle appears to do nothing and the
  teacher has no way to tell a rejected write from a no-op. Severity: medium.
- **B-3 — `editors/checkpoint-block.tsx:209`**: `<Select value="">` is pinned to the empty string
  while `onValueChange` writes elsewhere, so the trigger always shows the placeholder and re-picking
  the same checkpoint id after clearing may not re-fire the handler. Severity: low, not verified in
  a browser.
