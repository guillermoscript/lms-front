# A5-landing — admin landing-page builder chrome (#764 surface 3)

Scope: exactly two files. Everything else named here is a cross-file note, not an edit.

| file | palette | raw | after (planned) | keeps |
|--|--|--|--|--|
| `components/admin/landing-page/template-picker.tsx` | 28 | 0 | 0 / 0 | 0 |
| `components/admin/landing-page/landing-pages-client.tsx` | 3 | 0 | 0 / 0 | 0 |

Counts measured by running the guard's own three regexes over each file (matches the
checked-in `tests/unit/palette-class-baseline.json`: `[28, 0]` and `[3, 0]`).

Both files reach **zero / zero**, so the executor must also drop both entries from
`tests/unit/palette-class-baseline.json` (regenerate with
`UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts`, then
confirm only these two keys disappeared).

No inline `style={{ color / backgroundColor }}`, no hex constants, no chart props, no
`cn()`-assembled colour strings in either file. Grepped for `style={{`, `#rrggbb`,
`rgb(`, `hsl(`, `oklch(` — zero hits outside comments.

---

## 1. `components/admin/landing-page/template-picker.tsx`

Current: **palette 28, raw 0**. All 28 palette classes are in one place — the
`CATEGORY_COLORS` lookup map, lines 41–51. That map is the single highest-leverage edit
in this group; nothing else in the file is palette-coloured.

Context that shapes the recommendation: only **four** category values actually exist in
the data (`lib/puck/templates/index.ts`: `general` ×5, `code-school` ×5, `education` ×2,
`creative` ×1). Five of the nine map keys (`business`, `language-school`, `fitness`,
`music`, `design`) are dead. The hue therefore encodes nothing a reader can learn, and
the badge already prints the category name next to it.

### Rule 1 — `CATEGORY_COLORS` (lines 41–51) + `catColor` (line 216) + the `<Badge>` (line 241)

This is **judgment call A5-landing-1** below. Two executable shapes; do whichever the
orchestrator picks.

**Option A (recommended) — delete the map, let the badge be neutral.**

- Delete the whole `const CATEGORY_COLORS: Record<string, string> = { … }` block
  (lines 41–51).
- Delete `const catColor = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.general`
  (line 216).
- Line 241 becomes:
  ```tsx
  <Badge variant="outline" className="text-xs px-1.5 py-0">
  ```
  `variant="outline"` is already fully tokenised in `components/ui/badge.tsx`
  (`border-border bg-input/20 text-foreground dark:bg-input/30`), so nothing else is
  needed and the label keeps AA on card and on the hover overlay.
- Result: −28 palette, and ~11 lines of dead lookup gone.

**Option B — keep a two-role map, tokenised.** Only if the orchestrator wants
first-party categories visually separated:

```ts
// Category is a label, not a status: the school's brand tints the platform's own
// template families, everything else is neutral.
const CATEGORY_COLORS: Record<string, string> = {
  education: 'bg-brand-tint text-brand-text border-brand-text/20',
  general: 'bg-muted text-foreground border-border',
}
```
and keep line 216's `|| CATEGORY_COLORS.general` fallback so the seven deleted keys
resolve to neutral. Note two corrections that are **mandatory in Option B**:
- the existing `education` entry is `bg-primary/10 text-primary border-primary/20` —
  `text-primary` on a tint is exactly the AA failure the convention forbids for light
  brands, so it must become `text-brand-text` on `bg-brand-tint`;
- the existing `general` entry is `bg-muted/80 text-muted-foreground border-border` —
  `text-muted-foreground` on `bg-muted` measures 4.39:1 and this badge is 10px text, so
  it must become `text-foreground`.

**Option C (not recommended) — `var(--chart-1..5)`.** Theme-aware and invisible to the
guard, but there are 9 keys for 5 tokens and the chart tokens are tuned as fills, not as
AA text on a tint. Mentioned only for completeness.

### Rule 2 — bare `text-primary` on tinted selection states → `text-brand-text`

Not counted by the guard (already a token), but it is the same defect the convention
targets and #770 removed every bare `text-primary` on the learner surface. Two sites,
both the icon of a selected page-type card:

- line 154: `${isSelected ? 'text-primary' : 'text-muted-foreground'}` →
  `${isSelected ? 'text-brand-text' : 'text-muted-foreground'}`
- line 176: `${selectedSlug === 'custom' ? 'text-primary' : 'text-muted-foreground'}` →
  `${selectedSlug === 'custom' ? 'text-brand-text' : 'text-muted-foreground'}`

**Leave the surrounding selection chrome alone**: `border-primary bg-primary/5 ring-1
ring-primary/30` (lines 149 and 171) stays exactly as written. #770 kept `bg-primary/5`
tints and `border-primary/NN` borders and only moved the *text and icons* off
`text-primary`; do the same here so the two surfaces converge. Selection also survives
without colour (`aria-checked`, the ring, and the border), so nothing rests on hue.

### Rule 3 — everything else in this file is already correct; do not touch

For the executor's confidence, these are deliberate non-edits:
- wireframe preview blocks `bg-foreground/[0.06]`, `bg-foreground/[0.04]`,
  `bg-foreground/[0.03]` (lines 230–233) — arbitrary values built from a **token**, not a
  literal colour; the guard does not count them and they follow the theme in both modes.
- `bg-muted/50 border-border/50` (line 229), `bg-card` unselected cards (150, 172),
  `hover:border-foreground/20` (150, 172, 223), `bg-background/80` hover overlay (252),
  `text-muted-foreground` loader (254), `focus-visible:ring-ring` throughout.

### Keeps

**None.** Nothing in this file is content colour, so no keep comments are added and the
file leaves the baseline entirely.

---

## 2. `components/admin/landing-page/landing-pages-client.tsx`

Current: **palette 3, raw 0**. All three are emerald on the "this page is live" signal.
Live/published is a platform state, not a school brand state, so it takes the fixed
`success` token.

### Rule 4 — live dot (line 315)

```tsx
className={`w-2 h-2 rounded-full shrink-0 ${page.is_active ? 'bg-emerald-500' : 'bg-border'}`}
```
→ `bg-success` for the active branch. Leave the inactive branch `bg-border` as it is
(already a token) unless the orchestrator resolves **A5-landing-3** otherwise.
Meaning does not rest on colour: the dot is `aria-hidden="true"` and the active row also
renders the `t('pageCard.live')` text label immediately below (line 321).

### Rule 5 — "Live" label (line 321)

```tsx
<span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
```
→
```tsx
<span className="text-xs font-medium text-success">
```
The `dark:` pair is **deleted**, not translated — `--success` is redefined under dark
mode in `app/globals.css` (light `oklch(0.47 0.12 155)` / dark `oklch(0.78 0.15 158)`),
so the token already carries both modes.

### Rule 6 — everything else here is already tokenised; do not touch

- dynamic-import spinner `border-primary border-t-transparent` (line 32).
- free-limit card and empty state: `bg-muted` + `text-muted-foreground` icon tiles
  (lines 240–241, 265–266) — a small icon on a muted tile, not body text, so the 4.39:1
  note does not bite; the adjacent copy is on `bg-card`.
- row hover `hover:bg-muted/30` (308), external-link affordance
  `text-muted-foreground hover:text-foreground hover:bg-muted` (345).
- delete item `text-destructive focus:text-destructive` (412) and
  `bg-destructive text-destructive-foreground hover:bg-destructive/90` on
  `AlertDialogAction` (448) — correct status usage already.

### Keeps

**None.** Both emerald sites are chrome, both become `success`, the file leaves the
baseline.

---

## Judgment calls (do not decide these while sweeping)

### A5-landing-1 — `template-picker.tsx`, lines 41–51 / 216 / 241
**Question:** the template-category badge is currently colour-coded across nine hues.
Is that hue *content* (a taxonomy the user learns) or *chrome*?
**Options:** (A) delete `CATEGORY_COLORS`, render `<Badge variant="outline">` for every
category; (B) keep a two-role tokenised map — `education` on `bg-brand-tint
text-brand-text border-brand-text/20`, everything else `bg-muted text-foreground
border-border`; (C) map categories onto `var(--chart-1..5)`.
**Recommendation:** **A.** Five of the nine keys are unreachable (no template carries
`business`/`language-school`/`fitness`/`music`/`design`), so the colour system teaches
nothing; the badge text already says `code-school`. Content over chrome, and it is the
mapping a sibling agent would most likely reach for.
**Why it matters:** it is 28 of this group's 31 palette classes, and it decides whether
the template grid shows a school's brand hue at all.

### A5-landing-2 — `landing-pages-client.tsx`, lines 356–361
**Question:** the status badge is `variant={page.status === 'published' ? 'default' :
'secondary'}`. `default` is a solid `bg-primary` fill — the school's brand used for a
platform lifecycle state, right next to a live dot that Rule 4 turns `success`.
**Options:** (i) leave as-is; (ii) published → `variant="outline"` with
`bg-success/10 text-success border-success/30`; (iii) published → `variant="secondary"`
and draft → `variant="outline"`.
**Recommendation:** **(i) leave as-is.** It is already token-only (guard-clean), and
`published` (a content state) and `is_active` (which of several pages is served) are two
different axes — giving them two different colour roles is a feature, not a bug. Worth a
conscious "no" rather than a silent one.
**Why it matters:** if the orchestrator wants *all* lifecycle signals on the fixed status
palette, this is the one site where a brand fill still carries a status meaning.

### A5-landing-3 — `landing-pages-client.tsx`, line 315
**Question:** after `bg-emerald-500 → bg-success`, the ternary reads
`bg-success : bg-border`. Does an off-state dot in `--border` still read as a deliberate
"not live" rather than a rendering artefact, on `bg-card` in both modes?
**Options:** keep `bg-border`; or `bg-muted-foreground/30`; or render no dot at all when
inactive.
**Recommendation:** **keep `bg-border`.** It is already a token, the change is outside
what this sweep is for, and the row's meaning is carried by the "Live" label and the
status badge, not by the dot.
**Why it matters:** only if the orchestrator wants the two dot states to stay legible at
a glance; it is a visual-QA call, not a token call.

---

## Cross-file findings (NOT in this group — report only)

1. `components/ui/dialog.tsx:34` — the dialog overlay is `bg-black/80`
   (baseline `[0, 1]`). `TemplatePicker` renders through it, so the admin builder's
   modal scrim is a raw colour. A scrim is a plausible keep, but it needs the justifying
   comment (worded with no literal utility class in it) and it belongs to whoever owns
   `components/ui/*`.
2. `components/ui/alert-dialog.tsx:33` — identical `bg-black/80` overlay
   (baseline `[0, 1]`); `landing-pages-client.tsx`'s delete confirmation renders through
   it. Same owner, same call.
3. `components/ui/badge.tsx` — checked because Option A leans on it: `outline` is
   `border-border bg-input/20 text-foreground dark:bg-input/30`, fully tokenised. No
   finding; Option A is safe.
4. `components/admin/landing-page/puck-editor.tsx` — dynamically imported by
   `landing-pages-client.tsx`, absent from the baseline (0 / 0). Nothing to do; noted so
   nobody re-checks it.

## Pre-existing defects noticed while reading (do NOT fix in this sweep)

- `template-picker.tsx:242` renders `{template.category}` raw — an untranslated English
  DB value on a screen that is otherwise fully `next-intl` (#726 fixed the template
  names and page types but not this). Same file line 248: `{count} sections` is
  hardcoded English; line 214 `aria-label="Templates"` and line 120
  `aria-label="Back to page type selection"` likewise.
- `landing-pages-client.tsx:297–301` — table headers `Page` / `URL` / `Status` /
  `Updated` are hardcoded English; `timeAgo()` (lines 88–98) emits `just now`, `5m ago`,
  `3d ago`; line 360 prints the raw `{page.status}` enum; lines 140 and 173 build names
  as `` `${templateName} Page` `` and `` `${page.name} (Copy)` ``.
- `template-picker.tsx:41–51` — five unreachable `CATEGORY_COLORS` keys (see A5-landing-1).
- `template-picker.tsx:137` — `role="radio"` buttons sit in a bare `div` grid; the
  `fieldset`/`legend` gives a group name but there is no `role="radiogroup"` on the
  element that owns the radios, and arrow-key roving focus is not implemented.
- `template-picker.tsx:214–221` — `role="listitem"` is put on `<button>` elements inside
  a `role="list"` grid, which overrides the implicit button role for assistive tech even
  though the elements are the primary click targets.
- `landing-pages-client.tsx:306–310` — `<tr onClick=…>` opens the editor with no
  keyboard equivalent on the row (the dropdown's "Edit" item is the only accessible
  path).
