> 🤖 Picking this issue back up for **surface 3** — the last one. Plan of attack below; the PR will link here.

Surfaces 1 (learner, #770) and 2 (school public + Puck, #771) are merged. This PR is **teacher and admin dashboards plus onboarding**: **1,082 palette classes and 94 literal colours across 89 files**, measured with the guard's own regexes against `tests/unit/palette-class-baseline.json` on `f52bcafc`.

## Current behaviour

| group | files | palette | raw |
|---|---|---|---|
| `components/teacher/**` + `dashboard/teacher/**` | 51 | 557 | 55 |
| `components/admin/**` + `dashboard/admin/**` | 33 | 357 | 6 |
| onboarding + create-school | 5 | 168 | 33 |

The shape of it is not "a few stray greys":

- **`add-block-menu.tsx` gives each of 23 block types its own hue** — a 23-colour rainbow in the lesson editor that no school theme can reach. 92 classes in one map, the largest single file in the whole baseline.
- **Onboarding is forced dark.** `app/[locale]/onboarding/layout.tsx` paints `bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950` and the wizard stacks five `bg-zinc-900/50` cards with white ink on top of it — including the step where the school *picks its theme kit*. `create-school-flow.tsx` does the same thing for the school that does not exist yet.
- **Ten bespoke tile hues on the admin monetization hub** (emerald / blue / violet / amber / orange / pink), and the same stat-tile shape repeated on payouts, revenue, transactions, products, subscriptions, enrollments, plans, courses and teacher revenue.
- **Status vocabularies that already disagree with each other**: `payment-requests-table.tsx` renders the five request states as tints, `payment-requests/[requestId]/page.tsx` renders the same five as solid fills; "pending" is amber in payouts, grey in transactions, and "Active" is emerald on three screens but the brand colour on a fourth.

## Approach

Same mapping #770 established and #771 confirmed — **no new tokens**. Neutrals → `background` / `card` / `muted` / `foreground` / `muted-foreground` / `border`; brand-like hues → `primary` / `brand-text` / `brand-tint`; green → `success`, amber → `warning`, red → `destructive`; `dark:` pairs deleted where the token already carries both modes; bands `bg-muted`, bordered panels `bg-card`.

Four decisions are worth stating before the diff, because they are the ones that change what the screens look like:

1. **Onboarding stops being forced-dark.** A school on a light kit gets a light onboarding and a light `/create-school`. That is the bug this epic exists to fix — the branding step previews the theme the user just chose — but the "after" screenshots are a light page where there used to be a black one, and that should not arrive as a surprise.
2. **Decorative multi-hue tiles collapse to one brand tint.** The 23 block types, the ten monetization tiles, the four revenue tiles, the six certificate-form section chips, the three per-tab course accents. Each already carries its own glyph and its own translated label, so nothing was resting on the hue. A stat tile keeps a status colour **only** when its metric is a state an admin acts on — pending, failed, expired.
3. **Status colour stays the platform's, never the school's.** Where two lifecycle states both map to "brand" they are separated by fill weight (neutral → tint → solid), not by reaching for a second hue. Every status keeps its icon or its text label.
4. **Three files stay hardcoded on purpose**, each with a comment: the block editor's Shiki `github-dark-default` code panel (its learner twin was kept in #770 at `[9, 2]`), the MDX editor's fixed skin in `markdown-field.tsx`, and `certificate-preview.tsx`, which is a facsimile of a printed certificate — fixed paper, ink the user picked. Target: **1,082 → 22 palette, 94 → 16 raw**, and 86 of the 89 baseline entries deleted.

One new file: `lib/payments/payment-request-status.ts`, so the payment-request status map has one home instead of two that already disagree.

## Risks / blast radius

- **This is a visible redesign of the staff surface, not an invisible refactor.** The before/after matrix is the review, not a formality.
- Colour-carried meaning: pass/fail in submission review, the diff panel's added/removed, subscription and payout lifecycle states. Each keeps a distinct `success`/`warning`/`destructive` token plus its icon or label.
- Kódigo is dark-by-default, so a leftover `bg-white` panel would glare; the sweep removes neutrals in these files, not just hues.
- No schema, no migration, no server logic, no query changes.

## Test plan

- `npm run typecheck`, `npm run test:unit` (including the guard, whose baseline may only shrink), `npm run build`, and a per-file per-rule ESLint comparison against `master` to prove no new lint problems.
- Screenshot matrix over **34 staff screens** — teacher home/courses/course/exercises/certificates/revenue/preview, the exam submission queue and a graded submission, the lesson editor with the block palette open and the version-history diff, all 16 admin screens, the landing-page template picker, and the onboarding wizard plus `/create-school` — across all four kits **plus the no-kit platform default, in light and dark**. 204 shots before, 204 after.
- `axe-core` colour-contrast on every one of those combinations, before and after, so the AA claim is measured rather than asserted. **Baseline: 434 violations across 204 combinations.**
- The harness is committed as `scripts/qa-staff-theme-matrix.ts` — the authenticated sibling of `qa-public-theme-matrix.ts` from #771, logging in once and replaying the session into each theme/mode context, with the staff fixtures (a pending payment request, payouts, invoices, a certificate template, two lesson versions) created idempotently so a `master` run and a branch run see identical data.
