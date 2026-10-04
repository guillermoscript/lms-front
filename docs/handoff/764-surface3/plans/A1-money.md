# A1-money — admin money routes (issue #764 surface 3, epic #766)

Survey only. No code was edited. Counts below are measured with the exact regexes in
`tests/unit/palette-class-guard.test.ts` and match `tests/unit/palette-class-baseline.json`.

| file | palette | raw | keeps planned | target |
|---|---|---|---|---|
| `app/[locale]/dashboard/admin/monetization/page.tsx` | 74 | 1 | 0 | 0 / 0 |
| `app/[locale]/dashboard/admin/payouts/page.tsx` | 20 | 0 | 0 | 0 / 0 |
| `app/[locale]/dashboard/admin/revenue/page.tsx` | 14 | 0 | 0 | 0 / 0 |
| `app/[locale]/dashboard/admin/invoices/page.tsx` | 8 | 0 | 0 | 0 / 0 |
| `app/[locale]/dashboard/admin/transactions/page.tsx` | 16 | 0 | 0 | 0 / 0 |

**Nothing in this group is content colour.** Every hue here is chrome: stat-card icon tiles,
status badges, and two Stripe-status banners. The whole group can reach `[0, 0]` and be deleted
from the baseline. Remove all five keys from `palette-class-baseline.json` (do not leave `[0, 0]`
entries — the guard omits clean files entirely).

## Shared vocabulary for this group

Lifted verbatim from surface 1 so the admin money screens read like the learner money screen
(`app/[locale]/dashboard/student/billing/page.tsx:105-111`, merged in PR #770):

```
success badge/tint   bg-success/10 text-success border-success/30
warning badge/tint   bg-warning/10 text-warning border-warning/30
neutral badge        variant="secondary"            (no className colour)
destructive badge    variant="destructive"          (no className colour)
decorative icon tile bg-brand-tint  +  icon text-brand-text
status icon tile     bg-success/10|bg-warning/10|bg-destructive/10  +  icon text-success|text-warning|text-destructive
solid warning fill   bg-warning text-warning-foreground hover:bg-warning/90
```

`text-success` / `text-warning` / `text-destructive` on `background`, `card`, `muted` and their own
`/15` tint are AA-asserted for every kit in `tests/unit/theme-kit-tokens.test.ts:160-168`, so the
`/10` tints above are safe. `text-brand-text` on `brand-tint` is asserted at line 174-178.

Every `dark:` twin in this group sits next to a class the token already covers in both modes —
**delete all of them**, do not translate them.

The four status badges in this group are text-labelled (and on `transactions` also icon-labelled),
so meaning never rests on colour alone after the sweep.

---

## `app/[locale]/dashboard/admin/monetization/page.tsx` — palette 74, raw 1

Four independent clusters. The first is 40 of the 74.

### Rule 1 — HIGHEST LEVERAGE: delete the `bg` / `iconColor` keys from `quickStats` and `navCards`

**Where:** `quickStats` lines 57-86 (4 objects), `navCards` lines 88-137 (6 objects); render sites
lines 250-251 and 268-269.
**Removes:** 40 palette classes (all of lines 62-63, 69-70, 76-77, 83-84, 94-95, 102-103, 110-111,
118-119, 126-127, 134-135).

Drop the `bg:` and `iconColor:` properties from all ten object literals (and from any inferred type)
and hardcode the tile at the two render sites:

```
line 250  `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.bg}`
       -> "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint"
line 251  `h-[18px] w-[18px] ${stat.iconColor}`
       -> "h-[18px] w-[18px] text-brand-text"
line 268  `flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.bg}`
       -> "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint"
line 269  `h-5 w-5 ${card.iconColor}`
       -> "h-5 w-5 text-brand-text"
```

The template literals become plain strings; no `cn()` import is needed.

**Why:** emerald/blue/violet/amber/orange/pink here differentiate ten cards that already differ by
icon and title. That is exactly the case PR #770 collapsed (`student/certificates/page.tsx` and
`student/courses/page.tsx`: amber/emerald/primary tiles all became `bg-brand-tint text-brand-text`).
None of these six hues is a state. See judgment call **A1-money-1** before executing.

### Rule 2 — Stripe *connected* banner becomes a success band

**Where:** lines 159-173. **Removes:** 12 palette classes.

| line | from | to |
|---|---|---|
| 159 | `bg-emerald-50 dark:bg-emerald-950/30 … ring-1 ring-emerald-200 dark:ring-emerald-800` | `bg-success/10 … ring-1 ring-success/30` |
| 161 | `bg-emerald-100 dark:bg-emerald-900/50` | `bg-success/15` |
| 162 | `text-emerald-600 dark:text-emerald-400` | `text-success` |
| 165 | `text-emerald-900 dark:text-emerald-200` | `text-success` |
| 168 | `text-emerald-700 dark:text-emerald-400` | `text-success` |

Keep `IconCheck` (line 162) — it is what stops the meaning resting on colour. Banner body colour is
judgment call **A1-money-8**.

### Rule 3 — Stripe *not connected* banner becomes a warning band (clears the file's only `raw`)

**Where:** lines 175-192. **Removes:** 14 palette + 1 raw.

| line | from | to |
|---|---|---|
| 175 | `bg-amber-50 dark:bg-amber-950/30 … ring-1 ring-amber-200 dark:ring-amber-800` | `bg-warning/10 … ring-1 ring-warning/30` |
| 177 | `bg-amber-100 dark:bg-amber-900/50` | `bg-warning/15` |
| 178 | `text-amber-600 dark:text-amber-400` | `text-warning` |
| 181 | `text-amber-900 dark:text-amber-200` | `text-warning` |
| 184 | `text-amber-700 dark:text-amber-400` | `text-warning` |
| 189 | `bg-amber-600 text-white hover:bg-amber-700` | `bg-warning text-warning-foreground hover:bg-warning/90` |

Line 189 is a hand-rolled button on a `<Link>` (the Button component takes no `asChild`, so leave the
markup alone and swap only the colour classes). Precedent for the solid fill:
`components/exercises/exam-card.tsx:126`. Keep `IconAlertCircle` (line 178). See judgment call
**A1-money-3** for the CTA hue.

### Rule 4 — revenue-split "your revenue" panel

**Where:** lines 219-226. **Removes:** 8 palette classes.

The left panel (line 206) is already `bg-muted/40`; the right one is the highlighted half.

- line 219 `rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 p-4 ring-1 ring-emerald-100 dark:ring-emerald-900/40 space-y-2`
  -> `rounded-xl bg-brand-tint p-4 ring-1 ring-primary/20 space-y-2`
- line 224 `<Badge variant="default" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">`
  -> `<Badge variant="default" className="text-[10px]">` — the `default` variant is already
  `bg-primary text-primary-foreground`; the whole colour override disappears.

See judgment call **A1-money-2** (brand tint vs success tint for this panel).

### Keeps
None. Nothing in this file is content colour.

### Inline styles / hex constants
None. No `style={{ color }}` / `backgroundColor`, no hex arrays, no chart props.

---

## `app/[locale]/dashboard/admin/payouts/page.tsx` — palette 20, raw 0

### Rule 1 — HIGHEST LEVERAGE: the `statusBadge()` map, lines 91-124

**Removes:** 12 palette classes (lines 95, 101, 107).

| status | line | from | to |
|---|---|---|---|
| `paid` | 95 | `bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-[10px]` | `bg-success/10 text-success border-success/30 text-[10px]` |
| `processing` | 101 | `bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 text-[10px]` | `bg-brand-tint text-brand-text border-primary/30 text-[10px]` — see **A1-money-5** |
| `pending` | 107 | `bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 text-[10px]` | `bg-warning/10 text-warning border-warning/30 text-[10px]` |
| `failed` | 113 | `variant="destructive"` | unchanged |
| default | 119 | `variant="secondary"` | unchanged |

These three `<Badge>`s pass a `className` with no `variant`, so they inherit `variant="default"`
(`bg-primary text-primary-foreground border-transparent`). `Badge` composes through `cn()` →
`tailwind-merge`, so `bg-success/10`, `text-success` and `border-success/30` each win over the
variant's own class. **Do not add a `variant` prop** — the sweep is colour-only and the current
merge already resolves correctly.

Each badge renders a translated label (`t('status.paid')` …), so no icon is needed.

### Rule 2 — the two summary-card icon tiles

**Removes:** 8 palette classes.

- line 165 `bg-emerald-50 dark:bg-emerald-950/40` -> `bg-brand-tint`;
  line 166 `text-emerald-600 dark:text-emerald-400` -> `text-brand-text`
  ("Total paid" is a money total, not a state.)
- line 186 `bg-amber-50 dark:bg-amber-950/40` -> `bg-warning/10`;
  line 187 `text-amber-600 dark:text-amber-400` -> `text-warning`
  ("Pending payouts" counts a status, and the same amber means `pending` in the table below.)

This split is judgment call **A1-money-4**, which covers this file, `revenue` and `transactions`.

### Keeps
None.

### Inline styles / hex constants
None.

### Do not touch
`text-destructive` (line 58, 246), `bg-muted` / `bg-muted/40` / `text-muted-foreground/60|70`
(lines 161, 182, 229, 252, 262, 268, 277) are already tokens.

---

## `app/[locale]/dashboard/admin/revenue/page.tsx` — palette 14, raw 0

### Rule 1 — the three summary icon tiles

**Removes:** 12 palette classes.

- line 67 `bg-emerald-50 dark:bg-emerald-950/40` -> `bg-brand-tint`; line 68 icon -> `text-brand-text`
- line 92 `bg-amber-50 dark:bg-amber-950/40` -> `bg-brand-tint`; line 93 icon -> `text-brand-text`
- line 113 `bg-emerald-50 dark:bg-emerald-950/40` -> `bg-brand-tint`; line 114 icon -> `text-brand-text`

**Why all three brand, unlike `payouts` and `transactions`:** none of Total revenue / Platform fees /
Net revenue is a state. The amber on "Platform fees" is a cost line, not a warning — mapping it to
`warning` would tell every school its own fee row is a problem. (A1-money-4 covers this.)

### Rule 2 — the net-revenue figure, line 106

`text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400`
-> `text-2xl font-bold tracking-tight tabular-nums text-foreground` (2 palette classes).

Hierarchy is already carried by the sibling "Platform fees" figure, which is deliberately
`text-muted-foreground` (line 81). See judgment call **A1-money-6** — `text-success` is the
alternative and is AA-verified if the orchestrator wants to keep the green "money in" read.

### Keeps
None.

### Inline styles / hex constants
Line 163 `style={{ width: `${Math.max(width, 2)}%` }}` is a geometry, not a colour — leave it.
The bar fill at line 162 is already `bg-primary/20` (a token) with the amount label inheriting
`foreground`. **Leave both as they are**; `bg-brand-tint` would render near-identically and is not
worth the churn.

---

## `app/[locale]/dashboard/admin/invoices/page.tsx` — palette 8, raw 0

### Rule 1 — HIGHEST LEVERAGE (and the only rule): the `statusBadge()` map, lines 89-118

**Removes:** all 8 palette classes.

| status | line | from | to |
|---|---|---|---|
| `approved` / `completed` | 94 | `bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-[10px]` | `bg-success/10 text-success border-success/30 text-[10px]` |
| `pending` | 100 | `bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 text-[10px]` | `bg-warning/10 text-warning border-warning/30 text-[10px]` |
| `rejected` / `cancelled` | 107 | `variant="destructive"` | unchanged |
| default | 113 | `variant="secondary"` | unchanged |

Use the **exact same strings** as `payouts/page.tsx` Rule 1 — the two admin money tables sit one
breadcrumb apart and a reader moves between them. Do **not** extract a shared helper in this sweep;
this pass is colour-only.

Each badge renders a translated label, so meaning survives without colour.

### Keeps
None.

### Inline styles / hex constants
None. Everything else in the file (`bg-muted/40`, `bg-muted/15`, `bg-muted/20`, `text-primary`,
`ring-ring`, `text-foreground`) is already tokens — leave it.

---

## `app/[locale]/dashboard/admin/transactions/page.tsx` — palette 16, raw 0

### Rule 1 — the three stat icon tiles

**Removes:** 12 palette classes.

- line 126 `bg-emerald-50 dark:bg-emerald-950/40` -> `bg-brand-tint`;
  line 127 `text-emerald-600 dark:text-emerald-400` -> `text-brand-text` (Total revenue — a total)
- line 145 `bg-amber-50 dark:bg-amber-950/40` -> `bg-warning/10`;
  line 146 `text-amber-600 dark:text-amber-400` -> `text-warning` (Pending — a status count, `IconClock`)
- line 162 `bg-red-50 dark:bg-red-950/40` -> `bg-destructive/10`;
  line 163 `text-red-600 dark:text-red-400` -> `text-destructive` (Failed — a status count, `IconX`)

Both status tiles keep their icon, so the tint is reinforcement, not the message. Covered by
judgment call **A1-money-4**.

### Rule 2 — the status-badge ternary, lines 213-235

**Removes:** 4 palette classes. Current line 223:

```tsx
className={`text-[10px] ${transaction.status === 'successful' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : ''}`}
```

becomes

```tsx
className={`text-[10px] ${transaction.status === 'successful' ? 'bg-success/10 text-success border-success/30' : ''}`}
```

Keep the template literal — `cn` is **not imported** in this file and a colour-only sweep should not
add an import. Leave the `variant={…}` ternary at lines 214-222 exactly as it is; `successful` still
gets `variant="default"` whose `bg-primary`/`text-primary-foreground` are overridden by the
className through `tailwind-merge` (same mechanism as `payouts`).

The three icons (`IconCheck` / `IconClock` / `IconX`, lines 225-233) stay — they are what keeps the
four states distinguishable for a school whose brand hue happens to sit near `success`.

Judgment call **A1-money-7**: whether `pending` should also get `bg-warning/10 text-warning
border-warning/30` so it matches the pending badge on `payouts`/`invoices` and the pending stat tile
ten lines above it.

### Keeps
None.

### Inline styles / hex constants
None.

---

## Judgment calls (do not decide these while sweeping — the orchestrator owns them)

### A1-money-1 — `monetization`, lines 57-137: collapse ten multi-hue tiles to one brand tint?
**Question:** `quickStats` (4) and `navCards` (6) each carry a bespoke hue (emerald/blue/violet/
amber/orange/pink). Collapsing every tile to `bg-brand-tint text-brand-text` removes 40 of the file's
74 palette classes and deletes two object keys, but the monetization hub becomes a monochrome grid.
**Options:** (a) collapse all ten to `bg-brand-tint text-brand-text` and delete the `bg`/`iconColor`
keys; (b) keep differentiation by rotating `--chart-1..5` through
`bg-[color-mix(in_oklch,var(--chart-N)_15%,transparent)]` + `text-[var(--chart-N)]` (theme-aware, not
counted by the guard, but chart tokens are not contrast-verified as text and the strings are ugly);
(c) collapse the 4 stats to brand tint and keep 6 nav hues.
**Recommendation:** (a). Exact precedent in PR #770 (`student/certificates/page.tsx:53,79,88,97`,
`student/courses/page.tsx:231,244`), each card already differs by icon and title, and "content over
chrome" is the stated principle.
**Why it matters:** 40 of this group's 132 palette classes, and it changes the visual identity of the
admin money hub.

### A1-money-2 — `monetization`, lines 219-226: is "Your revenue" a success state or the brand half?
**Question:** the split card pairs a muted "Platform fee" panel with a green "Your revenue" panel.
**Options:** (a) `bg-brand-tint` + `ring-primary/20`, badge reduced to `variant="default"` (brand
highlight); (b) `bg-success/10` + `ring-success/30`, badge `bg-success/15 text-success` (keeps green).
**Recommendation:** (a). The school's share is a fact, not a state, and `success` is reserved for
state across this whole surface; the neutral/highlighted pairing is precisely what brand tint is for.
**Why it matters:** sets whether "money that is yours" reads as success green everywhere in this
group — the same question recurs on `revenue` (A1-money-6).

### A1-money-3 — `monetization`, line 189: the "Set up Stripe" CTA inside the warning band
**Question:** the band is a warning; the button is the page's primary action.
**Options:** (a) `bg-warning text-warning-foreground hover:bg-warning/90`; (b) `bg-primary
text-primary-foreground hover:bg-primary/90`.
**Recommendation:** (a) — band cohesion, and it matches `components/exercises/exam-card.tsx:126`.
**Why it matters:** it is the file's only `raw` count (`text-white`), and on a school whose brand is
amber-ish the two options look identical, while on a teal brand (a) stays legible as "act on this".

### A1-money-4 — `payouts` / `revenue` / `transactions`: do stat-card icon tiles keep status colour?
**Question:** every stat card has a decorative tile behind its icon. Some stats count a status
(Pending payouts, Pending amount, Failed count); others are totals (Total paid, Total revenue, Net
revenue, Platform fees).
**Options:** (a) status tint where the metric *is* a status count (`bg-warning/10 text-warning`,
`bg-destructive/10 text-destructive`), `bg-brand-tint text-brand-text` for totals — my plan above;
(b) `bg-brand-tint text-brand-text` for all nine tiles, matching A1-money-1's collapse;
(c) status tint for all nine, mapping "money in" to `success`.
**Recommendation:** (a). The pending/failed tiles carry `IconClock`/`IconX` and sit directly above
tables whose badges use the same warning/destructive hues, so the tint is a real signal; the totals
are not states. (b) is the safer choice if the orchestrator picks (a) for A1-money-1 and wants one
rule everywhere.
**Why it matters:** 18 palette classes across three files, and it decides whether an admin scanning
the money pages can spot "something is pending/failed" without reading.

### A1-money-5 — `payouts`, line 101: what is a `processing` payout?
**Question:** blue is the brand family per the convention, but using brand for one state in a map
whose other states are `success`/`warning`/`destructive` is mixed grammar — and on a green-branded
school `processing` and `paid` could look alike.
**Options:** (a) `bg-brand-tint text-brand-text border-primary/30`; (b) `variant="secondary"` with no
colour className (neutral in-flight); (c) same `warning` as `pending` (collapses two real states —
rejected).
**Recommendation:** (a), because it keeps four distinct reads and every badge carries its label.
Pick (b) if the group should never spend brand colour on a status.
**Why it matters:** 4 palette classes, and it is the one place in this group where the convention's
"blue -> brand" rule collides with "status -> fixed platform colours".

### A1-money-6 — `revenue`, line 106: the net-revenue figure
**Question:** the headline number is currently emerald.
**Options:** (a) `text-foreground`; (b) `text-success`; (c) `text-brand-text`.
**Recommendation:** (a) — the card's sibling ("Platform fees") is already de-emphasised with
`text-muted-foreground`, so the hierarchy survives without colour, and `success` stays a state word.
(b) is AA-verified on `card` if the green read is wanted.
**Why it matters:** it is the single most-looked-at number on the school's revenue page.

### A1-money-7 — `transactions`, lines 213-235: should `pending` get a warning tint?
**Question:** after the sweep, `successful` is success-tinted while `pending` falls through to
`variant="secondary"` (neutral) — but `pending` is warning-tinted on `payouts`, on `invoices`, and on
the stat tile ten lines above it in this same file.
**Options:** (a) add a branch so `pending` gets `bg-warning/10 text-warning border-warning/30`;
(b) leave it neutral-secondary (a strictly minimal colour-only diff).
**Recommendation:** (a) — three money tables showing the same word in two different colours is the
kind of drift this epic exists to remove.
**Why it matters:** adds a code branch the guard does not require, so it needs an explicit yes.

### A1-money-8 — `monetization`, lines 168 and 184: banner body copy
**Question:** after the headings become `text-success` / `text-warning`, does the body line stay the
status colour or drop to `text-muted-foreground`?
**Options:** (a) both `text-success` / `text-warning` (matches
`student/courses/[courseId]/exams/[examId]/result/page.tsx:257,273`, and is AA-verified on the tint);
(b) heading in the status colour, body `text-muted-foreground` (calmer, but its contrast on a
status tint is not covered by `theme-kit-tokens`).
**Recommendation:** (a) — precedent plus verified contrast.
**Why it matters:** 4 palette classes and the two banners are the first thing an admin sees on the
money hub.

---

## Cross-file findings

- **`components/ui/badge.tsx` has no `success` / `warning` variant.** All four status maps in this
  group therefore hand-roll `bg-success/10 text-success border-success/30`. The file is clean in the
  baseline, so there is no colour debt to fix — but a `success`/`warning` variant would turn every
  admin status map into one word and is worth an epic follow-up. **Out of this group's scope; do not
  edit it here.**
- **`components/ui/card.tsx`, `components/ui/table.tsx`, `components/ui/avatar.tsx`,
  `components/ui/button.tsx`, `components/admin/admin-breadcrumb.tsx`** — every shared component these
  five pages import is clean in `palette-class-baseline.json`. No colour reaches these pages from
  outside their own source.
- **Convergence anchor:** the `bg-success/10 text-success border-success/30` / warning twin strings
  recommended here are copied from `app/[locale]/dashboard/student/billing/page.tsx:105-111` (surface 1,
  merged). Sibling A-group agents sweeping other admin tables should use the same strings.

## Test / QA notes for the sweeping agent

- No Playwright spec asserts a palette class on any of these five routes (`grep` over
  `tests/playwright/*.ts` finds only `loop-2-student-learns.spec.ts:602`, another surface). The specs
  that visit them (`smoke-test.spec.ts:52-56`, `loop-3-student-pays.spec.ts:441-487`,
  `admin-pages.spec.ts:117`) key off `data-testid` (`monetization-page`, `payouts-page`,
  `revenue-page`, `invoices-page`, `transactions-page`, `total-paid-value`) — **do not rename or
  remove any of them.**
- After the sweep, delete all five entries from `tests/unit/palette-class-baseline.json`
  (`UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts` does it, but
  verify the diff only touches these five keys).

## Pre-existing defects noticed — NOT to be fixed in this sweep

1. `transactions/page.tsx:120,139,210` — `Intl.NumberFormat(locale, { currency: 'USD' })` is hardcoded
   while each row carries its own currency; a school selling in EUR reads dollar signs, and the three
   stat cards sum mixed currencies into one number. `payouts/page.tsx` solved exactly this with
   `sumByCurrency` / `formatByCurrency` (#531/#497). Severity: medium.
2. `transactions/page.tsx:61-65` — `.select('*')` with no pagination; the PostgREST 1000-row cap
   silently truncates the table *and* every stat derived from it (same class as #533/#548, which
   `payouts` fixed with `fetchAllRows`). Severity: medium.
3. `transactions/page.tsx:210` — the table's amount column shows gross `transaction.amount` while the
   "Total revenue" card is net of refunds (#547, line 82), so a partially refunded row never
   reconciles with the header. Severity: low-medium.
4. `invoices/page.tsx:66-71` — unpaginated `payment_requests` read, same 1000-row cap. Severity: low.
