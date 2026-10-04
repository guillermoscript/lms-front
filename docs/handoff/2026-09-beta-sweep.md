# Handoff — 2026-09 beta sweep

Point-in-time handoff (2026-09-13). Everything an agent needs to pick up one workstream without re-running the sweep. The issues are the source of truth; this page is the map.

## What happened

A new-user walk of every persona loop on the test host (`preciopana.com`, **not real production** — every tenant there is the owner's test) using Playwright scripts against a throwaway school `qa-beta-mtz0te6l`.

**Every loop works end to end:** create school → course → lesson → publish; student sign-up → enrol → complete → certificate PDF → public verify; invitations (email + link, teacher role); exam with multiple choice + written answer → teacher override → student sees the grade; $5 manual payment → Contactado → Pago Recibido → Completado → transaction + revenue + enrolment; plan course limit; plan upgrade request by bank transfer.

**What's left is polish that a real Spanish-speaking user hits in the first hour:** English on `/es`, money formatting bugs, a lost purchase intent, missing feedback, and defaults a new school ships without noticing. 38 findings → 7 workstreams.

- Evidence and per-step notes: issue #723 (findings 1–38 in its comments) and the beta test plan artifact <https://claude.ai/code/artifact/1257ac7e-06d8-40fc-abdf-acfbb908664e>.
- Parent epic: #682.

## Workstreams

Each issue is self-contained (file:line, root cause, fix, acceptance). File ownership is split so **all seven can run in parallel** without merge conflicts.

| WS | Issue | Priority | Scope | Owns (don't touch from other WS) |
|---|---|---|---|---|
| WS1 | #724 | P1 | `/es` marketing pages English + invented numbers | `app/[locale]/(public)/page.tsx`, `platform-pricing/pricing-display.tsx`, `creators` copy, `lib/puck/components/lms/social-proof.tsx`, root catalog categories |
| WS2a | #725 | P1 | Student i18n: exam taker, exam result (+ English prose stored by `app/actions/exam-grading.ts`), payment button, proof upload, course card, theme toggle | `exam-taker.tsx`, `exams/[examId]/result/page.tsx`, `exam-grading.ts`, `manual-payment-button.tsx`, `shared/proof-upload.tsx`, `enrolled-course-card.tsx`, `enrollment-service.ts`, `mode-toggle.tsx` |
| WS2b | #726 | P1 | Admin/teacher i18n: product wizard, plan upgrade suite, limit banner, landing template picker, prompt templates, Base UI `<SelectValue />` raw values | `product-creation-wizard.tsx`, `plan-comparison-table.tsx`, `plan-change-dialog.tsx`, `payment-method-dialog.tsx`, `manual-transfer-form.tsx`, `limit-reached-banner.tsx`, `billing-dashboard-client.tsx`, `invite-user-dialog.tsx`, `course-form.tsx`, `lib/puck/templates/index.ts`, `template-picker.tsx`, `teacher/templates/page.tsx` |
| WS3 | #727 | P1 | Payments: `€` for every non-USD currency, $0 products run the manual flow, `manual - null`, Stripe ON by default, email promise nobody sends, admin dialog prefill, timezone mismatch | `manual-payment-dialog.tsx`, `payment-request-form.tsx`, `admin/payment-request-dialog.tsx`, `payment-settings-form.tsx`, `app/actions/payment-requests.ts`, `(public)/products/[productId]/page.tsx`, revenue page, currency call sites |
| WS4 | #728 | P1 | Routing: buyer loses the product after sign-up (`/auth/confirm` drops `next`), unknown URL → login, join-school blank paint, forgot-password title | `proxy.ts`, `auth/confirm/route.ts`, `join-school/*`, `auth/forgot-password/page.tsx` |
| WS5 | #729 | P2 | Missing toasts, React #418 date hydration, silent lesson un-complete, sidebar active item, "Básico" plan name, exams index 404 | `exam-builder-context.tsx`, course page tabs, `submission-review.tsx`, `certificate-template-context.tsx`, date render sites listed in the issue, `lesson-navigation.tsx`, `use-active-nav.ts`, `weekly-league.tsx` |
| WS6 | #730 | P2 | Defaults: starter placeholders publish as content, invented instructor bio, dead footer links + "LMS V2" banner, three CTA colours | `lesson-editor/starter-template.ts` + editor context, `(public)/courses/[id]/page.tsx`, `public/footer.tsx`, `powered-by-banner.tsx`, `navbar.tsx`, `school-landing-page.tsx`, `free-enroll-button.tsx`, `plan-enroll-button.tsx` |

## Status — 2026-09-13, all seven shipped as PRs

| WS | Issue | PR | State | Verification |
|---|---|---|---|---|
| WS1 | #724 | #734 | draft | typecheck · unit · build · `public-entry-ctas` + `i18n` (8 passed) |
| WS2a | #725 | #733 | draft | typecheck · unit · build · `student-exams` (9 passed) |
| WS2b | #726 | #736 | draft | typecheck · unit · build · `plan-limit-surfaces` + `plan-change` (7 passed, 1 failure that is also red on master) |
| WS3 | #727 | #731 | draft | typecheck · unit · build · `payment-flows` + `manual-payment-confirmation-rpc` (11 passed); `loop-3-student-pays` blocked by an expired Stripe test key |
| WS4 | #728 | #735 | **ready** | typecheck · unit · build · `auth-security` + `tenant-isolation` + `public-entry-ctas` (29 passed) + a new routing spec (17 passed) |
| WS5 | #729 | #732 | draft | typecheck · unit · build · `teacher-grading-queue` + `loop-2-student-learns` (7 passed) |
| WS6 | #730 | #737 | draft | typecheck · unit · build · `course-publishing` + `teacher-content` + `public-entry-ctas` (30 passed, 1 failure that is also red on master) |

Still outstanding for every draft PR: before/after screenshots in `/en` and `/es`. Two environment problems surfaced during verification and are not code defects:

- **The Stripe test key was the CLI's own 90-day session key** (from `stripe login`), wired into both `.env.local` and the `E2E_STRIPE_SECRET_KEY` secret, and it expired on 2026-09-13. Both now hold a dashboard test key for the LMS sandbox account `acct_1T6ALPItB7gRJWFf`, which does not expire. That account has **not** signed up for Connect, so `E2E_STRIPE_CONNECT_ACCOUNT` was cleared in both places and `loop-3-student-pays.spec.ts` now *skips* rather than fails; signing up at dashboard.stripe.com/connect and creating a test connected account restores it.
- **CI shard 2 is red on every one of these PRs, and on master before them** (run on 4cb0e2b4), for two environment reasons: the expired Stripe key above, and `invitations-send-accept.spec.ts`, which needs the Mailgun credentials still on the owner's list. The other 95 tests in that shard pass, as do shards 1, 3 and 4.
- **Two further specs are already red on master**, so they are pre-existing rather than sweep regressions: `plan-limit-surfaces.spec.ts` "joining the school is refused at the cap" (login never leaves `/auth/login` on the plan-limits tenant) and `teacher-content.spec.ts` "students tab shows per-student progress" (the predicate times out). Both deserve their own issue.

Two items were found during the work and left for their owning workstream:

- `lib/puck/templates/index.ts` still publishes invented figures (~line 423 "10,000 Students", ~702 "Join 12,000+ students") — noted on #726.
- The certificate-template save on #729 could not be reproduced: the confirmation exists in the code and the toast container is mounted globally, so it needs one manual check.

**Suggested order if run sequentially:** WS3 → WS4 → WS2a → WS2b → WS1 → WS5 → WS6 (money and lost purchases first, then what a student reads, then what an owner reads).

**Shared-file caveat:** every WS adds keys to `messages/en.json` and `messages/es.json`. Add keys in your own namespace block and rebase before merging; the catalogue parity unit test (#712) fails if a key exists on one side only.

## How to work a workstream

1. Branch `<type>/<slug>-<issue>` from `master` (e.g. `fix/manual-payment-currency-727`). One PR per issue; body closes the issue.
2. Reproduce locally in **`/es`**: `npm run dev`, `http://lvh.me:3000` (never `localhost`), accounts in `CLAUDE.md` (`owner@e2etest.com`, `student@e2etest.com`, `creator@codeacademy.com`, `alice@student.com` — all `password123`).
3. Before the PR: `npm run test:unit`, `npm run build`, plus the Playwright specs each issue names (`npx playwright test <spec> --workers=1`).
4. UI change → before/after screenshots in `/en` and `/es` on the PR.

### Automation gotchas learned in the sweep
- Base UI buttons ignore clicks that land before hydration; wait for `__reactProps$…` on the node, then use a real `locator.click()` — `el.click()` via `evaluate` silently no-ops on some buttons (the lesson complete toggle).
- Dialogs render as `[role="dialog"]` **outside** `<main>`; the dashboard has **two** `<main>` elements (use `.last()`).
- Base UI `<SelectValue />` shows the raw value unless the Select gets an `items` label map — that is the root of every raw "student"/"draft"/"contacted".
- The Chrome extension refuses sign-up/password entry; drive authenticated flows with Playwright.

## Owner-only actions (no agent can do these)

- [ ] **Mailgun env** on the Dokploy app service — nothing email-based works on the test host (invites say "correo no enviado" honestly; manual payment copy promises email — see WS3).
- [ ] **Supabase Auth email template**: use `{{ .RedirectTo }}` when email confirmation is turned back on (WS4). Email confirmation is **off on purpose** for now.
- [ ] **Cloudflare → Scrape Shield → Email Address Obfuscation: off.** Its `email-decode.min.js` throws on Student → Perfil and rewrites emails React rendered.
- [ ] **Dokploy MCP API key** is rejected (`Authentication failed`) — refresh `DOKPLOY_API_KEY`.
- [ ] Approve or cancel the pending Starter upgrade request of `qa-beta-mtz0te6l` in `/platform`; delete the QA school when no longer useful (5 courses, 4 users, 3 test products, 1 completed $5 manual sale).
- [ ] Stripe live prices in `platform_plan_prices` (Loop 4, pre-existing).

## Not verified in the sweep

- Landing page: template → editor → publish (automation couldn't open the editor; picker itself works). Check by hand.
- Stripe card purchase (test school has no Connect account).
- **AI tutor:** students have no in-app tutor; "Asistente de IA" only explains connecting Claude as a connector. Product decision, not a bug.

## Decisions recorded

- Existing test courses without a certificate template are fine; the certificate *flow* is verified working.
- Email verification off is intentional for now.
- Corrections to the raw findings: the admin payment-request status update **does** toast (`payment-request-dialog.tsx:103`); the certificate template save has a toast in code (WS5 item 3 is "reproduce first").
