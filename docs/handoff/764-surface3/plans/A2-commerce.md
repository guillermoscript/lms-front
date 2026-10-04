# A2-commerce — admin commerce routes (issue #764, surface 3, epic #766)

Measured with the exact regexes from `tests/unit/palette-class-guard.test.ts`, 2026-09-16 on
`refactor/staff-theme-tokens-764` @ `f52bcafc`. **Every measured count matches
`tests/unit/palette-class-baseline.json` — no drift.**

| file | palette | raw | target |
|---|---|---|---|
| `app/[locale]/dashboard/admin/products/page.tsx` | 24 | 0 | **0 / 0** |
| `app/[locale]/dashboard/admin/subscriptions/page.tsx` | 20 | 0 | **0 / 0** |
| `app/[locale]/dashboard/admin/enrollments/page.tsx` | 16 | 0 | **0 / 0** |
| `app/[locale]/dashboard/admin/plans/page.tsx` | 12 | 0 | **0 / 0** |
| `app/[locale]/dashboard/admin/courses/page.tsx` | 12 | 0 | **0 / 0** |
| `app/[locale]/dashboard/admin/categories/page.tsx` | 1 | 0 | **0 / 0** |
| `components/admin/course-status-actions.tsx` | 2 | 0 | **0 / 0** |

**No keeps in this group.** Nothing here is content colour — no code-editor theme, no medal or
podium, no confetti, no user-picked colour being previewed, no scrim over an uploaded image, no
QR quiet zone. All seven files end at `[0, 0]`, so all seven entries are **deleted** from
`palette-class-baseline.json` (the guard omits clean files):
`UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts`.

**No inline `style={{ color }}` / `backgroundColor`, no hex constants, no chart props, no
provider-brand colour arrays anywhere in this group.** I grepped all seven files for `style=`,
`#rrggbb`, `rgb(`, `hsl(`, `oklch(`, `Color`, `colors` — the only hits are the Tailwind class
strings listed below. Nothing in this group is invisible to the guard, except the two
non-guard-counted contrast defects noted at the very end (which are *not* part of this sweep).

---

## Group-wide conventions (apply everywhere below; do not re-derive)

Taken from what #770/#771 actually shipped, and from `app/globals.css` (which registers
`--color-brand-text`, `--color-brand-tint`, `--color-success(-foreground)`,
`--color-warning(-foreground)`, `--color-destructive(-foreground)` in `@theme inline`, with
light and `.dark` values for every one):

- brand tint panel → `bg-brand-tint`, bordered/ringed with `primary/25`
  (`ring-primary/25` is the established pairing — see `app/[locale]/join-school/page.tsx:142`).
- brand text or icon → `text-brand-text`. **Never `text-primary` on a tint.**
- success tint → `bg-success/10 text-success` (+ `border-success/30` when a border exists);
  solid → `bg-success text-success-foreground`.
- warning tint → `bg-warning/10 text-warning`. destructive tint → `bg-destructive/10 text-destructive`.
- **Delete every `dark:` twin.** `tests/unit/theme-kit-tokens.test.ts` already proves
  `success` / `warning` / `destructive` and `brand-text` clear 4.5:1 on background, card, muted
  and their own tint in **both** modes on **every** kit surface, so a `dark:` pair is pure noise
  after the swap. Every single `dark:` class in this group is one of these twins — there are no
  `dark:`-only rules to preserve.
- **Icon tiles: colour the wrapper, not the icon.** `@tabler/icons-react` renders
  `stroke="currentColor"`, so `text-<token>` on the wrapper `<div>` reaches the icon. Put the
  text token on the wrapper and **delete the icon's own colour class entirely** — this is the
  #770 precedent (`app/[locale]/dashboard/student/certificates/page.tsx:79-97`) and it halves
  the edit surface.
- `Badge` uses `cn()` (tailwind-merge), so a `className` override reliably beats the variant's
  `bg-*` / `text-*` / `border-*`. Keeping the existing `variant={…}` ternary and swapping only
  the class string is safe; see rule sets below.
- `components/ui/badge.tsx` has **no `success` variant** (only default / secondary / destructive
  / outline / ghost / link). Everything below therefore uses an explicit class override. See
  cross-file finding **CF-1**.

---

## The two patterns that account for 84 of the 87 occurrences

Read these once; the per-file sections below just point at them.

### Pattern **TILE** — the stat-card icon tile (66 palette across 5 files)

```tsx
<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-<hue>-50 dark:bg-<hue>-950/40">
  <IconX className="h-[18px] w-[18px] text-<hue>-600 dark:text-<hue>-400" strokeWidth={1.75} />
</div>
```

becomes, in every instance:

```tsx
<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg <TILE-TOKENS>">
  <IconX className="h-[18px] w-[18px]" strokeWidth={1.75} />
</div>
```

`<TILE-TOKENS>` is decided by **judgment call A2-commerce-1**. Geometry, `strokeWidth`, sizes
and structure are untouched; only the two colour class-runs change and the icon's colour class
is deleted.

### Pattern **ACTIVEBADGE** — the "active" badge override (12 palette across 3 files)

The exact same string appears in `products` (L172), `subscriptions` (L299) and `enrollments`
(L202):

```tsx
className={`text-[10px] ${<isActive> ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : ''}`}
```

becomes (subject to **judgment call A2-commerce-3**):

```tsx
className={`text-[10px] ${<isActive> ? 'bg-success/10 text-success border-success/30' : ''}`}
```

**Map all three identically** — products, subscriptions and enrollments must agree, since an
admin sees "Active" in all three screens in one session. Leave the surrounding
`variant={…}` ternary exactly as it is: tailwind-merge drops the variant's `bg-primary`,
`text-primary-foreground` and `border-transparent` in favour of the override, and the variant
still supplies the focus ring. The ternary keeps reading as two distinct states in both
branches after tokenising (active = green tint chip; the other branch = `secondary` grey, or
`destructive` red on subscriptions). Every one of these badges renders a **text label**
(`t('stats.active')`, `t('status.<state>')`, `t('card.status.<state>')`), so meaning never rests
on colour alone.

---

## 1. `app/[locale]/dashboard/admin/products/page.tsx` — palette 24, raw 0 → 0 / 0

Three distinct shapes: the Stripe-Connect nudge banner, a three-tile stat row, and one
ACTIVEBADGE. Highest-leverage edit: the nudge banner at lines 97–99 (8 of the 24).

### Rules

1. **Connect nudge banner, line 97 (4 palette).**
   `rounded-xl bg-blue-50 p-4 ring-1 ring-blue-200 dark:bg-blue-950/30 dark:ring-blue-800`
   → `rounded-xl bg-brand-tint p-4 ring-1 ring-primary/25`.
   *Why brand, not warning:* the comment directly above it says "Non-blocking Connect nudge —
   manual selling works without it (#438)". It is informational, not an alarm; an OFF rail must
   never alarm. Blue → brand under the mapping convention.

2. **Nudge icon, line 98 (2 palette).** `text-blue-600 dark:text-blue-400` → `text-brand-text`.
   (Wrapper is the banner itself, which is not an icon tile, so the token goes on the icon here
   — this is the one place in the group where the icon keeps a colour class.)

3. **Nudge body text, line 99 (2 palette).** `text-sm text-blue-900 dark:text-blue-200`
   → `text-sm text-foreground`.
   *Why `text-foreground` and not `text-brand-text`:* this sentence is the whole point of the
   panel, so it takes the highest-contrast option. `text-brand-text` is the #770 precedent and
   is also AA on `brand-tint` by construction (`app/globals.css:116-120`) — either is
   defensible; `text-foreground` is the safer default. The nested `<Link>` (line 101-106) has no
   colour class and inherits — leave it exactly as is, it stays distinguishable by its
   `underline underline-offset-2`.

4. **Stat tiles — 3 × TILE, 12 palette.** Apply Pattern TILE at:
   - lines 120–121, `IconShoppingCart`, label `stats.total` — hue **blue**
   - lines 134–135, `IconShoppingCart`, label `stats.active` — hue **emerald**
   - lines 148–149, `IconArchive`, label `stats.archived` — hue **amber**

   Under the recommended option (a) of **A2-commerce-1**: total → `bg-brand-tint text-brand-text`,
   active → `bg-success/10 text-success`, archived → `bg-warning/10 text-warning`.

5. **ACTIVEBADGE, line 172 (4 palette).** Apply Pattern ACTIVEBADGE with `isActive` as the
   condition. Leave `variant={isActive ? 'default' : 'secondary'}` untouched.

*Untouched and correct already:* `bg-background` (66), `bg-card` (68), `bg-muted` (252),
`text-muted-foreground` throughout, `bg-primary/10 text-primary` — none appear here except via
shared components.

---

## 2. `app/[locale]/dashboard/admin/subscriptions/page.tsx` — palette 20, raw 0 → 0 / 0

**Highest-leverage edit: the `stats` array, lines 129–158** — a lookup table of class strings,
16 of the 20 occurrences, feeding one rendering site (lines 190–191).

### Rules

1. **`stats` array, lines 129–158 (16 palette). Collapse `bg` + `iconColor` into one field.**
   The two keys always travel together and always describe the same tile, so the clean edit is
   a single `tile` field carrying both tokens, consumed on the wrapper — exactly the #770
   certificates shape.

   Replace, per entry:
   ```
   bg: 'bg-emerald-50 dark:bg-emerald-950/40',   iconColor: 'text-emerald-600 dark:text-emerald-400',   // stats.active   (IconCrown)
   bg: 'bg-amber-50 dark:bg-amber-950/40',       iconColor: 'text-amber-600 dark:text-amber-400',       // stats.cancelled(IconRefresh)
   bg: 'bg-red-50 dark:bg-red-950/40',           iconColor: 'text-red-600 dark:text-red-400',           // stats.expired  (IconCalendar)
   bg: 'bg-blue-50 dark:bg-blue-950/40',         iconColor: 'text-blue-600 dark:text-blue-400',         // stats.revenue  (IconCurrencyDollar)
   ```
   with a single `tile:` per entry. Under the recommended option (a) of **A2-commerce-1**:
   `tile: 'bg-success/10 text-success'` · `'bg-warning/10 text-warning'` ·
   `'bg-destructive/10 text-destructive'` · `'bg-brand-tint text-brand-text'`.

   Then at the render site:
   - **line 190**: `…rounded-lg ${stat.bg}` → `…rounded-lg ${stat.tile}`
   - **line 191**: `className={\`h-[18px] w-[18px] ${stat.iconColor}\`}` →
     `className="h-[18px] w-[18px]"` (template literal collapses to a plain string; the icon
     inherits `currentColor` from the wrapper).

   If the orchestrator would rather not touch the array's shape, the fallback is to keep both
   keys and put tokens in each — but then `iconColor` and `tile` must not disagree, so prefer
   the collapse.

   *Note on option (a) here:* this is the one stat row in the group where the hues genuinely
   track a lifecycle (`active` / `canceled` / `expired`), matching
   `subscriptions.subscription_status`. Each tile also has its own icon and its own label above
   the number, so colour is redundant either way.

2. **ACTIVEBADGE, line 299 (4 palette).** Apply Pattern ACTIVEBADGE with
   `isActive` (= `subscription_status === 'active'`). Leave the three-way variant ternary
   (`'default'` / `'secondary'` / `'destructive'`, lines 292-298) untouched — after the swap the
   three states read as success-tint / grey / destructive-tint, which is a coherent triad and
   each carries `t('status.<state>')` as its label.
   Watch: `renewed` and `past_due` are both LIVE statuses (CLAUDE.md) and currently fall into the
   `destructive` branch — **that is a pre-existing bug, out of scope for this sweep**; see
   "bugs noticed".

3. **Already correct, do not touch:** `bg-primary/10` + `text-primary` on the user avatar chip
   (lines 280–281). `text-primary` on a `primary/10` tint is the pattern the convention warns
   about, but it is *not* a palette class, is not guard-counted, and rewriting it is a separate
   decision — flagged under "bugs noticed" rather than swept here, so this file's edit stays
   mechanical. **Do not** change it without the orchestrator saying so.

---

## 3. `app/[locale]/dashboard/admin/enrollments/page.tsx` — palette 16, raw 0 → 0 / 0

Three TILEs plus one ACTIVEBADGE. Nothing else.

### Rules

1. **Stat tiles — 3 × TILE, 12 palette.** Apply Pattern TILE at:
   - lines 113–114, `IconCertificate`, label `stats.total` — hue **blue**
   - lines 127–128, `IconClock`, label `stats.active` — hue **emerald**
   - lines 141–142, `IconCheck`, label `stats.completed` — hue **violet**

   Under the recommended option (a): total → `bg-brand-tint text-brand-text`,
   active → `bg-success/10 text-success`, completed → `bg-brand-tint text-brand-text`
   (violet is a brand-like hue, so "completed" becomes a second brand tile; under option (b)
   all three are brand tiles and the point is moot).

2. **ACTIVEBADGE, line 202 (4 palette).** Apply Pattern ACTIVEBADGE with the inline condition
   `enrollment.status === 'active'`. Leave the three-way variant ternary (lines 195-201)
   untouched.

---

## 4. `app/[locale]/dashboard/admin/plans/page.tsx` — palette 12, raw 0 → 0 / 0

Three TILEs. Nothing else — the plan cards below are already fully tokenised.

### Rules

1. **Stat tiles — 3 × TILE, 12 palette.** Apply Pattern TILE at:
   - lines 96–97, `IconCalendar`, label `stats.total` — hue **blue**
   - lines 110–111, `IconCalendar`, label `stats.monthly` — hue **emerald**
   - lines 124–125, `IconCalendar`, label `stats.yearly` — hue **violet**

   **This row is the weakest case for the status mapping and the strongest case for collapsing
   to brand.** "Monthly" and "yearly" are billing cadences (`plans.duration_in_days` 30 / 365),
   not lifecycle states — `bg-success/10` on "monthly plans" asserts a meaning that does not
   exist. All three tiles already share one icon (`IconCalendar`), so the hue is the only thing
   distinguishing them today, and it distinguishes them *wrongly*. See **A2-commerce-1**; if the
   orchestrator picks option (a) globally, I recommend it still carve this one row out to
   `bg-brand-tint text-brand-text` × 3 (that is option (c)).

2. Everything else in this file is already token-clean (`bg-background`, `bg-card`, `bg-muted`,
   `text-muted-foreground`, `Badge variant={isMonthly ? 'default' : 'secondary'}` with **no**
   class override — note this file's monthly/yearly badge is already the "let the variant
   stand" shape referenced in A2-commerce-3 option (b)).

---

## 5. `app/[locale]/dashboard/admin/courses/page.tsx` — palette 12, raw 0 → 0 / 0

Three TILEs. The table itself lives in `components/admin/courses-table.tsx`, which is already
clean (not in the baseline) — nothing to do there.

### Rules

1. **Stat tiles — 3 × TILE, 12 palette.** Apply Pattern TILE at:
   - lines 106–107, `IconBook`, label `stats.total` — hue **blue**
   - lines 120–121, `IconBook`, label `stats.published` — hue **emerald**
   - lines 134–135, `IconBook`, label `stats.drafts` — hue **amber**

   Under the recommended option (a): total → `bg-brand-tint text-brand-text`,
   published → `bg-success/10 text-success`, drafts → `bg-warning/10 text-warning`.
   *Caveat to weigh in A2-commerce-1:* a draft course is not a warning — it is the normal state
   of unfinished work — so `bg-warning/10` overstates it. All three tiles share `IconBook`, so
   like the plans row they end up visually identical under option (b).

---

## 6. `app/[locale]/dashboard/admin/categories/page.tsx` — palette 1, raw 0 → 0 / 0

### Rules

1. **Line 69.** `<IconFolderOpen className="h-10 w-10 text-blue-500" />` →
   `<IconFolderOpen className="h-10 w-10 text-brand-text" />`.
   This is a bare 40px icon sitting directly on `bg-card` (no tile wrapper), so the token goes on
   the icon. `brand-text` is AA on `card` by construction (`app/globals.css:116-118`).
   *Do not* introduce a tile wrapper here — this stat card has a different, larger layout
   (`p-6`, `text-3xl`) than the `h-9 w-9` tiles on the other five pages, and restyling it is
   outside this sweep.

---

## 7. `components/admin/course-status-actions.tsx` — palette 2, raw 0 → 0 / 0

### Rules

1. **Line 102.** `<IconCheck className="text-emerald-600 dark:text-emerald-400" />` →
   `<IconCheck className="text-success" />`. Subject to **A2-commerce-2**.
   Context: this is the "Approve" item in a `DropdownMenu`. Its siblings are "Archive"
   (`variant="destructive"`, already token-driven by `components/ui/dropdown-menu.tsx`) and
   "Restore" (no colour at all). Each item carries a text label (`t('approve')` etc.), so
   meaning never rests on colour.
   Known, pre-existing and unchanged by this edit: `DropdownMenuItem`'s base class contains
   `not-data-[variant=destructive]:focus:**:text-accent-foreground`, so on keyboard/hover focus
   the icon's colour is overridden to `accent-foreground`. That happens today with emerald too —
   do not try to fix it here.

---

## Judgment calls — do not decide these alone

### A2-commerce-1 — what the stat-card icon tiles become (66 of 87 occurrences, 5 files)

Five pages each render a row of 3–4 `h-9 w-9` icon tiles above a count. The hues today are:
blue (total / revenue), emerald (active / published / monthly), amber (archived / drafts /
cancelled), violet (completed / yearly), red (expired).

- **(a) Mechanical mapping.** emerald → `bg-success/10 text-success`, amber →
  `bg-warning/10 text-warning`, red → `bg-destructive/10 text-destructive`, blue & violet →
  `bg-brand-tint text-brand-text`. Most literal reading of the brief's mapping table; most
  likely to match whatever sibling A-groups do to the identical tile shape.
- **(b) Collapse every tile in a row to `bg-brand-tint text-brand-text`.** Exactly what #770
  shipped for the certificates stat row (`student/certificates/page.tsx:79-97`, where amber,
  primary and emerald tiles all became one brand tile); it is also the brief's "decorative
  multi-hue collapses to a single token fill" rule, and it puts the school's brand on the
  screen, which is the point of the kit. Cost: on `plans` (3 × `IconCalendar`) and `courses`
  (3 × `IconBook`) the three tiles become visually identical, leaving the label + number to do
  all the work.
- **(c) Hybrid.** (a) on the rows whose tiles genuinely report a lifecycle — `subscriptions`
  (active/canceled/expired), `products` (active/archived), `courses` (published/draft),
  `enrollments` (active/completed) — and (b) on `plans`, where "monthly"/"yearly" are cadences
  and a success/brand split asserts a meaning that does not exist.

**Recommendation: (c), with (a) as the fallback if the orchestrator wants one rule for the whole
surface.** (a) alone produces `bg-success/10` behind "Monthly plans" and `bg-warning/10` behind
"Draft courses", both of which read as claims the product is not making. Whichever is chosen,
apply it to *every* tile in this group identically, and keep the wrapper-carries-the-token form.

**Why it matters:** this is 66 of the group's 87 occurrences, it recurs verbatim in at least
`admin/monetization/page.tsx`, `admin/revenue/page.tsx`, `admin/payouts/page.tsx`,
`admin/transactions/page.tsx` and `teacher/revenue/page.tsx` (sibling groups, same
`h-9 w-9 shrink-0 … rounded-lg ${stat.bg}` shape), so a split decision shows up as two different
admin screens in the same nav.

### A2-commerce-2 — should the "Approve" dropdown icon stay coloured at all?

- **File:** `components/admin/course-status-actions.tsx` · **Where:** line 102 (`IconCheck`)
- **(a)** `text-success` — keeps the affordance, matches the destructive sibling's token-driven red.
- **(b)** Drop the colour class entirely — the menu then reads uniformly (only the destructive
  item is coloured, which is the `DropdownMenuItem` API's own convention), and the label
  `t('approve')` carries the meaning.

**Recommendation: (a).** Minimal, one-class edit; the green→`success` mapping is exactly what the
convention prescribes; the item already has a label so nothing rests on colour. Take (b) only if
the orchestrator wants dropdown items uniformly uncoloured across the staff surface.

### A2-commerce-3 — the "active" badge: success tint, or let the brand variant stand?

- **Files:** `products/page.tsx:170-175`, `subscriptions/page.tsx:291-302`,
  `enrollments/page.tsx:194-205` (12 palette)
- **(a)** Override to `bg-success/10 text-success border-success/30`, keeping the existing
  `variant` ternary.
- **(b)** Delete the override entirely and let `variant="default"` (`bg-primary
  text-primary-foreground`) stand — "active" is the positive default state, and it already
  contrasts with `secondary` / `destructive`. This is what `plans/page.tsx:147` already does for
  monthly/yearly.

**Recommendation: (a).** Under (b) the "Active" chip becomes the school's brand colour and
collides with every other primary-coloured chip and button on the page, and on
`subscriptions` it would break the success / grey / destructive triad that mirrors
`subscription_status`. The emerald was a deliberate departure from the brand, and `success` is
the token that preserves that intent across every kit.

**Why it matters:** three files must agree, and whichever way it goes, `products`,
`subscriptions` and `enrollments` must be edited identically in the same pass.

---

## Cross-file findings (NOT to be edited from this group)

- **CF-1 — `components/ui/badge.tsx` has no `success` variant.** The exact string
  `bg-success/10 text-success border-success/30` will now be hand-written in three files here
  and (from the sibling plans) in several teacher files too. The durable fix is a
  `success: "bg-success/10 text-success …"` entry in `badgeVariants` alongside the existing
  `destructive` one (which is already a token tint at `/10`, with a `dark:bg-destructive/20`
  bump). Worth raising as a follow-up after all surface-3 groups land, so every call site can
  collapse to `variant="success"`. **Not in my scope** — planning an edit to `components/ui/*`
  from a route group would collide with other agents.
- **CF-2 — `components/admin/subscription-actions.tsx`** (rendered by
  `subscriptions/page.tsx:338`) still has 2 palette classes: `text-orange-600` (line 128) and
  `text-green-600` (line 138) on dropdown-item icons. Baseline `[2, 0]`. Same shape as
  A2-commerce-2 — map to `text-warning` / `text-success`. **Not in my file list.**
- **CF-3 — clean, nothing needed:** `components/admin/courses-table.tsx`,
  `components/admin/categories-table.tsx`, `components/admin/product-actions.tsx`,
  `components/admin/admin-breadcrumb.tsx`, `components/admin/confirm-dialog.tsx` are all absent
  from the baseline and grep clean. The shared components these seven pages import are not
  blocking this sweep.

---

## Pre-existing defects noticed while reading (NOT part of this sweep)

1. **`subscriptions/page.tsx:291-302` — `renewed` and `past_due` render as `destructive`.**
   The variant ternary is `isActive ? 'default' : isCancelled ? 'secondary' : 'destructive'`, so
   both LIVE statuses (CLAUDE.md: "`renewed` and `past_due` both count as LIVE") show up in the
   admin list painted like a failure. The stat counters above (lines 114–119) also count only
   `active` / `canceled` / `expired`, so a renewed subscription is invisible in all four tiles.
   Correctness bug, not a theming bug.
2. **`subscriptions/page.tsx:280-281` — `text-primary` on a `bg-primary/10` tint.** Precisely
   the combination the #764 convention calls out as failing AA for light brands
   (`brand-text` exists for this). Not guard-counted (not a palette class), so the sweep will not
   catch it; worth a separate pass over `bg-primary/10 text-primary` repo-wide.
3. **Sub-AA muted text.** `enrollments/page.tsx:182` `text-[11px] text-muted-foreground/70` and
   `products/page.tsx:253` / `plans/page.tsx:228` `text-muted-foreground/60`. Dimming
   `muted-foreground` (already only ~4.4:1 on muted) below 100% opacity cannot clear AA at any
   size, and line 182 carries the student's email — real content. Not guard-counted.
4. **Unused imports.** `IconArrowLeft` is imported but never rendered in both
   `plans/page.tsx:12` and `categories/page.tsx:7`. Trivial; mention only if the sweep is
   touching those import blocks anyway (it is not).
5. **`enrollments/page.tsx:236`** closes with `</div >` (stray space). Cosmetic.
