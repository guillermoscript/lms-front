# School-Admin Dashboard (`/dashboard/admin/*`) — Critique Notes

Date: 2026-08-29. Companion to `PLATFORM_DASHBOARD_CRITIQUE.md` (the super-admin panel,
fixed in PR #644). This file is **notes for a follow-up PR** — nothing here is fixed yet.
Line numbers are from the survey on that date; re-check before acting.

Also covers the `/platform` pieces PR #644 left alone: `plans/*`, `tenant-actions-menu.tsx`,
`impersonate-dialog.tsx`.

## Anti-patterns verdict: FAIL (same fingerprints as the platform panel had)

- The label / big number / coloured 9×9 icon-tile **metric card is copy-pasted ~30 times**
  in *two* visual variants (home + users are monochrome `p-4`; everything else is the
  colour-tiled `p-5` one). `components/platform/stat-strip.tsx` now exists and is unused here.
- **Colour by index, not by meaning**: `monetization/page.tsx` gives six nav cards six hues
  (blue, violet, emerald, orange, amber, pink); courses/products/plans/enrollments tint
  "total / published / drafts" blue / emerald / amber. The same emerald means "published",
  "active product", "revenue" and "net revenue" on different pages.
- Cards in cards: `settings` (Tabs → Card → form), `community/moderation` (Tabs → Card →
  table), `monetization` (Card → two tinted panels).
- No gradients, no glassmorphism — good.

## Priority issues (ranked)

| # | Issue | Where | Fix |
|---|-------|-------|-----|
| 1 | **Two competing page shells.** Half the routes wrap the H1 in a bordered `header.bg-card` band inside `container` (courses, products, monetization, settings, revenue, payouts, plans, subscriptions, transactions, enrollments, invoices, payment-requests, appearance, api-tokens, categories, community, moderation); the other half use bare `space-y-6 p-6 lg:p-8` with no band (home, users, tenants, billing, analytics, landing-page — which has no header at all). Max-width also varies: `container` / `max-w-3xl` / `max-w-5xl` | e.g. `courses/page.tsx:69-86` vs `page.tsx:196` | One `PageHeader` primitive (extend `components/platform/page-header.tsx`) + one content container for all 24 routes |
| 2 | **Metric card ×30, two variants** | `courses/page.tsx:88-130`, `products/page.tsx:110-152`, `plans`, `subscriptions`, `transactions`, `enrollments`, `revenue/page.tsx:51-114`, `monetization/page.tsx:237-257`, `page.tsx:319-342`, `users/page.tsx:88-122`, `payouts` | Reuse `StatStrip` (or a `StatCard` with a `tone` prop); delete per-page markup |
| 3 | **Decorative colour** | `monetization/page.tsx:62-135`, `plans/page.tsx:94-122`, `products/page.tsx:118-146`, `courses/page.tsx:96-124`, `enrollments/page.tsx:113-141` | Neutral tiles; emerald/amber/red only for state |
| 4 | **Root `loading.tsx` doesn't match the page** (skeleton = 4-col KPI grid + charts + table; page = checklist + plan bar + 5-col KPIs + two activity lists) → layout shift on every load. 7 routes have no `loading.tsx`: analytics, api-tokens, appearance, invoices, payouts, tenants, community/moderation, notifications/templates. Loading files also straddle both shells | `admin/loading.tsx:19-78` vs `admin/page.tsx:212-464` | Rebuild skeletons from the real composition; add the missing seven |
| 5 | **Admin home has no primary action** — onboarding checklist, plan bar "Upgrade", five clickable stat cards and two "View all" ghosts all compete. Courses, Revenue and Transactions headers have **zero** actions (a courses page with no "New course") | `page.tsx:212-341`, `courses/page.tsx` | One header CTA per page; demote the plan bar to a slim strip |
| 6 | **`<Link><Button>` nesting** (nested interactives; invalid HTML) in 14 places | `page.tsx:310,354,403`, `products/page.tsx:82,258`, `plans/page.tsx:74,233`, `subscriptions/page.tsx:219-243`, `community/page.tsx:175`, `notifications/page.tsx:62`, `enrollments/page.tsx:212`, `error.tsx:43` | `<Button render={<Link href=…/>}>` — the idiom `app-sidebar.tsx:78` already uses |
| 7 | **Filters styled as primary buttons** — four `<Link><Button variant=default\|outline>` chips; the active filter is a filled primary and reads as the page CTA | `subscriptions/page.tsx:219-249` | Segmented control / ToggleGroup; same chip pattern as `platform/tenants/tenant-filters.tsx` |
| 8 | **Empty states without an exit.** Revenue is one line, no CTA (obvious next step: create a product); Transactions reuses the *page subtitle* as the empty body; home activity lists say "no users / no transactions" and stop. Only Products and Plans do it right (title + description + Create) | `revenue/page.tsx:37-47`, `transactions/page.tsx:253-263`, `page.tsx:382-390, 452-460`, `components/admin/courses-table.tsx:220` | Reuse `components/platform/empty-state.tsx` with an action |
| 9 | **Zero `aria-label`s in the whole admin tree**; 9 icon-only buttons unlabeled | `components/admin/course-status-actions.tsx:90`, `users-table.tsx:185`, `categories-table.tsx:131`, `referral-link-card.tsx:70`, `product-post-registration-editor.tsx:235,245,255`, `landing-page/landing-pages-client.tsx:374`, `template-picker.tsx:101` (`user-actions.tsx:98` and `subscription-actions.tsx:110` are correct) | Label every icon button |
| 10 | **`/platform/plans` + tenant tools: untranslated, modal-heavy.** Plan editor is a 6-field form **plus a raw JSON `<textarea>` for limits** inside a dialog; "Change plan" opens a full Dialog to host one `<Select>`; Impersonate has hardcoded "No users found." and no confirmation/audit step for the most dangerous action on the panel | `platform/plans/plan-editor.tsx:107-179` (JSON at `:163-169`), `tenant-actions-menu.tsx:105-129`, `impersonate-dialog.tsx:61-104` | `/platform/plans/[id]` route with a real limits form; inline plan change in the row; confirm + audit row on impersonate |

## Minor observations

- **Status badges re-implemented per page** with ad-hoc colour maps (`payouts/page.tsx:90-125`,
  `transactions/page.tsx:214-235`, `invoices/page.tsx:94-100`, `subscriptions/page.tsx:299`,
  `enrollments/page.tsx:202`, `payment-requests/[requestId]/page.tsx:105-120` with raw
  `bg-yellow-500` dots). `page.tsx:439-444` sets `variant="default"` *and* overrides it with
  emerald classes. → one `StatusDot`/`StatusBadge` (see `components/platform/badges.tsx`).
- **Info/warning banner** hand-rolled three ways (`monetization/page.tsx:158-196` — with an
  `<a class="bg-amber-600 text-white">` masquerading as a button, `products/page.tsx:94-107`,
  `platform/plans/page.tsx:69-90`). → shared `Callout`.
- **Copy**: `(s)` plurals in `messages/en.json:904, 1021, 2009-2012` (ICU `plural` is
  available); filler subtitles ("View and manage all platform users"); **"platform" leaks
  into school-admin copy** — "Platform Settings", "User Management" — a school admin manages
  *their school*; verbose titles ("Analytics & Reports", "Course Management") when the
  sidebar already says the noun.
- **Untranslated English** across the `/platform/plans` tree, `tenant-actions-menu.tsx`,
  `impersonate-dialog.tsx`, and `dashboard/admin/tenants/page.tsx:64` (`Stripe:`).
- `any` casts on UI data: `tenants/page.tsx:37`, `community/page.tsx:145-148`,
  `landing-page/page.tsx:24`; every `catch (e: any)` in the platform dialogs toasts the raw
  error message.
- Sidebar (`components/app-sidebar.tsx:144-186`) is one flat group where Monetization alone
  owns 8 sub-items — the IA is bottom-heavy on billing. Consider Operate / Money / Configure
  groups like the platform sidebar now has.

## Suggested PR slicing

1. **Shell + primitives** (issues 1, 2, 3, 8, minor badges/banner): move `components/platform/{page-header,stat-strip,section,empty-state,badges}.tsx` to `components/dashboard/` and adopt them on every admin route. Mechanical but wide; screenshot every page.
2. **Loading skeletons** (issue 4) — small, independent.
3. **Primary actions + filters + a11y** (issues 5, 6, 7, 9) — one pass per page.
4. **Platform plans editor** (issue 10) — its own PR; touches server actions.
5. **Copy + i18n** — plurals, "platform" wording, untranslated strings.
