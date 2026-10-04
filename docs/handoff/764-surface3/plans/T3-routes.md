# T3-routes — teacher dashboard routes (#764 surface 3, epic #766)

Survey only. No code was edited. Counts below were measured with the exact
regexes from `tests/unit/palette-class-guard.test.ts` and match
`tests/unit/palette-class-baseline.json` line-for-line.

| file | palette | raw | after sweep |
|--|--|--|--|
| `app/[locale]/dashboard/teacher/revenue/page.tsx` | 52 | 1 | 0 / 0 |
| `app/[locale]/dashboard/teacher/page.tsx` | 32 | 0 | 0 / 0 |
| `app/[locale]/dashboard/teacher/courses/[courseId]/exercises/page.tsx` | 14 | 0 | 0 / 0 |
| `app/[locale]/dashboard/teacher/courses/[courseId]/page.tsx` | 14 | 0 | 0 / 0 |
| `app/[locale]/dashboard/teacher/courses/[courseId]/certificates/page.tsx` | 11 | 0 | 0 / 0 |
| `app/[locale]/dashboard/teacher/courses/page.tsx` | 4 | 0 | 0 / 0 |
| `.../preview/lessons/[lessonId]/preview-lesson-sidebar.tsx` | 1 | 0 | 0 / 0 |
| `app/[locale]/dashboard/teacher/courses/[courseId]/preview/page.tsx` | 0 | 1 | 0 / 0 |
| **total** | **128** | **2** | **0** |

**All eight baseline entries should be deleted outright** — there are no
palette or raw-colour keeps in this group. The only colours that stay are two
`style={{ backgroundColor }}` swatches of a school-chosen certificate colour,
which the guard does not count.

## Precedents this plan follows (do not invent variants)

Every mapping below already exists in a file swept by PR #770, so the sweeping
agent can copy the exact class string rather than re-deriving it:

- soft brand tile + icon → `bg-brand-tint text-brand-text`
  (`app/[locale]/dashboard/student/certificates/page.tsx:53`)
- hover/`group-hover` accent on a row or heading → `group-hover:text-brand-text`,
  `group-hover:bg-brand-tint`
  (`app/[locale]/dashboard/student/courses/[courseId]/page.tsx:281,294`)
- active nav pill → `bg-brand-tint text-brand-text`
  (`components/student/lesson-sidebar.tsx:125`)
- progress-bar fill in a lesson sidebar → `bg-success` on a `bg-muted` track
  (`components/student/lesson-sidebar.tsx:53-56`)
- status badge, soft → `bg-success/10 text-success border-success/30`,
  `bg-warning/10 text-warning border-warning/30`
  (`app/[locale]/dashboard/student/billing/page.tsx:106,111`)
- status badge over an image → `bg-success text-success-foreground hover:bg-success/90`
  (`components/student/browse-course-card.tsx:71`)
- solid status button → `bg-success text-success-foreground hover:bg-success/90`
  (`app/[locale]/dashboard/student/courses/[courseId]/exams/[examId]/exam-taker.tsx:363`)
- warning notice band → `bg-warning/10 border border-warning/30 text-warning`
  (`app/[locale]/dashboard/student/billing/page.tsx:348`)
- ghost button that fills on hover → `text-brand-text group-hover:bg-primary group-hover:text-primary-foreground`
  (`app/[locale]/dashboard/student/courses/[courseId]/page.tsx:321`)

`dark:` twins are deleted everywhere, because every token above already carries
both modes.

---

# 1. `app/[locale]/dashboard/teacher/revenue/page.tsx`

**Counts: palette 52, raw 1.** Biggest file in the group, and the single
highest-leverage edit is the `revenueStats` array at lines 88–131: four object
literals carrying `bg`, `iconColor`, `accent` and (on two) `valueColor`, which
account for 26 of the 52 palette hits. Edit the array, not the JSX.

### Rule 1.1 — `revenueStats` array (L88–131), 26 palette hits → 0

The four hues (blue / emerald / violet / amber) are category decoration on a
stat tile, not status. Collapse all four to one brand tile. See judgment call
**T3-routes-1** before executing.

Per entry, replace the three colour keys with the identical trio:

```
bg:        'bg-blue-50 dark:bg-blue-950/40'                        → 'bg-brand-tint'
iconColor: 'text-blue-600 dark:text-blue-400'                      → 'text-brand-text'
accent:    'group-hover:ring-blue-200 dark:group-hover:ring-blue-800' → 'group-hover:ring-primary/20'
```

…and the same for the `emerald` (L106–111), `violet` (L118–120) and `amber`
(L125–130) entries.

Then **delete the `valueColor` key entirely** from the `yourShare` (L106) and
`pendingPayout` (L125) entries, and delete its consumer at L172
(`${stat.valueColor || ''}` → nothing; the template literal becomes a plain
`className="mt-2 text-2xl font-bold tracking-tight tabular-nums"`). The value is
already the largest, boldest text in the tile; it does not need a second signal,
and neither "your share" nor "pending payout" is a status.

Once all four entries are identical, the three keys are dead weight — the
sweeping agent MAY hoist them into the shared JSX instead of repeating them four
times. Either shape is acceptable; the array form is the smaller diff.

### Rule 1.2 — Stripe-not-connected banner (L143–163), 21 palette + 1 raw → 0

This one IS status: a warning that money cannot reach the school. It keeps its
`IconAlertCircle` and its heading, so meaning never rests on colour.

| where | from | to |
|--|--|--|
| L144 outer band | `bg-amber-50 dark:bg-amber-950/30 … ring-1 ring-amber-200 dark:ring-amber-800` | `bg-warning/10 … ring-1 ring-warning/30` |
| L146 icon tile | `bg-amber-100 dark:bg-amber-900/50` | `bg-warning/15` |
| L147 icon | `text-amber-600 dark:text-amber-400` | `text-warning` |
| L150 heading | `text-amber-900 dark:text-amber-200` | `text-foreground` |
| L151 body | `text-amber-700 dark:text-amber-400` | `text-muted-foreground` |
| L160 CTA anchor | `bg-amber-600 text-white hover:bg-amber-700` | `bg-warning text-warning-foreground hover:bg-warning/90` |

L160 is the file's only `raw` hit (`text-white`). `--warning-foreground` is
`oklch(0.99 0 0)` light / `oklch(0.2 0.02 262)` dark, so the CTA label stays
legible in both modes — which the fixed `text-white` did not guarantee.

Heading goes to `text-foreground` rather than `text-warning`: on a `/10` tint the
warning hue is the accent, and the title is the thing being read.

### Rule 1.3 — revenue-split panels (L196–229), 5 palette → 0

Two panels side by side. They must stay visually distinct after tokenising —
that is judgment call **T3-routes-2**. Recommended shape:

| where | from | to |
|--|--|--|
| L214 "your revenue" panel | `bg-emerald-50/50 dark:bg-emerald-950/20 … ring-1 ring-emerald-100 dark:ring-emerald-900/40` | `bg-brand-tint … ring-1 ring-primary/20` |
| L217 percentage badge | `bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400` | `bg-brand-tint text-brand-text border-primary/20` |
| L219 value | `text-emerald-600 dark:text-emerald-400` | `text-brand-text` |

The left "platform fee" panel keeps `bg-muted/40` — muted vs brand-tint is a
real two-panel contrast on every kit, which muted vs muted would not be.

L217 is `<Badge variant="default">`, whose base is `bg-primary
text-primary-foreground`; the className override wins on both properties, so the
variant can stay as-is.

### Rule 1.4 — accessibility fix while in the file (no guard effect)

L204 `text-2xl font-bold tabular-nums text-muted-foreground` is the platform-fee
figure sitting on `bg-muted/40`. Per the brief, `text-muted-foreground` on
`bg-muted` is 4.39:1 and this text is the point of the panel →
`text-foreground`. Keep the small "PLATFORM FEE" label muted.

### Keeps

None.

### Inline style / hex findings

None in this file. `components/teacher/revenue-chart.tsx`,
`transaction-list.tsx` and `payout-history.tsx` are imported here and are
already clean (absent from the baseline, no hex literals, no chart `fill`/
`stroke` props) — nothing to do and nothing to report.

---

# 2. `app/[locale]/dashboard/teacher/page.tsx`

**Counts: palette 32, raw 0.** Four near-identical stat cards (L155–252) carry 26
of them; the rest are a fake meter, a status badge and a presence dot.

### Rule 2.1 — four stat cards (L162, 172–173 / L185, 195–196 / L208, 218–219 / L231, 245–246), 22 palette → 0

Same collapse as Rule 1.1, applied inline in the JSX (this file has no array).
In each of the four `<Card>` blocks:

```
hover:ring-blue-200 … dark:hover:ring-blue-800   → hover:ring-primary/20
bg-blue-50 dark:bg-blue-950/40                   → bg-brand-tint
text-blue-600 dark:text-blue-400                 → text-brand-text
```

…repeated for `emerald` (L185/195/196), `amber` (L208/218/219) and `violet`
(L231/245/246). The four cards become byte-identical in their colour classes,
which is correct: they are four counts, not four states.

### Rule 2.2 — "quick actions" meter (L237–238), 3 palette → 0

```
L237 track: bg-violet-100 dark:bg-violet-950/60 → bg-muted
L238 fill:  bg-violet-500                        → bg-primary
```

See judgment call **T3-routes-3** — the bar is hardcoded at `w-[65%]` with no
data behind it, so the honest fix may be to delete it.

### Rule 2.3 — course-status badge (L331–334), 4 palette → 0

```
course.status === 'published' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : ''
                              → 'bg-success/10 text-success border-success/30'
```

Leave the `variant={course.status === 'published' ? 'default' : 'outline'}`
ternary alone; the className override wins. The badge already renders the
translated status word, so colour is not the only carrier.

### Rule 2.4 — enrollment presence dot (L390), 1 palette → 0

`bg-emerald-500 border-2 border-background` → `bg-success border-2 border-background`.
Judgment call **T3-routes-4** (it is a colour-only signal with no label).

### Rule 2.5 — `text-primary` convergence (not counted by the guard)

#770's rule was "`text-primary` on a surface becomes `text-brand-text`". Apply to:

- L319 `text-primary/60` (book icon in the thumbnail placeholder) → `text-brand-text/70`
- L323 `group-hover:text-primary` → `group-hover:text-brand-text`
- L383 `text-primary` (avatar initials on `bg-primary/10`) → `text-brand-text`
- L396 `text-primary` (course title inside the activity sentence) → `text-brand-text`
- L422 `text-primary` (chart icon on `bg-primary/10`) → `text-brand-text`

All five are coloured text/icons on a tint or a plain surface, which is exactly
the case `--brand-text` exists for. Leave `bg-primary/10`, `bg-primary/[0.04]`
and `ring-primary/10` as they are — those are fills, already theme-aware.

### Keeps

None.

### Inline style / hex findings

None.

---

# 3. `app/[locale]/dashboard/teacher/courses/[courseId]/exercises/page.tsx`

**Counts: palette 14, raw 0.** Highest-leverage edit is `getExerciseIcon()` at
L71–79 — a four-branch switch whose four branches already return the *same*
colour, so 8 of the 14 hits are one class string written four times.

### Rule 3.1 — `getExerciseIcon()` (L71–79), 8 palette → 0

In all four `return` statements replace
`text-emerald-600 dark:text-emerald-400` with `text-brand-text`. Nothing else in
the function changes. See **T3-routes-8** for whether to collapse the now-identical
switch.

### Rule 3.2 — exercise row card (L140, L143), 3 palette → 0

```
L140 hover:border-emerald-500/50            → hover:border-primary/50
L143 bg-emerald-50 dark:bg-emerald-950/40   → bg-brand-tint
```

`hover:border-primary/50` is what the sibling lesson card on the course page
(`.../[courseId]/page.tsx:351`) already uses, so the two converge.

### Rule 3.3 — checkpoint badge (L178–181), 3 palette → 0

```
border-teal-500/40 text-teal-600 dark:text-teal-400 → border-primary/40 text-brand-text
```

Teal here is the app's own default brand hue leaking into a class name — the one
thing the theme kit is meant to stop. The badge keeps `IconChecklist` and the
lesson name, so nothing rests on colour.

### Rule 3.4 — `text-primary` convergence (not counted)

L147 and L205 `group-hover:text-primary` → `group-hover:text-brand-text`.

### Keeps

None.

### Inline style / hex findings

None.

---

# 4. `app/[locale]/dashboard/teacher/courses/[courseId]/page.tsx`

**Counts: palette 14, raw 0.** Three per-tab category accents — lessons sky,
exercises emerald, exams amber — one per tab, never rendered side by side.

### Rule 4.1 — three tab accents, 14 palette → 0

| tab | where | from | to |
|--|--|--|--|
| lessons | L351 | `hover:border-primary/50` | *(already a token — leave)* |
| lessons | L354 | `bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400` | `bg-brand-tint text-brand-text` |
| exercises | L422 | `hover:border-emerald-500/50` | `hover:border-primary/50` |
| exercises | L425 | `bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400` | `bg-brand-tint text-brand-text` |
| exams | L492 | `hover:border-amber-500/50` | `hover:border-primary/50` |
| exams | L495 | `bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400` | `bg-brand-tint text-brand-text` |

Note the lessons card at L351 *already* uses `hover:border-primary/50` while the
other two use a palette hue — collapsing makes all three rows identical, which
is what they should have been. See **T3-routes-5**.

### Rule 4.2 — `text-primary` convergence (not counted)

L358, L374, L429, L449, L499, L516 — all six are
`group-hover:text-primary` on a row title or its chevron → `group-hover:text-brand-text`.

### Keeps

None (the swatch below is an inline style, not a class).

### Inline style / hex findings

**L596–599** — `style={{ backgroundColor: certificateTemplate.design_settings?.primary_color }}`
on a 16px round swatch. **KEEP.** This is the colour the school picked for its
own certificate, rendered so the school can see what it picked; tokenising it
would show every school the same swatch.

Add above the `<div>`:

```tsx
{/* The colour the school chose for its certificate, shown as itself —
    a swatch of a theme token would preview the wrong design. */}
```

*(Comment contains no utility class name, so the guard cannot bank a false
allowance from it.)*

---

# 5. `app/[locale]/dashboard/teacher/courses/[courseId]/certificates/page.tsx`

**Counts: palette 11, raw 0.** Three stat tiles plus one genuine status word.

### Rule 5.1 — three stat tiles (L123–124, L136–137, L149–150), 8 palette → 0

```
L123 bg-amber-500/10   → bg-brand-tint      L124 text-amber-600 dark:text-amber-400   → text-brand-text
L136 bg-blue-500/10    → bg-brand-tint      L137 text-blue-600 dark:text-blue-400     → text-brand-text
L149 bg-emerald-500/10 → bg-brand-tint      L150 text-emerald-600 dark:text-emerald-400 → text-brand-text
```

Counts issued / active students / template status — three counts, one treatment.

### Rule 5.2 — template-status word (L155), 2 palette → 0

```
<span className="text-emerald-600 dark:text-emerald-400">{t('certificates.stats.active')}</span>
  → <span className="text-success">{t('certificates.stats.active')}</span>
```

Keep the `else` branch's `text-muted-foreground` for "None". This one really is
a status (template configured vs not) and the words "Active"/"None" carry it
independently of colour. See **T3-routes-6**.

### Rule 5.3 — hoist the certificate default design (no guard effect, removes 4 hex literals)

`lib/certificates/default-design.ts` already exports
`DEFAULT_CERTIFICATE_DESIGN = { primary_color: '#3B82F6', secondary_color:
'#1E40AF', show_qr_code: true }` — the canonical platform default, shared by the
editor and the save action. This page re-inlines the same three values.

```tsx
import { DEFAULT_CERTIFICATE_DESIGN } from '@/lib/certificates/default-design'
```

- L181–185: `designSettings={template.design_settings || { primary_color: '#3B82F6', … }}`
  → `designSettings={template.design_settings || DEFAULT_CERTIFICATE_DESIGN}`
- L207: `|| '#3B82F6'` → `|| DEFAULT_CERTIFICATE_DESIGN.primary_color`
- L214: `|| '#1E40AF'` → `|| DEFAULT_CERTIFICATE_DESIGN.secondary_color`

This is optional for the ratchet but removes the hex-literal finding entirely
and stops the page drifting from `hasCustomCertificateDesign()`, which compares
against that same constant.

### Keeps

**L205–208 and L212–215** — the two `style={{ backgroundColor }}` swatches.
**KEEP.** Same reason as §4: they preview a school-owned design.

One comment covers both, placed above the `<div className="flex items-center
gap-3 pt-1">` at L202:

```tsx
{/* Swatches of the two colours the school chose for its certificate,
    shown as themselves — a theme token here would preview a design
    nobody picked. */}
```

### Inline style / hex findings

- L182, L183, L207, L214 — four hex literals, all the same two values, all the
  platform certificate default. Handled by Rule 5.3 (hoist), not by tokenising.

---

# 6. `app/[locale]/dashboard/teacher/courses/page.tsx`

**Counts: palette 4, raw 0.** One badge.

### Rule 6.1 — published badge over the thumbnail (L119–123), 4 palette → 0

```
course.status === 'published'
  ? 'bg-emerald-100/90 text-emerald-700 dark:bg-emerald-950/90 dark:text-emerald-400'
  : 'bg-background/80'
→
course.status === 'published'
  ? 'bg-success text-success-foreground'
  : 'bg-background/80'
```

The badge is absolutely positioned over a course thumbnail, so it needs a fill
that holds up over an arbitrary photo — a `/10` tint would disappear. Solid
`bg-success text-success-foreground` is exactly what
`components/student/browse-course-card.tsx:71` does for the same
badge-over-thumbnail case, so the two surfaces converge. Keep
`backdrop-blur-sm` and the draft branch untouched.

### Rule 6.2 — `text-primary` convergence (not counted)

- L83 `className="text-primary bg-primary/5"` (active grid-view toggle) →
  `className="text-brand-text bg-brand-tint"`
- L115 `text-primary/30` (book icon on the gradient placeholder) → `text-brand-text/40`
- L129 `group-hover:text-primary` → `group-hover:text-brand-text`
- L168 `hover:text-primary` → `hover:text-brand-text` (leave
  `hover:border-primary/40`)

L114's `bg-gradient-to-br from-primary/5 to-primary/15` is already token-built
and is a single-hue ramp, not a decorative multi-hue gradient — leave it.

### Keeps

None.

### Inline style / hex findings

None.

---

# 7. `.../[courseId]/preview/lessons/[lessonId]/preview-lesson-sidebar.tsx`

**Counts: palette 1, raw 0.** This file is a near-copy of
`components/student/lesson-sidebar.tsx`, which #770 already swept — mirror it
exactly.

### Rule 7.1 — progress fill (L50), 1 palette → 0

`bg-emerald-500` → `bg-success`, on the existing `bg-muted` track. Identical to
`components/student/lesson-sidebar.tsx:55`.

### Rule 7.2 — active lesson pill (L71), convergence (not counted)

`'bg-primary/10 text-primary'` → `'bg-brand-tint text-brand-text'`, matching
`components/student/lesson-sidebar.tsx:125`. Leave the L78 number badge
(`bg-primary text-primary-foreground`) — the swept sibling keeps exactly that.

### Keeps

None.

### Inline style / hex findings

`style={{ width: '0%' }}` at L51 is geometry, not colour. No action.

---

# 8. `app/[locale]/dashboard/teacher/courses/[courseId]/preview/page.tsx`

**Counts: palette 0, raw 1.** This page is the teacher-side copy of
`app/[locale]/dashboard/student/courses/[courseId]/page.tsx` (swept in #770) —
copy that file's decisions line for line.

### Rule 8.1 — the one raw hit (L217), 1 raw → 0

```
className="font-bold text-primary group-hover:bg-primary group-hover:text-white"
→ className="font-bold text-brand-text group-hover:bg-primary group-hover:text-primary-foreground"
```

Byte-identical to the swept sibling at
`app/[locale]/dashboard/student/courses/[courseId]/page.tsx:321`. `text-white`
on a hovered primary fill breaks the moment a school picks a light brand;
`--primary-foreground` is derived to stay legible.

### Rule 8.2 — `text-primary` convergence (not counted)

- L127 `text-2xl font-black text-primary` (the 0% figure) → `text-brand-text`
  (sibling L210)
- L188 `group-hover:bg-primary/10 group-hover:text-primary` →
  `group-hover:bg-brand-tint group-hover:text-brand-text` (sibling L281)
- L195 `group-hover:text-primary` → `group-hover:text-brand-text` (sibling L294)
- L222 `text-primary` on the mobile play icon → `text-brand-text` (sibling L329)

Leave L136's `bg-primary` fill and L182's `hover:border-primary/50`.

### Keeps

None.

### Inline style / hex findings

`style={{ width: '0%' }}` at L137 is geometry. No colour literals.

**But see judgment call T3-routes-7:** L136 carries
`shadow-[0_0_10px_rgba(var(--primary),0.5)]`. The guard does not count it (the
arbitrary value does not begin with `#` or a colour function), but it is dead
CSS — `--primary` is an `oklch(…)` value, not an R,G,B triplet, so
`rgba(oklch(0.52 0.105 223.128), 0.5)` is invalid and the glow never renders.

---

# Judgment calls

## T3-routes-1 — revenue stat tiles: four hues → one, or two of them are status?

- **file:** `app/[locale]/dashboard/teacher/revenue/page.tsx`
- **where:** `revenueStats` array, L88–131 (plus its `valueColor` consumer at L172)
- **question:** "Total revenue" is blue, "your share" emerald, "last 30 days"
  violet, "pending payout" amber, and two of them also tint the figure itself.
  Is emerald/amber here *status* (money earned = good, payout pending = waiting),
  or decoration on four equally-weighted counts?
- **options:**
  - (a) All four → `bg-brand-tint` / `text-brand-text` / `group-hover:ring-primary/20`, `valueColor` deleted. One treatment, four counts.
  - (b) Keep a semantic split: "your share" → `text-success` + `bg-success/10` tile, "pending payout" → `text-warning` + `bg-warning/10` tile, the other two → brand.
  - (c) Give each tile a chart token (`bg-[var(--chart-1)]/10` … `--chart-4`) to preserve four distinct hues that still follow the theme.
- **recommendation:** (a). #770 hit the identical pattern on
  `app/[locale]/dashboard/student/progress/page.tsx:151-187` — four stat icons in
  blue/green/purple/amber — and collapsed all four to `text-brand-text`.
  Following that keeps the two surfaces consistent. Neither figure is a state:
  a pending payout is the normal steady state of a school that sells anything,
  and rendering it as a warning cries wolf on every page load.
- **why it matters:** 26 of the file's 52 hits, and (b)/(c) would set a
  different precedent for every other stat row in surface 3.

## T3-routes-2 — revenue split panel: brand tint or success tint?

- **file:** `app/[locale]/dashboard/teacher/revenue/page.tsx`
- **where:** L196–229, the "platform fee" / "your revenue" pair
- **question:** The two panels are deliberately unlike: grey for what the school
  pays, green for what it keeps. After tokenising, do they still read as two
  things?
- **options:**
  - (a) platform fee `bg-muted/40` (unchanged) · your revenue `bg-brand-tint` + `ring-primary/20`, value `text-brand-text`, badge `bg-brand-tint text-brand-text`.
  - (b) your revenue → `bg-success/10` + `border-success/30`, value and badge `text-success`.
  - (c) Both → `bg-muted/40`, distinguish by the badge and the label only.
- **recommendation:** (a). The contrast survives on every kit (muted vs the
  school's own tint), and "your revenue" is a quantity, not an outcome — the
  three status tokens are reserved for states the platform asserts. (c) loses the
  distinction the panel pair exists to make.
- **why it matters:** this is the first tinted-panel pair in the teacher surface;
  whichever way it goes, the admin revenue screens will copy it.

## T3-routes-3 — the fake 65% activity meter

- **file:** `app/[locale]/dashboard/teacher/page.tsx`
- **where:** L233–241, "quick actions" stat card
- **question:** The card renders a progress bar hardcoded at `w-[65%]` with no
  variable behind it and a "platform activity" caption. Do we tokenise a bar
  that means nothing, or delete it?
- **options:**
  - (a) Tokenise only: track `bg-muted`, fill `bg-primary`, leave `w-[65%]`.
  - (b) Delete the bar, keep the card as a plain label + caption.
  - (c) Tokenise now, file a follow-up issue for the fake data.
- **recommendation:** (c). A sweep PR that silently deletes a visible element
  invites "why did the dashboard change?" in review; a sweep PR that leaves a
  documented lie invites nothing. Tokenise, and note the hardcoded 65% in the PR
  body so the orchestrator can open the follow-up.
- **why it matters:** 3 palette hits either way; the question is whether a
  colour sweep is allowed to remove UI.

## T3-routes-4 — presence dot on the enrollment avatar

- **file:** `app/[locale]/dashboard/teacher/page.tsx`
- **where:** L390, `bg-emerald-500 border-2 border-background`
- **question:** A 12px green dot on each recent-enrollment avatar, with no label
  and no tooltip. Is it a status (student is active) or garnish?
- **options:**
  - (a) `bg-success` — treat it as a status dot.
  - (b) `bg-primary` — treat it as brand garnish.
  - (c) Delete it; the activity row already says "X enrolled in Y".
- **recommendation:** (a). It costs one token, and `--success` stays green on
  every kit, so the familiar "online dot" reading survives. It does carry meaning
  by colour alone, but it adds nothing a sighted-only user would miss — the
  sentence next to it is the content.
- **why it matters:** sets whether decorative dots in the teacher surface take a
  status token or a brand one.

## T3-routes-5 — three per-tab category accents collapse to one

- **file:** `app/[locale]/dashboard/teacher/courses/[courseId]/page.tsx`
- **where:** L354 (lessons, sky), L422/425 (exercises, emerald), L492/495 (exams, amber)
- **question:** Lessons, exercises and exams each have their own hue. After the
  sweep all three rows become `bg-brand-tint text-brand-text` — does the page
  lose useful wayfinding?
- **options:**
  - (a) Collapse all three to brand. Each list lives in its own tab, with its own
    heading and its own icon (`IconBook` / `IconTarget` / `IconFileText`), so the
    three are never adjacent.
  - (b) Keep three distinct hues via `--chart-1` / `--chart-3` / `--chart-5`,
    which are theme-aware.
  - (c) Collapse only the two that are already inconsistent (exercises, exams)
    and leave lessons.
- **recommendation:** (a). The tabs are mutually exclusive, the icons already
  differentiate, and the lessons card at L351 has *already* drifted to
  `hover:border-primary/50` while its siblings kept a palette hue — the
  distinction is not being maintained anyway. (b) repurposes chart tokens as UI
  accents, which no swept file does.
- **why it matters:** the same three-way accent appears on the exercises list
  page (§3) and likely on admin course screens; one answer should cover all.

## T3-routes-6 — "template active" in success green

- **file:** `app/[locale]/dashboard/teacher/courses/[courseId]/certificates/page.tsx`
- **where:** L152–158
- **question:** The third stat tile shows the word "Active" or "None". Is a
  configured certificate template a *success state*, or just a fact?
- **options:**
  - (a) `text-success` for Active, `text-muted-foreground` for None.
  - (b) `text-foreground` for Active, `text-muted-foreground` for None — no
    status colour at all.
  - (c) `text-brand-text` for Active.
- **recommendation:** (a). "Configured vs not configured" is the same shape as
  the published/draft badge in §2.3 and §6.1, and both words are readable without
  the colour. (b) is defensible and slightly more conservative.
- **why it matters:** decides whether "a thing is set up" counts as a status
  across the teacher surface.

## T3-routes-7 — the dead glow shadow on the preview progress bar

- **file:** `app/[locale]/dashboard/teacher/courses/[courseId]/preview/page.tsx`
- **where:** L136
- **question:** `shadow-[0_0_10px_rgba(var(--primary),0.5)]` is invalid CSS —
  `--primary` holds an `oklch(…)` value, so the glow has never rendered. The
  swept sibling (`app/[locale]/dashboard/student/courses/[courseId]/page.tsx:219`)
  carries the identical dead class, because #770 did not touch it either. Fix
  here, fix both, or leave?
  **Note this file is mine; the student sibling is not.**
- **options:**
  - (a) Leave both. The guard ignores it and the sibling stays identical.
  - (b) Fix this file only → `shadow-[0_0_10px_color-mix(in_oklch,var(--primary)_50%,transparent)]`, which the guard also ignores (token-built), and the two copies drift.
  - (c) Fix this file and note the sibling for whoever owns it.
  - (d) Drop the shadow class from this file entirely — it has never been seen.
- **recommendation:** (c). It is a one-token change that makes the glow actually
  appear in the school's brand colour, which is the point of the epic; flagging
  the sibling keeps the pair from silently diverging. If the orchestrator wants a
  zero-visual-change sweep, take (a).
- **why it matters:** this is the only place in the group where the sweep would
  change rendered output rather than preserve it.

## T3-routes-8 — collapse `getExerciseIcon()` once its branches are identical

- **file:** `app/[locale]/dashboard/teacher/courses/[courseId]/exercises/page.tsx`
- **where:** L71–79
- **question:** After Rule 3.1 the four `switch` branches differ only by icon
  component, not by colour. Leave the switch, or simplify?
- **options:**
  - (a) Leave the switch exactly as it is; only the class string changes. Smallest diff.
  - (b) Replace with a `Record<string, Icon>` lookup plus one shared className.
- **recommendation:** (a). A colour sweep should be reviewable as a colour sweep;
  restructuring a helper in the same PR makes the diff harder to check and the
  four branches were already the same colour before this change.
- **why it matters:** the brief calls lookup maps returning class strings the
  highest-leverage edits, so the sweeping agent may be tempted to rewrite this
  one — it should not.

---

# Cross-file findings (NOT in my file list — do not edit)

| what | file | in my scope |
|--|--|--|
| Imported by §5; still on the baseline at 14 palette + 1 raw, and it renders the certificate design preview, so its colours and this page's swatches must agree | `components/teacher/certificate-preview.tsx` | no |
| Imported by §8 (`<PreviewBanner>`), 6 palette on the baseline — it is the amber "you are previewing" band that sits above the swept page | `components/teacher/preview-banner.tsx` | no |
| Imported by §5, 6 palette on the baseline | `components/teacher/issue-certificate-button.tsx` | no |
| Imported by §2 (`<OnboardingChecklist>`), 9 palette on the baseline | `components/shared/onboarding-checklist.tsx` | no |
| Carries the same dead `rgba(var(--primary), …)` glow as §8 L136 — swept by #770 and left in place; see T3-routes-7 | `app/[locale]/dashboard/student/courses/[courseId]/page.tsx:219` | no |
| Already clean (not on the baseline, no hex, no chart `fill`/`stroke` props) — no action needed, listed so nobody re-checks | `components/teacher/revenue-chart.tsx`, `transaction-list.tsx`, `payout-history.tsx`, `course-students-table.tsx` | no |
| Owns `DEFAULT_CERTIFICATE_DESIGN`, the constant Rule 5.3 imports. Read-only for this sweep | `lib/certificates/default-design.ts` | no |

# Pre-existing bugs noticed (NOT to be fixed in this sweep)

1. **`app/[locale]/dashboard/teacher/page.tsx:233-241`** — the "quick actions"
   stat card draws a progress bar at a hardcoded `w-[65%]` with no data source,
   captioned "platform activity". Cosmetic, but it reads as a real metric.
   *severity: low.*
2. **`app/[locale]/dashboard/teacher/courses/[courseId]/preview/page.tsx:136`**
   (and its swept sibling `app/[locale]/dashboard/student/courses/[courseId]/page.tsx:219`) —
   `shadow-[0_0_10px_rgba(var(--primary),0.5)]` is invalid CSS; `--primary` is an
   `oklch()` value, so the glow has never rendered. *severity: low.*
3. **`app/[locale]/dashboard/teacher/courses/[courseId]/certificates/page.tsx:292` and `:359`** —
   `t('manageCourse.studentList.unknownStudent')` where `t` is already scoped to
   `dashboard.teacher.manageCourse`, so it resolves
   `dashboard.teacher.manageCourse.manageCourse.…`, which does not exist. Any
   student without a `full_name` renders the raw key instead of "Unknown
   Student". Correct key is `studentList.unknownStudent`. *severity: medium.*
4. **`app/[locale]/dashboard/teacher/courses/[courseId]/preview/page.tsx:37-41`** —
   the preview query filters `.eq('author_id', userId)`, so a tenant admin who
   can open and edit the course (`.../[courseId]/page.tsx:120-127` allows admins
   per #690) gets `notFound()` from the Preview button on that same page. Same
   for `.../exercises/page.tsx:34-42`. Known gap, already tracked with the #690
   follow-ups. *severity: medium.*
