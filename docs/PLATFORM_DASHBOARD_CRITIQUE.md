# Super Admin Dashboard (`/platform/*`) — Design Critique

Date: 2026-08-29. Scope: `app/[locale]/platform/**` + `components/platform-sidebar.tsx`.
Method: `/critique` skill (frontend-design anti-pattern checklist + UX review), then
implemented in the same PR. Each issue lists whether it was fixed here.

## Anti-patterns verdict: FAIL (before)

The panel would be identified as AI-generated in under two seconds. The tells:

1. **The hero-metric card template, four times over.** Overview, Revenue, Billing
   Health and Payouts each open with the same grid of cards: tiny uppercase label,
   big bold number, pastel icon tile in the top-right corner. Copy-pasted, not shared.
2. **Rainbow-by-position colour.** Each card gets a different hue purely by index —
   emerald, blue, violet, amber. The colour carries no meaning: "Total Students" is
   violet for no reason. Plan-distribution bars repeat this with five hues for five
   categorical values.
3. **Cards inside cards.** Plans page: `Card` → four `bg-muted` boxes → limits → checkout
   → editor. Tenant detail: three cards with `text-3xl` numbers and nothing else.
4. **Filler sub-copy.** "Across all schools", "Active subscriptions only", "Require
   confirmation" — restating the label rather than adding information.
5. **Emoji as illustration** (`🛠️` at `text-6xl`) on the error boundary.

The brand register (PRODUCT.md / DESIGN.md) is *minimal, elegant, focused — hierarchy
via typography, colour for meaning*. The old panel inverted that.

## Overall impression

Functionally solid — the data model behind it is careful (net-of-refunds, per-currency
payouts, plan purchasability diagnostics). But the *dashboard* half of "super admin
dashboard" was missing: the Overview showed four numbers and a bar chart, and the actual
job of a platform operator — confirm payment requests, chase past-due schools, notice
that a plan is unpurchasable, see who signed up — lived in sidebar badges or three
clicks away. The single biggest opportunity was to make the Overview a **work queue
first, scoreboard second**.

## What was working

- **Honest money.** Net-of-refunds everywhere, "plan now $X" drift note on payment
  requests, refund-clawback and overpaid banners with real explanations. Keep.
- **Test-ID discipline.** Every surface has stable `data-testid`s; the redesign kept all
  of them so `platform-panel.spec.ts` still passes untouched.
- **Progressive-enhancement filters/tabs.** Tenants filter is a plain `<form>` and billing
  tabs are `?tab=` links — work without JS. Kept, only polished.

## Priority issues → fixes

| # | Issue | Why it matters | Fix (this PR) |
|---|-------|----------------|---------------|
| 1 | Overview has no primary action / work queue | Operator has to guess where the work is; past-due schools weren't on the Overview at all | New **Needs attention** queue at the top of `/platform`: pending manual payments (with the three oldest inline), past-due schools, access cutoffs, unpurchasable plans. Collapses to a single "All clear" line when empty |
| 2 | Same metric-card template ×4, rainbow icon tiles | Reads as AI-generated; colour carries no meaning; four copies drift | One shared `components/platform/stat-strip.tsx` (`<dl>`, hairline-divided, typographic hierarchy, tone only for warning/danger states). Overview, Revenue, Billing Health, Payouts, Tenant detail all use it |
| 3 | Nothing on the Overview says *who signed up* | "New in last 30 days: +3" without names is a vanity number | **Recent schools** list (newest 6) with plan, status, students, age, link to detail and "open site" |
| 4 | Tenants list: filter needs a button press, no active-filter feedback, no clear, `school(s)` copy, no way to open the school | Slow triage; raw `<select>`/`<input>` don't match the design system | Filters auto-submit on select change, active filters show as chips with a **Clear** link, proper plural copy, "showing newest 100 of N" when capped, external "open site" link per row, empty state that offers to clear filters |
| 5 | Tenant detail: `text-3xl` stat cards, "Revenue (last 20 txn)", back button is a `<Button>` inside a `<Link>` (invalid HTML) | Hierarchy carried by size alone; metric label is confusing; a11y | Stat strip incl. billing status; honest label "Net of refunds · last 20 transactions"; plain back link; slug is now a link to the live school |
| 6 | Billing: every row has three buttons and **Confirm** is primary regardless of state | "Every button primary" — the correct next step differs by status | Primary action is contextual: `pending` → **Send instructions**; `instructions_sent`/`payment_received` → **Confirm**. Reject demoted to ghost. Tabs carry counts |
| 7 | Loading skeleton for `/platform` showed a *table* (the page has no table) | Layout shift on every load | Skeleton now mirrors the real Overview layout |
| 8 | Header bar always says "Platform Admin" (also the sidebar header) | Redundant; no orientation | Header shows the current section name; sidebar nav grouped into Operate / Money / Configure; past-due badge is tinted red, pending-payments amber |

## Minor observations (fixed unless noted)

- `Link` wrapping `Button` in tenant detail → replaced with a plain link (see memory
  `feedback_baseui_render_prop_not_aschild`).
- "Total Students" and "Active Tenants" both linked to `/platform/tenants` — kept, but
  the strip makes the link affordance visible (arrow on hover).
- Plan distribution now uses a single hue with the count carried by width + label; the
  legend is the plan name, not a badge.
- Error boundary: emoji → Tabler icon, copy tightened.
- Sidebar test expects a `/platform/referrals` link that the sidebar hides on purpose
  (feature unbuilt) — **not fixed**, pre-existing test/feature mismatch.
- The panel is English-only except `/platform/payouts` (translated). Left as is: the
  operator surface is not tenant-facing. Worth a follow-up if a Spanish-speaking
  co-founder needs it.
- `get_platform_stats().mrr_cents` is dollars. Not renamed here (migration + RPC
  consumers); flagged.

## Questions to consider next

- Should the Overview show *trend* (MRR this month vs last) rather than a single figure?
  The RPC has monthly data on the Revenue page already.
- A super admin will eventually want per-tenant notes/flags ("talked to owner 8/20").
  `tenants` has no such column.
- Impersonation is the most dangerous action on the panel and sits behind a `⋯` menu
  with no confirmation — a follow-up should add an audit row and a confirm step.
