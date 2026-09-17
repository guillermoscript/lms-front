# A3-payments — admin payment-request components (#764 surface 3, epic #766)

Survey only. No file in this plan was edited. Every count below was measured with the
exact regexes from `tests/unit/palette-class-guard.test.ts` and matches
`tests/unit/palette-class-baseline.json` line for line.

## Group summary

| file | palette | raw | keeps planned | target after sweep |
|--|--|--|--|--|
| `components/admin/payment-requests-table.tsx` | 15 | 0 | 0 | `[0, 0]` → drop from baseline |
| `app/[locale]/dashboard/admin/payment-requests/[requestId]/page.tsx` | 8 | 1 | 0 | `[0, 0]` → drop from baseline |
| `components/admin/payment-request-actions.tsx` | 2 | 0 | 0 | `[0, 0]` → drop from baseline |
| `components/admin/payment-request-dialog.tsx` | 2 | 0 | 0 | `[0, 0]` → drop from baseline |
| `components/admin/manual-transfer-form.tsx` | 3 | 0 | 0 | `[0, 0]` → drop from baseline |
| `components/admin/payment-provider-row.tsx` | 3 | 0 | 0 | `[0, 0]` → drop from baseline |
| `components/admin/subscription-actions.tsx` | 2 | 0 | 0 | `[0, 0]` → drop from baseline |
| `app/[locale]/dashboard/admin/billing/checkout/[requestId]/solana-checkout-client.tsx` | 0 | 1 | 1 | `[0, 1]` (QR quiet zone stays) |

Group total: **35 palette + 2 raw → 0 palette + 1 raw**, one justified keep.

No inline `style={{ color }}` / `backgroundColor`, no hex constants, no chart props, no
`var(--chart-N)` candidates anywhere in this group. Verified by grep over all eight files.

## Group-wide conventions this plan assumes

- Everything here is **chrome**, not content, with the single exception of the Solana QR plate.
- The payment-request lifecycle is `pending → contacted → payment_received → completed`,
  with `cancelled` as the terminal failure. Two screens render that lifecycle as a coloured
  pill (`payment-requests-table.tsx`, the detail `page.tsx`) and they currently disagree
  (tint pill vs solid fill). The single highest-leverage edit in the group is to make both
  read from **one** status→class map.
- Fixed platform status tokens only for lifecycle state: `warning` / `success` /
  `destructive`. `brand-tint`/`brand-text` for the one in-progress state that should feel
  like the school's colour. Never `text-primary` on a tint.
- Every pill in this group already renders a translated text label
  (`t('status.' + status)` / `t('status.' + status)` in the provider row), so meaning never
  rests on colour alone even after the sweep. No icon has to be added for accessibility;
  adding icons is offered only as an option under **A3-payments-1**.
- Delete every `dark:` sibling whose base class becomes a token — the tokens already carry
  both modes (`manual-transfer-form.tsx:63`, `payment-provider-row.tsx:46`).

---

## 1. `components/admin/payment-requests-table.tsx`

**Measured: 15 palette, 0 raw.** All 15 sit in one object literal, lines 55–61. Every other
class in the file is already a token (`text-muted-foreground`, `border`, `bg-muted`).

Rendering context: the table is mounted inside status-filtered tabs
(`app/[locale]/dashboard/admin/payment-requests/page.tsx` lines ~150–200), so within a tab
every pill is the same state; the pill only carries information in the **All** tab. Keep the
five states visually distinct anyway — that tab is the one an admin scans.

### Rules

1. **`statusColors` map, lines 55–61 → token map.** This is the whole edit for the file.
   Rename to `STATUS_STYLES` to match the name the sibling `payment-provider-row.tsx` and
   the rest of the swept surfaces use, and type it so an unknown status still falls through
   to `undefined` (today `statusColors[unknown]` is `undefined` and the `Badge`
   `variant="outline"` styling shows through — preserve that, it is the safety net for a
   status the enum grows later).

   | key | from | to |
   |--|--|--|
   | `pending` | `bg-yellow-500/10 text-yellow-500 border-yellow-500/20` | `border-transparent bg-warning/10 text-warning` |
   | `contacted` | `bg-blue-500/10 text-blue-500 border-blue-500/20` | `border-border bg-muted text-foreground` |
   | `payment_received` | `bg-purple-500/10 text-purple-500 border-purple-500/20` | `border-transparent bg-brand-tint text-brand-text` |
   | `completed` | `bg-green-500/10 text-green-500 border-green-500/20` | `border-transparent bg-success/10 text-success` |
   | `cancelled` | `bg-red-500/10 text-red-500 border-red-500/20` | `border-transparent bg-destructive/10 text-destructive` |

   Why `border-transparent` on four of them: `Badge variant="outline"` supplies
   `border-border bg-input/20 text-foreground`, and `cn()` is tailwind-merge, so the tint
   wins on `bg-`/`text-` but the neutral border survives and muddies a tinted pill. The
   swept learner screens use `border-transparent bg-<token>/10 text-<token>` for exactly
   this (see #770, `components/admin/payment-provider-row.tsx:46` already does it here).
   `contacted` deliberately keeps the neutral border because it *is* the neutral state.

   Why `text-yellow-500 → text-warning` rather than `text-warning/…`: the old
   `text-yellow-500` was a 2.2:1 failure on a white card; `--warning` is
   `oklch(0.5 0.12 60)` light / `oklch(0.83 0.15 80)` dark and is the AA-checked token.

2. **Add a one-line comment above the map** explaining the five-state mapping, e.g.
   `// pending → warning, completed → success, cancelled → destructive; the two in-flight` /
   `// states read neutral (contacted) and brand (payment_received, one step from done).`
   No utility class literal in the comment.

3. **No other change.** Lines 78–79 (empty state), 109, 143, 150 already use tokens.

### Keeps
None.

### Inline-style / hex findings
None.

---

## 2. `app/[locale]/dashboard/admin/payment-requests/[requestId]/page.tsx`

**Measured: 8 palette, 1 raw.** Server component. Two helpers and two links.

### Rules

1. **Delete `getStatusColor` (lines 115–131) and `getStatusVariant` (lines 97–113); render
   the badge from the same map as rule 1.1.** Today the badge (lines 153–158) is
   `variant={getStatusVariant(status)}` *plus* `className={`${getStatusColor(status)} text-white`}`,
   i.e. a solid palette fill with white text stacked on top of a variant that also sets a
   fill — the variant is doing nothing but deciding the focus ring. After the sweep:

   ```
   <Badge variant="outline" className={STATUS_STYLES[request.status]}>
   ```

   with `STATUS_STYLES` identical to rule 1.1 (see **A3-payments-2** for where it lives and
   **A3-payments-3** for tint-vs-solid). `getStatusVariant` has no other caller in the file —
   grep before deleting, it is defined and used once at line 154.

   This removes 6 palette (`bg-yellow-500`, `bg-blue-500`, `bg-purple-500`, `bg-green-500`,
   `bg-red-500`, `bg-gray-500`) and the 1 raw (`text-white`, line 155) in one edit.
   The `default:` arm's `bg-gray-500` disappears with the switch — the map returning
   `undefined` for an unknown status leaves the `outline` variant showing, which is the
   same neutral fallback, better spelled.

2. **`text-blue-600 hover:underline` → `text-brand-text hover:underline`** on the two
   contact links, lines 186 (`mailto:`) and 193 (`tel:`). Coloured link text on a card is
   the brand-text case; `text-primary` would be a solid-fill token used as text and fails AA
   on light brands. 2 palette removed.

3. **Optional AA pass (see A3-payments-6), no guard effect:** three body panels use
   `text-sm text-muted-foreground bg-muted p-3 rounded-lg` — the student's message (line 205),
   the payment instructions (line 282), the admin notes (line 329). `muted-foreground` on
   `muted` measures 4.39:1. These three panels are quoted content an admin reads word for
   word, so `text-foreground` on the same `bg-muted` is the recommendation. Line 309's
   invoice number (`text-sm font-mono bg-muted px-2 py-1`) already uses foreground — leave it.

4. **Do not touch `<header className="border-b bg-card">` (line 136)** even though on the
   no-kit default `--card` equals `--background` and the band is invisible in light mode.
   Fifteen other admin routes use the same header line (see cross-file findings); changing
   one of them here would desynchronise the admin surface.

### Keeps
None.

### Inline-style / hex findings
None.

---

## 3. `components/admin/payment-request-actions.tsx`

**Measured: 2 palette, 0 raw.** Single line.

### Rules

1. **Line 175, "Complete & Enroll" button:**
   `className="w-full bg-green-600 hover:bg-green-700"` →
   `className="w-full bg-success text-success-foreground hover:bg-success/90"`.
   The `text-success-foreground` is required, not optional: the button has no `variant`, so
   the default variant supplies `bg-primary text-primary-foreground hover:bg-primary/80`,
   and without the explicit foreground the label keeps the *primary* foreground over a
   success fill — on a dark-brand school that is white-on-green (fine) but on a light-brand
   school `--primary-foreground` goes dark and the label drops below AA.
   See **A3-payments-4** for success-vs-primary.
   `data-testid="payment-request-complete"` is untouched; no spec asserts colour here
   (grepped `tests/playwright` for `bg-green` — no hits).

2. Nothing else. The Cancel button (line 187) is already `variant="destructive"`, and the
   dialogs are token-clean.

### Keeps
None.

### Inline-style / hex findings
None.

---

## 4. `components/admin/payment-request-dialog.tsx`

**Measured: 2 palette, 0 raw.** Single line, the twin of rule 3.1.

### Rules

1. **Line 339, "Confirm payment & enroll" button:**
   `className="w-full bg-green-600 hover:bg-green-700"` →
   `className="w-full bg-success text-success-foreground hover:bg-success/90"`.
   Must land in the same commit and with the same decision as rule 3.1 — these are the two
   renderings of the same action (dialog-from-table vs detail page) and a split decision
   would show as two different greens on two routes.

2. **Optional AA pass (A3-payments-6):** line 233–235, the student's message panel is
   `mt-3 p-3 rounded-lg bg-muted` with `text-sm text-muted-foreground` body → `text-foreground`,
   same argument as rule 2.3.

3. The status `Select` (lines 246–262) carries no colour — the five statuses are plain
   translated labels there. Nothing to do.

### Keeps
None.

### Inline-style / hex findings
None.

---

## 5. `components/admin/manual-transfer-form.tsx`

**Measured: 3 palette, 0 raw.** One success-confirmation medallion.

### Rules

1. **Lines 63–64, submitted-state check medallion:**
   - `bg-green-100 dark:bg-green-900` → `bg-success/10` (the `dark:` sibling is deleted, not
     rewritten — `--success` already carries both modes).
   - `text-green-600` → `text-success`.

   Full line 63 after the edit:
   `className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10"`.
   This is the exact shape #770 landed for confirmation medallions
   (`bg-success/10` circle + `text-success` glyph), so it converges with the learner surface
   by construction.

2. **Optional AA pass (A3-payments-6):** lines 89–95, the three-step instruction block is
   `rounded-md bg-muted p-3 text-sm` with the `<ol>` at `text-muted-foreground`. My
   recommendation here is **leave it muted** — the steps are secondary scaffolding beside
   the form they describe, not the thing the admin came to read, and `text-foreground` on
   all three lines would out-shout the form fields. Flagged only so the sweeping agent does
   not "fix" it while doing rule 2.3 and 4.2.

### Keeps
None.

### Inline-style / hex findings
None. `ProofUpload` (`components/shared/proof-upload.tsx`) is imported here and is already
token-clean — no baseline entry, verified by reading it.

---

## 6. `components/admin/payment-provider-row.tsx`

**Measured: 3 palette, 0 raw.** All three in `STATUS_STYLES.ready`, line 46. This file is
otherwise the best-tokenised file in the group — `blocked` already uses
`bg-destructive/10 text-destructive`, `off`/`notConfigured` already use `border-border
text-muted-foreground`, and `FACT_TONE` (lines 54–58) is already pure tokens.

### Rules

1. **Line 46, `ready` pill:**
   `'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'` →
   `'border-transparent bg-success/10 text-success'`.
   The `dark:` sibling is deleted; `--success` is `oklch(0.47 0.12 155)` light /
   `oklch(0.78 0.15 158)` dark, which is precisely the light-green-on-dark the old
   `dark:text-emerald-400` was hand-rolling.

2. **Rewrite the comment above it (lines 44–45).** The current text — "Green is conventional
   for 'money can move' and, unlike the old amber card, never collides with a tenant's brand
   hue the way a warning tint did" — stays true but should now name the token, e.g.
   *"The success token, not the school's brand: whether a rail can take money is a platform
   fact and must read the same on every tenant."* Keep it free of any utility-class literal.

3. Nothing else. `bg-card` / `bg-muted/20` on the row shell (line 86), `border-destructive/30`
   (line 88), `text-destructive` on the setup hint (line 129) are all correct already.

### Keeps
None.

### Inline-style / hex findings
None. `lib/payments/provider-presentation.ts` (the source of `providerStatus`/`providerFacts`)
is deliberately class-free — read in full, it returns ids and tones only, nothing to sweep.

---

## 7. `components/admin/subscription-actions.tsx`

**Measured: 2 palette, 0 raw.** Two dropdown items.

### Rules

1. **Line 128, "Cancel subscription" item:** `className="text-orange-600"` → `className="text-warning"`.
   Mechanical application of the convention (amber/yellow/orange → `warning`). See
   **A3-payments-5** for the alternative of using the component's own
   `variant="destructive"`, which would change the state's severity from amber to red.

2. **Line 138, "Reactivate" item:** `className="text-green-600"` → `className="text-success"`.
   No judgment needed; reactivation is the positive terminal action and the label stays.

3. Nothing else. Line 146's disabled item is already `text-muted-foreground`; the dialog
   footers already use `variant="secondary"` / `variant="destructive"`.

### Keeps
None.

### Inline-style / hex findings
None.

---

## 8. `app/[locale]/dashboard/admin/billing/checkout/[requestId]/solana-checkout-client.tsx`

**Measured: 0 palette, 1 raw.** The single raw is a QR quiet zone and must survive.

### Rules

1. **No token swap. The file's only colour is the QR plate**, line 129:
   `className="size-[260px] rounded-lg border bg-white p-2"`. This is content, not chrome —
   the generated QR's modules are dark and a tinted or inverted plate breaks a meaningful
   share of phone scanners. Surface 2 already kept the identical plate twice in
   `components/public/checkout-form.tsx` (lines 482–492 and 553–563, baseline `[0, 2]`), so
   keeping it here is the consistent call, not an exception.

2. **Add the keep comment** (it has none today — surface 2's twin does). Place it directly
   above the `<img>`, alongside the existing `no-img-element` eslint comment. Use wording
   parallel to surface 2's so a future reader sees one rule, not two:

   > The QR keeps an explicit light plate and quiet zone on every theme — its modules are
   > dark, and an inverted or tinted quiet zone fails on a meaningful share of phone
   > scanners. Content colour, not chrome: do not tokenise it.

   **Do not** write the utility class name inside that comment. Surface 2's existing comment
   says "white plate" in prose, which is safe; what must never appear is the class literal,
   because the guard scans source text and would bank a false allowance.

3. **Baseline:** this file keeps `[0, 1]`. It is the only entry in the group that stays in
   `palette-class-baseline.json` after the sweep.

4. **`text-primary` on the confirmation check, line 149** — not guard-counted, but #770's
   rule was that `text-primary` used as *text/icon colour on a surface* becomes
   `text-brand-text`. Here the glyph is a status confirmation next to `t('confirmed')`, so
   `text-success` is the better read. See **A3-payments-7**; this is the only genuinely
   optional edit in the file.

### Keeps
1. `bg-white` on the QR plate, line 129 — comment text in rule 8.2.

### Inline-style / hex findings
None.

---

## Judgment calls for the orchestrator

### A3-payments-1 — the two in-flight statuses collapse onto the same hue
`components/admin/payment-requests-table.tsx`, lines 55–61 (and, via A3-payments-2, the
detail page). `contacted` is blue and `payment_received` is purple; the convention sends
*both* brand-like hues to `brand-tint`/`brand-text`, which would make two distinct lifecycle
states identical in the **All** tab.

- **A (recommended):** `contacted` → `border-border bg-muted text-foreground`,
  `payment_received` → `border-transparent bg-brand-tint text-brand-text`. Five states stay
  five distinct fills (warning tint / neutral / brand tint / success tint / destructive tint)
  and the brand tint lands on the state that is one click from done.
- **B:** both → `bg-brand-tint text-brand-text`, distinguished by adding an icon per status
  (the student side already does exactly this with `IconClock`/`IconMail`/`IconCreditCard`/
  `IconCheck`/`IconX` in `app/[locale]/dashboard/student/payments/page.tsx`). Most consistent
  with the learner surface, but a bigger diff and two states still share a fill.
- **C:** `contacted` → `bg-brand-tint text-brand-text`, `payment_received` → solid
  `bg-primary text-primary-foreground`. Strongest hierarchy, but a solid brand fill in a
  table column is loud and re-tints on every tenant.

**Why it matters:** this map is the only thing telling an admin, at a glance in the All tab,
which requests are waiting on *them* versus on the student.

### A3-payments-2 — one status map or two copies
`components/admin/payment-requests-table.tsx` lines 55–61 and
`app/[locale]/dashboard/admin/payment-requests/[requestId]/page.tsx` lines 115–131 render the
same five statuses and already disagree. After the sweep they must agree.

- **A (recommended):** extract to a new tiny module, e.g.
  `lib/payments/payment-request-status.ts`, exporting
  `PAYMENT_REQUEST_STATUS_STYLES: Record<string, string>`. Both a client component and a
  server component import it; it is pure strings, no `'use client'` needed, and a
  token-only module never enters the guard baseline.
- **B:** duplicate the literal in both files with a cross-reference comment. Zero new files,
  but the drift that produced today's mismatch comes straight back.
- **C:** export the map from `payment-requests-table.tsx` and import it into the server page.
  Works (a plain const crossing a client boundary is fine) but reads backwards.

**Why it matters:** the brief forbids me planning edits outside my file list, and A creates a
file. Both consumers are mine, so it is in-scope work — but the *decision* to add a module is
yours.

### A3-payments-3 — detail-page badge: tint pill or solid fill
`app/[locale]/dashboard/admin/payment-requests/[requestId]/page.tsx`, line 153–158. Today it
is a solid palette fill with white text, sitting next to an `<h1>` in the page header; the
table uses tints.

- **A (recommended):** same tint map as the table (A3-payments-2). One status vocabulary
  across the two screens, and the `-white` raw disappears with no replacement needed.
- **B:** keep it solid — `bg-success text-success-foreground`, `bg-warning
  text-warning-foreground`, `bg-destructive text-destructive-foreground`,
  `bg-primary text-primary-foreground` for `payment_received`, `bg-muted text-foreground`
  for `contacted`. Retains the header's visual weight; costs a second map shape and makes
  the `contacted` arm the odd one out (no solid neutral token pairs cleanly).

**Why it matters:** the detail page header is where an admin confirms they are acting on the
right request; if it looks unlike the row they clicked, that confirmation weakens.

### A3-payments-4 — "Complete & Enroll" button: success or brand primary
`components/admin/payment-request-actions.tsx:175` and
`components/admin/payment-request-dialog.tsx:339` (must be decided once, applied to both).

- **A (recommended):** `bg-success text-success-foreground hover:bg-success/90`. Preserves
  the deliberate distinction — the two earlier steps in the flow ("Send instructions",
  "Confirm payment") are plain default/primary buttons, and this one was made green because
  it is the irreversible completing step that grants entitlements.
- **B:** drop the override entirely and let it be the default primary button. Simplest
  possible diff and maximally on-theme, but the three lifecycle buttons become
  indistinguishable and the one that enrols a student stops standing out.

**Why it matters:** this button calls `completeAndEnroll` → `enroll_user()`. It is the money
action on the manual rail.

### A3-payments-5 — cancel menu item: `warning` or the destructive variant
`components/admin/subscription-actions.tsx:128`.

- **A (recommended):** `className="text-warning"`. Straight application of the orange →
  `warning` rule, and it keeps the deliberate two-step severity: the *menu item* merely opens
  a dialog, and the red lives on the dialog's "cancel immediately" button (line 193).
- **B:** `<DropdownMenuItem variant="destructive">` — the component already ships that
  variant with token colours and matching focus states
  (`data-[variant=destructive]:focus:bg-destructive/10`), so it is the more idiomatic call,
  but it promotes the item to red and duplicates the dialog's severity.

**Why it matters:** low stakes visually, but B is the component-native path and a reviewer
may ask why it was not taken.

### A3-payments-6 — muted-on-muted body panels (not guard-counted)
`…/[requestId]/page.tsx` lines 205, 282, 329 and `payment-request-dialog.tsx` line 233–235:
`text-muted-foreground` inside a `bg-muted` panel, 4.39:1.

- **A (recommended):** switch those four panels' body text to `text-foreground`, keeping
  `bg-muted`. They hold quoted content — the student's message, the payment instructions the
  student was sent, the admin's own notes — which is the point of the panel.
  Leave `manual-transfer-form.tsx` lines 91–95 (the step list) muted; it is scaffolding.
- **B:** leave all of it and keep this PR strictly to the ratchet.

**Why it matters:** it is the one AA defect in the group that the guard cannot see, and it
sits on the text an admin must read verbatim to reconcile a bank transfer.

### A3-payments-7 — Solana confirm glyph
`…/checkout/[requestId]/solana-checkout-client.tsx:149`, `IconCircleCheck … text-primary`
beside `t('confirmed')`.

- **A (recommended):** `text-success` — it is a payment-confirmed state, and `success` is a
  fixed platform colour, so it never becomes a pale brand tint on a light-brand school.
- **B:** `text-brand-text`, the literal #770 rule for `text-primary` used as a surface glyph.
- **C:** leave it; the branch is on screen for a fraction of a second before
  `router.push(billingHref)` fires.

**Why it matters:** smallest call in the group; listed only so the sweeping agent does not
decide it silently.

---

## Cross-file findings (not mine to edit)

1. **`app/[locale]/dashboard/admin/subscriptions/page.tsx` — baseline `[20, 0]`.** Line 299
   holds the sibling of my `subscription-actions.tsx` work:
   `bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400` on the active
   subscription badge. It renders `<SubscriptionActions>` in the same row, so the two land in
   front of the admin together. Whoever owns that file should use
   `bg-success/10 text-success` so the row is internally consistent. **Not in my scope.**
2. **`app/[locale]/dashboard/admin/payment-requests/page.tsx` — no baseline entry (clean).**
   It is the parent of my table and its four stat cards carry no status colour at all; if
   A3-payments-1 lands, someone may want the stat cards to echo the pill colours. Flagging as
   a design follow-up, not a sweep item. **Not in my scope.**
3. **Admin page-header band, ~15 routes** (`app/[locale]/dashboard/admin/**` — settings,
   enrollments, products, invoices, plans, appearance, and my `[requestId]/page.tsx:136`):
   all use `<header className="border-b bg-card">`. On the no-kit platform default `--card`
   equals `--background`, so the band is invisible in light mode and only the `border-b`
   separates it. Token-based already, so the guard is silent. This is one surface-wide
   decision (`bg-muted` for the band), not eight independent ones — I have explicitly
   planned *not* to touch it in my file. **Not in my scope.**
4. **`components/ui/badge.tsx`, `components/ui/button.tsx`, `components/ui/dropdown-menu.tsx`,
   `components/shared/proof-upload.tsx`, `lib/payments/provider-presentation.ts`** — all read
   in full, all token-clean, none in the baseline. No shared-component blocker for this group.
   Note for the sweeping agent: `Badge variant="outline"` supplies
   `border-border bg-input/20 text-foreground` and `cn()` is tailwind-merge, which is why
   every tint in rule 1.1 needs an explicit `border-transparent`.
5. **`components/public/checkout-form.tsx` (surface 2, merged, baseline `[0, 2]`)** is the
   precedent for keep 8.1 — same QR plate, same reason, comment already written there. Word
   the new comment to match it so the two read as one rule.

## Bugs noticed while reading (NOT to be fixed in this sweep)

- `app/[locale]/dashboard/admin/billing/checkout/[requestId]/solana-checkout-client.tsx:117`
  falls back to `` `$${amountUsd.toFixed(2)}` `` when `settlementLabel` is null — a hardcoded
  `$` and no locale formatting, on a screen that is otherwise careful about both (cf.
  `manual-transfer-form.tsx:36`, which was fixed for exactly this in #726). Low severity.
- `app/[locale]/dashboard/admin/payment-requests/[requestId]/page.tsx:98–113`
  `getStatusVariant` is computed and passed to `<Badge>` but every one of its return values
  is immediately overridden by the `className` fill on line 155 — dead logic today, which is
  why rule 2.1 can delete it outright. Cosmetic.
- `components/admin/payment-request-dialog.tsx:142` uses the native `confirm()` for the
  enroll confirmation while the rest of the group uses `AlertDialog`. Out of scope for a
  colour sweep; noting because it is on the same money path. Low severity.
