# Surface 3 sweep plan — group `A4-billing-users`

Issue #764 (epic #766), surface 3: admin billing, users, notifications.
Conventions are the ones #770 (learner) and #771 (school public + Puck) already
shipped — nothing new is invented here.

**Group totals measured with the guard's own regexes (2026-09-16, branch
`refactor/staff-theme-tokens-764` @ f52bcafc):**

| file | palette | raw | after plan |
|--|--|--|--|
| `components/admin/billing-overview.tsx` | 13 | 0 | 0 / 0 |
| `components/admin/notifications-list.tsx` | 12 | 3 | 0 / 0 |
| `app/[locale]/dashboard/admin/page.tsx` | 8 | 0 | 0 / 0 |
| `components/admin/invite-user-dialog.tsx` | 8 | 0 | 0 / 0 |
| `components/admin/plan-change-dialog.tsx` | 6 | 0 | 0 / 0 |
| `components/admin/users-table.tsx` | 6 | 0 | 0 / 0 |
| `components/admin/usage-meter.tsx` | 5 | 0 | 0 / 0 |
| `app/[locale]/dashboard/admin/notifications/page.tsx` | 4 | 0 | 0 / 0 |
| `app/[locale]/dashboard/admin/users/[userId]/page.tsx` | 4 | 0 | 0 / 0 |
| `components/admin/mailer-status-row.tsx` | 4 | 0 | 0 / 0 |
| `app/[locale]/dashboard/admin/billing/billing-dashboard-client.tsx` | 2 | 0 | 0 / 0 |
| **group** | **72** | **3** | **0 / 0** |

These match `tests/unit/palette-class-baseline.json` exactly, so every one of the
11 rows is **deleted** from the baseline after the sweep (not lowered). **No file
in this group needs a justified keep** — there is no content colour anywhere in
it (no code theme, no medal, no user-picked colour, no QR quiet zone). So there
are no keep comments to write, and nothing in this group should stay hardcoded.

**There are zero inline `style={{ color }}` / `backgroundColor` literals, zero
hex constants, zero chart/Recharts props in all 11 files.** (Verified by grep for
`#[0-9a-fA-F]{3,8}`, `rgba?(` and `style={{` — the only matches are issue numbers
like `(#744)` inside comments.)

---

## Group-wide rules (apply identically in every file)

**G1 — status hues.**
`amber|yellow|orange → warning`, `green|emerald → success`, `red|rose →
destructive`. Shapes, exactly as #770 shipped them:

| role | classes |
|--|--|
| coloured text / icon | `text-warning` · `text-success` · `text-destructive` |
| tinted panel | `bg-warning/10` · `bg-success/10` · `bg-destructive/10` |
| panel border | `border-warning/30` · `border-success/30` · `border-destructive/30` |
| solid fill | `bg-warning text-warning-foreground` · `bg-success text-success-foreground` · `bg-destructive text-destructive-foreground` |

**G2 — delete every `dark:` twin** whose base class is now a token. `--success`,
`--warning`, `--destructive`, `--brand-text`, `--brand-tint`, `--muted` all carry
both modes (`app/globals.css` :root at 109–120, `.dark` at 165–173). A surviving
`dark:text-warning` next to `text-warning` is noise. **One exception, see G5.**

**G3 — brand-like hues.** Solid fill → `bg-primary text-primary-foreground`.
Coloured text or icon → `text-brand-text`. Tinted chip/panel → `bg-brand-tint
text-brand-text`. Never `text-primary` on a tint.

**G4 — pre-existing `text-primary` sites in this group are in scope.** #770's
commit message states the rule plainly: "text-primary on surfaces becomes
text-brand-text, which the kit derives to stay AA." The guard cannot see these
(they are tokens, just the wrong ones), but they are the same defect. Four sites,
listed per-file below.

**G5 — `<Badge variant="outline">` cannot carry a status tint. Drop the variant.**
`cn()` is `twMerge` (`lib/utils.ts`), and the `outline` variant string is
`border-border bg-input/20 text-foreground dark:bg-input/30 …`
(`components/ui/badge.tsx`). twMerge dedupes `bg-input/20` against a className
`bg-success/10`, but it does **not** dedupe across the `dark:` modifier — so
`dark:bg-input/30` survives and wins in dark mode, and the tint disappears. That
is exactly why today's code carries `dark:bg-green-950`. The `default` and
`secondary` variants have no `dark:` classes at all, so twMerge removes their
fill cleanly. **Therefore: when a Badge's className is a status tint, remove
`variant="outline"` entirely** (the default variant's `bg-primary
text-primary-foreground border-transparent` are all fully overridden). Applies at
`users-table.tsx:162` and `users/[userId]/page.tsx:226`.

**G6 — meaning never rests on colour alone.** Every site below already carries an
icon or a text label; check that it survives the edit. Call-outs keep
`IconAlertTriangle`, the mailer row keeps `IconMailCheck`/`IconMailOff`, badges
keep their translated label, the usage meter keeps "Limit reached" / "80%".

---

## `components/admin/billing-overview.tsx` — palette 13 → 0, raw 0 → 0

Highest-leverage edit: the two warning call-out `<div>` class strings at **224**
and **240–241** are 11 of the 13.

1. **L162** (scheduled-cancel note) — `text-amber-700 dark:text-amber-400` →
   `text-warning`. Full line becomes
   `<p className="font-medium text-warning">`. *(−2; see judgment call
   `A4-billing-users-1` first — this one is arguably informational, not a
   warning.)*

2. **L224** (manual-renewal band, `showRenewalWarning`) — the whole class string
   `flex items-start gap-3 rounded-md bg-yellow-50 dark:bg-yellow-950 p-4 text-sm text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800`
   →
   `flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-warning`.
   *(−6.)* Note the bare `border` keyword is already in the string; keep it and
   add the colour, don't end up with two `border-*` colours. `IconAlertTriangle`
   at L225 stays.

3. **L240** (access-cutoff recheck band) —
   `mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-50 p-3 dark:bg-amber-950/20`
   →
   `mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3`.
   *(−3.)*

4. **L241** — `min-w-0 flex-1 text-sm text-pretty text-amber-900 dark:text-amber-100`
   → `min-w-0 flex-1 text-sm text-pretty text-warning`. *(−2.)*

5. **L178 (G4, not guard-counted)** — `<IconCalendar className="mt-0.5 h-4 w-4
   shrink-0 text-primary" />` sits inside the `bg-muted/25` upcoming-payment
   panel. Coloured icon on a tint → `text-brand-text`.

**Already correct, do not touch:** the past-due block at 196–211 is textbook
`border-destructive/20 bg-destructive/5 … text-destructive`; `bg-muted/15`
(L86), `bg-card` (144, 155), `bg-muted/25` (176) are all tokens.

**Cosmetic consequence worth a glance in QA:** after rules 2–4 the renewal band
and the recheck band become the same `border-warning/30 bg-warning/10 text-warning`.
They never appear together (one needs `showRenewalWarning`, the other
`accessCutoffAt`), so no de-duplication is needed — but the recheck band contains
a `<Button variant="outline">`, which renders `bg-background` and will read as a
punched-out hole on the tint. If it looks wrong in the screenshot, `variant="ghost"`
is the fix; do not change it pre-emptively.

---

## `components/admin/notifications-list.tsx` — palette 12 → 0, raw 3 → 0

Highest-leverage edit: **the two lookup helpers `getTypeBadgeColor` (L47–62) and
`getStatusBadgeColor` (L64–77)** — 11 of the 12 palette classes live in those 30
lines, and both are consumed as `` `${helper(x)} text-white` ``.

1. **Both helpers now return the fill *pair*, not just the background**, so the
   `text-white` at the call sites disappears with them. Keep the `switch` shape
   and the function names (smallest diff); only the returned strings change.

   `getTypeBadgeColor` (L47–62):
   | case | from | to |
   |--|--|--|
   | `announcement` | `bg-blue-500` | `bg-primary text-primary-foreground` *(see `A4-billing-users-2`)* |
   | `alert` | `bg-red-500` | `bg-destructive text-destructive-foreground` |
   | `success` | `bg-green-500` | `bg-success text-success-foreground` |
   | `warning` | `bg-yellow-500` | `bg-warning text-warning-foreground` |
   | `error` | `bg-red-600` | `bg-destructive text-destructive-foreground` |
   | default | `bg-gray-500` | `bg-secondary text-secondary-foreground` |

   `getStatusBadgeColor` (L64–77):
   | case | from | to |
   |--|--|--|
   | `sent` | `bg-green-500` | `bg-success text-success-foreground` |
   | `scheduled` | `bg-orange-500` | `bg-warning text-warning-foreground` |
   | `draft` | `bg-gray-500` | `bg-secondary text-secondary-foreground` |
   | `cancelled` | `bg-red-500` | `bg-destructive text-destructive-foreground` |
   | default | `bg-gray-500` | `bg-secondary text-secondary-foreground` |

   *(−11 palette.)* `alert` and `error` collapse onto the same destructive fill.
   That is fine and intended: they were `red-500` vs `red-600`, visually the same
   already, and each badge renders its own translated label (`t('types.alert')`
   vs `t('types.error')`), so G6 holds.

   Because the helpers now return two classes, consider renaming them
   `typeBadgeClasses` / `statusBadgeClasses` — optional, and only if the sweeping
   agent is happy to touch the three call sites' identifiers too.

2. **L129 and L132** — drop the appended `text-white`:
   `` className={`${getTypeBadgeColor(notification.notification_type)} text-white`} ``
   → `className={getTypeBadgeColor(notification.notification_type)}`, same for
   `getStatusBadgeColor` on 132. *(−2 raw.)* Note `<Badge>` with no `variant`
   gets `default`, whose `bg-primary text-primary-foreground` twMerge strips in
   favour of the helper's pair — correct, and G5's `outline` trap does not apply.

3. **L139** (priority `high`) — `<Badge className="bg-orange-500 text-white">` →
   `<Badge className="bg-warning text-warning-foreground">`. *(−1 palette, −1
   raw.)* **But see `A4-billing-users-3`** — solid warning next to L136's
   `variant="destructive"` (which is a *tint*: `bg-destructive/10
   text-destructive`) makes "high" louder than "urgent".

---

## `app/[locale]/dashboard/admin/page.tsx` — palette 8 → 0, raw 0 → 0

All 8 are in one `className` template literal on the recent-transactions badge,
**L506–511**.

1. **L506–511** — the two tint branches:
   - `bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400`
     → `bg-success/10 text-success` *(−4)*
   - `bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400`
     → `bg-warning/10 text-warning` *(−4)*

   **Leave the `variant={…}` ternary at 499–505 exactly as it is.** The third
   branch passes `''` as className and relies on `variant="destructive"`, which
   is already the matching tint (`bg-destructive/10 text-destructive`) — so all
   three states land on the same tinted shape. The `default` and `secondary`
   variants carry no `dark:` classes, so G5's trap does not bite here and twMerge
   removes their fills cleanly.

2. **L438 (G4, not guard-counted)** — the recent-user initials disc:
   `flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary`
   → `… rounded-full bg-brand-tint text-xs font-semibold text-brand-text`.
   This is the exact "`text-primary` on a tint" case the brief names, and
   `components/student/post-registration-steps.tsx:60` is the swept precedent for
   the same disc shape.

3. **L343 (G4, not guard-counted)** — the onboarding-footer inline link
   `font-medium text-primary underline-offset-4 hover:underline` →
   `font-medium text-brand-text underline-offset-4 hover:underline`. Body-copy
   link on `bg-card`; `text-brand-text` is the AA-derived role.

**Already correct:** the whole stats grid (L386–409) is deliberately colourless
(`text-muted-foreground` icons, comment "clean, no color noise") — that is the
reference this group should converge on (see `A4-billing-users-5`). `bg-muted/40`
(353), `bg-muted` (450, 520), `text-muted-foreground/60` all stay.

---

## `components/admin/invite-user-dialog.tsx` — palette 8 → 0, raw 0 → 0

All 8 are the two result-icon discs at **L172–180** (a single if/else).

1. **L173** — `mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950`
   → `mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-success/10` *(−2)*
2. **L174** — `<IconCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />`
   → `text-success` *(−2)*
3. **L177** — `… rounded-full bg-amber-100 dark:bg-amber-950` → `… rounded-full bg-warning/10` *(−2)*
4. **L178** — `<IconMailOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />`
   → `text-warning` *(−2)*

G6 holds without extra work: the two branches differ by icon (`IconCheck` vs
`IconMailOff`), by heading (`t('sent')` vs `t('createdNotSent')`), and the
not-sent branch alone renders the join-link input.

---

## `components/admin/plan-change-dialog.tsx` — palette 6 → 0, raw 0 → 0

All 6 are one `<li>` class string, **L160**.

1. **L160** —
   `flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50 p-3 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200`
   →
   `flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-warning`. *(−6.)*

`IconAlertTriangle` on 161 stays (G6). Nothing else in the file needs touching —
`bg-muted/25` at 174 and 184, `text-muted-foreground` throughout, are tokens.

---

## `components/admin/users-table.tsx` — palette 6 → 0, raw 0 → 0

All 6 are the "active" status badge, **L162**.

1. **L162** — `<Badge variant="outline" className="bg-green-50 text-green-700
   border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">`
   → `<Badge className="border-success/30 bg-success/10 text-success">` *(−6)*.
   **`variant="outline"` must go** — see rule G5; leaving it makes the tint
   vanish in dark mode behind `dark:bg-input/30`.
   **Decide `A4-billing-users-4` first** (should the unremarkable "active" state
   be coloured at all) — it governs this line and
   `users/[userId]/page.tsx:226` together.

Nothing else: roles badges use `variant` only, `deactivated` already uses
`variant="destructive"`, the empty state is `text-muted-foreground`.

---

## `components/admin/usage-meter.tsx` — palette 5 → 0, raw 0 → 0

Three `cn()` ternaries, `isWarning && !isAtLimit` in each. The `isAtLimit` half of
every pair is already `destructive` — only the warning half is hardcoded.

1. **L29** — `isWarning && !isAtLimit && 'text-yellow-600 dark:text-yellow-500'`
   → `isWarning && !isAtLimit && 'text-warning'` *(−2)*
2. **L42** — `isWarning && !isAtLimit && '[&>div]:bg-yellow-500'`
   → `isWarning && !isAtLimit && '[&>div]:bg-warning'` *(−1)*.
   **Translate the colour only — do not touch the `[&>div]` selector.** It is
   wrong (see "Bugs noticed"), but fixing it changes behaviour and belongs to a
   separate issue.
3. **L48** — `isWarning && !isAtLimit && 'text-yellow-700 dark:text-yellow-400'`
   → `isWarning && !isAtLimit && 'text-warning'` *(−2)*

After the edit L29 and L48 carry the identical string; that is fine, they are
two different elements (the `n / limit` counter and the percentage caption).

G6 holds: the caption always renders `t('limitReached')` or
`t('usagePercent', …)`, so the state is legible without colour. `bg-primary` on
the unlimited dot (L56) is a solid brand fill — already correct, leave it.

---

## `app/[locale]/dashboard/admin/notifications/page.tsx` — palette 4 → 0, raw 0 → 0

Four decorative stat-card icons, one per card. **Blocked on
`A4-billing-users-5`** — recommendation is (b), uniform.

- **(b), recommended — uniform chrome, matches the sibling admin stat grid:**
  - L82 `IconBell className="h-10 w-10 text-blue-500"` → `text-muted-foreground`
  - L94 `IconSend … text-green-500` → `text-muted-foreground`
  - L106 `IconClock … text-orange-500` → `text-muted-foreground`
  - L118 `IconFile … text-gray-500` → `text-muted-foreground`
- **(a), the conservative alternative — keep the current semantics:**
  - L82 → `text-brand-text` · L94 → `text-success` · L106 → `text-warning` ·
    L118 → `text-muted-foreground`

Either way *(−4)*. Each card already names itself (`t('stats.total')`,
`t('stats.sent')`, …) so no colour meaning is lost under (b).

---

## `app/[locale]/dashboard/admin/users/[userId]/page.tsx` — palette 4 → 0, raw 0 → 0

1. **L226** — `<Badge variant="outline" className="mb-2 bg-green-50 text-green-700
   border-green-200">` → `<Badge className="mb-2 border-success/30 bg-success/10
   text-success">` *(−3)*. Drop `variant="outline"` (G5). Note this copy has **no
   `dark:` classes at all** — it is currently broken in dark mode (light-green
   fill under light-green text), which the token fixes for free. Same decision as
   `users-table.tsx:162` → `A4-billing-users-4`.

2. **L288** — the recent-activity timeline bullet
   `<div className="mt-1 h-2 w-2 rounded-full bg-blue-500" />` → `bg-primary`
   *(−1)*. Solid fill of a brand-like hue, G3. It is a pure bullet with no
   status meaning, so `bg-primary` (the school's colour) is the obvious mapping;
   `bg-muted-foreground/40` would also be defensible but diverges from how #770
   handled decorative dots.

Everything else in this 361-line page is already tokenised (`bg-background`,
`border-b bg-card`, `bg-muted`, `text-muted-foreground`, Badge variants).

---

## `components/admin/mailer-status-row.tsx` — palette 4 → 0, raw 0 → 0

One ternary building the icon className, **L23–27**.

1. **L25** — `'mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400'`
   → `'mt-0.5 h-5 w-5 shrink-0 text-success'` *(−2)*
2. **L26** — `'mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400'`
   → `'mt-0.5 h-5 w-5 shrink-0 text-warning'` *(−2)*

Optional tidy (same output, less repetition), if the sweeping agent wants it:
```tsx
className={`mt-0.5 h-5 w-5 shrink-0 ${status.configured ? 'text-success' : 'text-warning'}`}
```
Prefer the template literal over importing `cn` — this is a server component with
a deliberately small import list.

G6 holds: the icon component itself differs (`IconMailCheck` / `IconMailOff`), the
body text differs, and `data-configured` carries the state for the E2E spec.

---

## `app/[locale]/dashboard/admin/billing/billing-dashboard-client.tsx` — palette 2 → 0, raw 0 → 0

1. **L236** — `<Card className="border-yellow-200 dark:border-yellow-800">` →
   `<Card className="border-warning/30">` *(−2)*. It is a border-only accent on a
   `bg-card` panel; do **not** add a `bg-warning/10` fill, that would make the
   renewal card compete with the band `BillingOverview` renders directly above it.

2. **L308 (G4, not guard-counted)** — `className="text-xs text-primary
   hover:underline flex items-center gap-1"` on the "view proof" link →
   `text-brand-text`. Small text on `bg-card`; `text-brand-text` is the role that
   stays AA when a school picks a light brand.

---

## Judgment calls (orchestrator decides — do not pick one while sweeping)

### `A4-billing-users-1` — `billing-overview.tsx:162`, the scheduled-cancel line
"Your plan cancels on 30 Sept" currently renders `text-amber-700
dark:text-amber-400`, and the hint right under it is `text-muted-foreground`.
- **(a)** `text-warning` — preserves today's severity.
- **(b)** `text-foreground` (keep `font-medium`) — the admin *asked* for this
  cancellation; it is a fact, not a warning, and the `Reactivate` button is two
  inches away.
**Recommendation: (a).** It is the literal translation, it keeps the diff
mechanical, and #771 chose severity-preserving translations whenever the
before/after severity was arguable. **Why it matters:** the same amber currently
marks two genuinely urgent states in this file (renewal overdue, access cutoff);
if cancel-scheduled stays amber, three different urgencies share one colour.

### `A4-billing-users-2` — `notifications-list.tsx:50`, `announcement` type badge
`bg-blue-500 text-white` today.
- **(a)** `bg-primary text-primary-foreground` — brand-like hue, solid fill, so
  G3 says primary. The announcement badge becomes the school's colour.
- **(b)** `bg-secondary text-secondary-foreground` — announcement is the *neutral
  default* notification type (it is what everything non-urgent is), and letting
  it wear the brand makes the calmest type the loudest chip on the row.
**Recommendation: (a).** G3 is unambiguous about solid brand-hue fills, and
converging on the obvious mapping is worth more than the taste argument.
**Why it matters:** in a school whose brand is red or amber, (a) makes
`announcement` indistinguishable from `alert` / `warning` — the one case where
the school's colour collides with the fixed platform status colours.

### `A4-billing-users-3` — `notifications-list.tsx:136–140`, priority badge weights
`urgent` uses `<Badge variant="destructive">`, which is a **tint**
(`bg-destructive/10 text-destructive`). `high` is a **solid** `bg-orange-500
text-white`, and the mechanical translation keeps it solid (`bg-warning
text-warning-foreground`) — so the lesser priority shouts louder.
- **(a)** make `high` a tint: `<Badge className="border-warning/30 bg-warning/10
  text-warning">` (no `variant`, per G5-style twMerge reasoning), so the two
  priority chips match each other and read as accents next to the solid
  type/status chips.
- **(b)** keep `high` solid and leave `urgent` alone — smallest diff, but the
  inverted weight ships.
- **(c)** make both solid: `urgent` → `bg-destructive text-destructive-foreground`,
  `high` → `bg-warning text-warning-foreground`.
**Recommendation: (a).** Type and status are the row's primary labels and stay
solid; priority is a modifier and reads correctly as a tint. **Why it matters:**
four chips sit on one line (type, status, priority) — if all four are solid, the
row is a colour bar and the notification title loses the hierarchy.

### `A4-billing-users-4` — the "active user" badge (`users-table.tsx:162` **and** `users/[userId]/page.tsx:226`)
Green is currently spent on the *unremarkable* state; `deactivated` is the one
worth noticing and already uses `variant="destructive"`.
- **(a)** `border-success/30 bg-success/10 text-success` — literal translation,
  keeps the green/red pairing an admin scanning the table already knows.
- **(b)** plain `<Badge variant="outline">` with no colour at all — "content over
  chrome"; only the exceptional state is coloured.
**Recommendation: (a).** Removing a colour is a visual-design change beyond a
token sweep's remit, and the pair reads as a legend. **Why it matters:** decide
once — the two files must not diverge, and `users/[userId]/page.tsx:226` is
currently dark-mode-broken either way, so both files get touched regardless.

### `A4-billing-users-5` — `notifications/page.tsx:82,94,106,118`, the four stat-card icons
Decorative 40px icons on four count cards (Total / Sent / Scheduled / Drafts).
- **(a)** semantic: `text-brand-text` / `text-success` / `text-warning` /
  `text-muted-foreground`.
- **(b)** uniform `text-muted-foreground` on all four, matching the admin
  dashboard's stat grid at `app/[locale]/dashboard/admin/page.tsx:392` whose own
  comment reads "clean, no color noise".
**Recommendation: (b).** These are counts, not states; each card is already
labelled, so colour is decoration, and the sibling grid is the in-repo
precedent. **Why it matters:** if (b) wins here it is the pattern every other
staff-surface stat grid in surface 3 should follow, so it is worth deciding
centrally rather than per-group.

---

## Cross-file findings (outside this group's file list — do not edit)

1. **`components/shared/limit-reached-banner.tsx` [5, 0]** — rendered twice by
   `billing-overview.tsx` (courses + students). Its warning branch, L41, is
   `'border-yellow-500/50 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/20
   dark:text-yellow-200'`, sitting directly under the `usage-meter` bars this
   plan tokenises — so after this sweep the meter says `text-warning` and the
   banner an inch below still says yellow-800. Its `isAtLimit` branch is already
   `border-destructive/50 bg-destructive/10 text-destructive`. One-line fix:
   `'border-warning/30 bg-warning/10 text-warning'`. Whoever owns
   `components/shared/*` should take it; flagging so it is not missed.

2. **`components/shared/onboarding-checklist.tsx` [9, 0]** — rendered by
   `app/[locale]/dashboard/admin/page.tsx:255`. The milestone card, L209–220, is
   emerald throughout (`border-emerald-500/25`, `bg-emerald-500/[0.06]`,
   `bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`,
   `text-emerald-950 dark:text-emerald-50`, `text-emerald-900/70
   dark:text-emerald-100/70`). It is the first thing an admin sees on the
   dashboard. Maps to `border-success/30 bg-success/10` for the card,
   `bg-success/15 text-success` for the disc, `text-foreground` /
   `text-muted-foreground` for the two copy lines (the emerald-950/emerald-50
   pair is doing "strong text", not "success"). Same owner as (1).

3. **`components/ui/badge.tsx` is clean but its `outline` variant is a trap** —
   `dark:bg-input/30` survives any className fill a caller passes, because
   twMerge does not dedupe across the `dark:` modifier. This bit two files in
   this group and will bite every other surface-3 group that tints an outline
   badge. Not a colour bug in the component, so no edit is proposed — but the
   `variant="outline"` + tinted-className combination should be treated as a
   sweep-wide anti-pattern (see G5).

---

## Verification after the sweep

```bash
npx vitest run tests/unit/palette-class-guard.test.ts       # expect: 11 stale-baseline failures
UPDATE_PALETTE_BASELINE=1 npx vitest run tests/unit/palette-class-guard.test.ts
git diff tests/unit/palette-class-baseline.json             # expect: 11 rows removed, none added
```
All 11 rows should be **deleted** from the baseline, not lowered — this group has
no justified keeps, so it ends at zero on both counters.
