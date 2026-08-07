# Product Analytics with OpenPanel — Analysis & Integration Plan

> Status: **implemented on `feat/openpanel-analytics`, inert pending credentials.** Written and built 2026-08-07.
> Phases 0–4 and the §9 P1 events are committed: 69 files, ~5,000 insertions, 8 commits. Typecheck clean, 849/849 unit tests, production build passes.
> **Credentials are configured** (`.env.local`, gitignored) against the self-hosted instance — project "LMS Platform" on `openpanel.guille.tech`. Ingest verified end-to-end (§8).
> **Groups are NOT supported by that instance** — per-school analysis uses the flat `tenant_id` property instead (§2.1).
> Not yet done: §10.2 MCP server, §10.1 mobile app, §6 phase 5 (dashboards), and a real browser-side smoke test with `npm run dev`.
> Scope: adding product analytics (OpenPanel) to the multi-tenant LMS so we can see how real users behave and make informed decisions.

---

## 0. TL;DR — the verdict

**OpenPanel is a genuinely good technical fit for this codebase.** Five reasons, each verified rather than assumed:

| Fit | Why it matters here |
|---|---|
| **Groups API** (`upsertGroup`/`setGroup`) | Maps 1:1 onto `tenants`. This is *the* feature that makes a multi-tenant SaaS analyzable — "which schools are healthy" instead of "which users clicked". Most cheap analytics tools lack it. |
| **Server-side SDK** with `clientId`/`clientSecret` | Non-negotiable here. Half our money events happen in webhooks and cron jobs with **no browser attached** (Solana has no redirect at all). |
| **1.7 KB gzipped** core tracker | Measured, not marketing: `@openpanel/web@1.4.1` `dist/index.js` gzips to 1,693 bytes. rrweb (session replay) is a **separately code-split 185 KB chunk**, only fetched if replay is enabled. |
| **Cookieless by default** | No consent banner needed. This repo currently has **no cookie banner and no CSP**, so adding a cookie-based tool would create a compliance task; OpenPanel does not. |
| **MIT-licensed SDKs** | The *server* is AGPL-3.0, but `@openpanel/nextjs`, `@openpanel/web`, `@openpanel/sdk` are all **MIT** with a zero-dependency core. No copyleft reaches our app. |

**But the honest finding is about timing, not tooling.**

Production today: **7 tenants · 17 users · 0 transactions · 10 lesson completions all-time.**

At n=17, no funnel, cohort, or retention chart will tell you anything statistically real. Analytics does not create insight at this scale — it creates dashboards that render "1".

That is **not** an argument to wait. It's an argument to instrument *narrowly and now*:

1. **Retrofitting is the expensive part.** 119 pages, 60 API routes, 264 client components. Threading events through that later, under launch pressure, is far worse than adding ~25 well-chosen events today.
2. **At n=17, session replay beats funnels.** You can literally watch all seventeen people use the product. That is the highest-information-per-dollar research available to you right now, and it's the thing you cannot do retroactively — un-recorded sessions are gone forever.
3. **Day-1 launch data must be trustworthy.** Pipelines are always wrong at first (wrong tenant id, double-fired events, missing identify). You want those bugs found at n=17, not during the launch you'll be trying to read.

**Recommendation: build the thin slice — ~25 events, server-side-first, behind a swappable wrapper. Not a 100-event taxonomy.** Details in §4–§6. Expected effort: **3–5 focused days** for the core loops, phased so most of it runs in parallel; ~3 more days for the wider surfaces in §9–§10.

**You already self-host OpenPanel on a shared server** (§8), so this is a new project on existing infrastructure: no new bill, no new infra, data stays yours. One blocking pre-check — **confirm that instance is new enough to have the Groups feature**, since §2.1 rests entirely on it.

Beyond the web app, two surfaces are entirely dark and worth their own issues: the **MCP server's ~92 tools** (§10.2 — one middleware hook, best insight-per-hour here) and the **`lms-app` Expo client** (§10.1).

---

## 1. What exists today (the starting point)

There is **no product analytics of any kind** in this repo. What exists is *operational* telemetry, which answers different questions:

| Tool | File | Answers | Does NOT answer |
|---|---|---|---|
| Sentry | `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts` | "Did it crash?" | "Did anyone use it?" |
| Langfuse / OTEL | `instrumentation.ts`, `@langfuse/tracing` | "What did the LLM cost / do?" | "Did the feature drive retention?" |
| In-app DB reporting | `app/[locale]/dashboard/admin/analytics/`, `.../teacher/courses/[courseId]/analytics/`, `app/[locale]/platform/*` | Current *state* (counts, revenue totals) | *Behaviour over time* — where people drop off, what they tried and abandoned |

That third row is the important distinction. You already compute plenty of numbers from Postgres. What you cannot get from the database is **the negative space**: the student who opened checkout and left, the admin who visited `/monetization` four times and never connected Stripe, the visitor who read `/pricing` twice and bounced. Those events are never written to a table. That is exactly the gap product analytics fills — and it's the gap that matters most pre-launch, because *failed* attempts are where the product is broken.

### Existing constraints (verified)

| Constraint | Finding | Consequence |
|---|---|---|
| **CSP** | `next.config.ts` defines **no `headers()` and no CSP at all** | No script allowlisting needed. (Separately: worth adding a CSP someday — out of scope here.) |
| **Adblocker precedent** | Sentry already tunnels via `tunnelRoute: "/monitoring"` | Proven pattern. Do the same for OpenPanel via `createRouteHandler()`. |
| **Proxy interception** | `proxy.ts:536-539` matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `monitoring`, images — **nothing else** | ⚠️ An `/api/op` route **will be intercepted** by tenant/auth middleware and likely 307'd to `/join-school`. **Must add to the exclusion list.** The Sentry config comment at `next.config.ts:66-69` warns about precisely this failure mode. |
| **Deployment** | `output: 'standalone'`, Docker, Dokploy | Self-hosting OpenPanel later is operationally realistic (Dokploy is an officially documented target). |
| **PII** | `profiles` has **no `email` column** | Convenient: the path of least resistance is already the privacy-safe one. Send `profileId` = auth user id, never email. |
| **Consent** | No cookie banner, no consent management found | OpenPanel's cookieless default keeps it that way. Don't enable anything that changes this without a legal review. |

---

## 2. Architecture decisions

### 2.1 Groups = tenants — ⚠️ NOT AVAILABLE on this instance

> **Verified 2026-08-07 against `openpanel.guille.tech`: Groups are not supported by this build.**
> The ingest validator rejects `{"type":"group"}` and enumerates everything it *does* accept:
> `track · identify · increment · decrement · alias · replay`. There is no Groups section in the dashboard nav either.
> **`ANALYTICS_GROUPS_DISABLED=true` is set.** `upsertGroup()` / `setGroup()` fail soft by design, so tracking is unaffected.

**What we use instead:** every event carries a flat `tenant_id` property (and `tenant_slug`), injected by the wrapper. This was always in the design as belt-and-braces; it is now the primary mechanism rather than the backup.

**What still works:** filtering any chart to one school, breaking any metric down by school, and every funnel in §4 — because those operate on event properties. In practice this covers nearly all of §5's decision questions.

**What is lost:** group-level *entities* — a School object with its own properties (plan, created_at) and its own aggregate profile, plus "show me schools ranked by X" as a first-class view. Those must be reconstructed by breaking down on `tenant_id`, which is clumsier and won't carry school metadata automatically. Mitigation: `school_created` and `plan_changed` stamp `plan` onto events, so plan-level segmentation survives.

**To upgrade later:** update the self-hosted instance to a build with Groups, remove `ANALYTICS_GROUPS_DISABLED`, and the already-written `upsertSchoolGroup()` calls start working with no code change. The original design is preserved below for that day.

#### The original design (re-enable when the instance supports it)

```ts
// A school is a group; every event a member fires is attributed to it.
op.upsertGroup({
  id: tenantId,
  type: 'school',
  name: tenant.name,
  properties: { plan: 'starter', locale: 'es', created_at: tenant.created_at },
});
op.setGroup('school', tenantId);
```

Without this you get "1,400 lesson views" — useless. With it you get **"Escuela X published 3 courses, enrolled 40 students, and hasn't connected Stripe"** — which is an action.

Every event should *also* carry `tenant_id` as a flat property, not only as a group. Groups are for account-level rollups; the flat property is what you filter and break down charts by, and it survives if you ever migrate tools.

### 2.2 One project, not one-per-tenant

Use a **single OpenPanel project** for platform-wide analytics. You are the platform owner; you need cross-tenant views, and per-tenant projects would make "compare schools" impossible.

> **Product opportunity worth noting:** OpenPanel bills per *event*, not per seat, and allows **unlimited projects**. That means "analytics for your school" could later become a **sellable feature of the Pro/Business plans** — a second, per-tenant project whose data the school admin sees. That is a genuine business case, but it is a *product feature*, architecturally separate from your internal instrumentation. Do not conflate the two now.

### 2.3 Server-side first — this is not the default advice, and here it's correct

Standard analytics advice is "track in the browser". **For this codebase that would produce wrong revenue numbers.** Per `CLAUDE.md` and the route inventory:

- **Solana has no webhook and no redirect.** `/api/billing/webhook/solana` 404s by design; the QR page polls `/api/billing/solana/verify`. The browser may be closed when payment settles.
- **Manual/offline payments settle asynchronously** — a student files a `payment_requests` row, an admin confirms it *hours or days later* (`app/actions/payment-requests.ts:262 confirmPaymentReceived`). There is no student browser in the room.
- **Stripe/PayPal/Binance settle in webhooks** — `app/api/stripe/webhook`, `app/api/payments/webhook/[provider]`, `app/api/billing/webhook/[provider]`.
- Adblockers eat 10–30% of browser-side revenue events. You cannot run a business on that.

**Rule: anything involving money, entitlement, or account lifecycle fires from the server. The browser tracks only intent and UI interaction.**

### 2.3b The exception — events with no server chokepoint

The rule above has a limit that falls directly out of this repo's architecture. `CLAUDE.md`: *"RLS for data security — database queries go directly from components, not through server actions."* Server actions are reserved for multi-step mutations and external API calls.

**Consequence: several business-meaningful writes happen from the browser via direct RLS inserts or SECURITY DEFINER RPCs, with no server code path to hook.** Verified examples:

| Write | Where | Mechanism |
|---|---|---|
| Lesson completion | `…/lessons/[lessonId]/lesson-navigation.tsx:154` | direct `.insert()` on `lesson_completions` |
| Subscription self-enrollment | `lib/hooks/use-enrollment.ts` | `self_enroll_subscription_course` RPC |

For these, the choice is:

- **(a) Track client-side and accept the loss.** Adblockers cost 10–30%; the `/api/op` first-party proxy recovers most of it. Fine for *engagement* metrics, where trend matters more than absolute truth.
- **(b) Add a server action purely to host the event.** Buys accuracy at the cost of an extra round trip and a deviation from the documented RLS-direct pattern.
- **(c) Read them from Postgres instead.** These writes *do* land in tables you own — so nightly aggregates remain the authoritative source, with OpenPanel used for the behavioural context around them.

**Recommendation: (a) for engagement, (c) as the reconciliation check, and (b) only if a specific number turns out to drive a specific decision.** Do not restructure the data layer for analytics — that trade is not worth it, and it would fight the architecture the whole app is built on.

The corollary matters for how you *read* the dashboards: **OpenPanel is for behaviour and drop-off, Postgres stays the source of truth for money and entitlement.** If the two disagree on revenue, Postgres is right. Say this out loud now, or someone will quote an OpenPanel revenue chart in a decision six months from now.

### 2.4 The swappable wrapper (most important engineering decision)

**Never import `@openpanel/*` outside one file.** OpenPanel is a young, single-maintainer project (§7). The cost of that risk collapses to near zero if the vendor lives behind one module.

```ts
// lib/analytics/server.ts
import { OpenPanel } from '@openpanel/nextjs';

const op = process.env.OPENPANEL_CLIENT_SECRET
  ? new OpenPanel({
      clientId: process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID!,
      clientSecret: process.env.OPENPANEL_CLIENT_SECRET,
    })
  : null; // no-op in dev/CI — never let analytics break a request

type Ctx = { userId?: string; tenantId?: string; locale?: string; role?: string };

export async function track(name: string, props: Record<string, unknown>, ctx: Ctx) {
  if (!op) return;
  try {
    await op.track(name, { ...props, tenant_id: ctx.tenantId, locale: ctx.locale, role: ctx.role, profileId: ctx.userId });
  } catch (err) {
    // Analytics must NEVER break a payment webhook. Swallow + breadcrumb only.
    Sentry.addBreadcrumb({ category: 'analytics', level: 'warning', message: String(err) });
  }
}
```

### ⚠️ The guard must wrap the BLOCK, not just the call — learned the hard way

`track()` being self-guarding is **not sufficient**, and assuming it was produced a real bug during implementation. The danger isn't the `track()` call anyone is thinking about; it's the innocuous line next to it:

```ts
// BROKEN — shipped, and failed product creation when the read failed
const { count } = await adminClient.from('lessons').select(…)   // ← unguarded
await track('course_published', { lesson_count: count ?? 0 }, ctx)

// ALSO BROKEN — arguments evaluate BEFORE track() runs, so its catch can't help
await track('product_created', props, { userId: await getCurrentUserId(), … })
```

Two hazards, both invisible at a glance: **analytics-only reads** used to populate properties, and **awaits in the argument list**. Four independent agents each wrote one, despite "analytics must never break a request" being the first stated constraint — because the rule points at the wrong line.

Hence `safeAnalytics(fn, label)` in `lib/analytics/server.ts`. **Wrap the whole block, every time:**

```ts
await safeAnalytics(async () => {
  const { count } = await adminClient.from('lessons').select(…)
  await track('course_published', { lesson_count: count ?? 0 }, ctx)
}, 'course_published')
```

The generalisable lesson: a safety guarantee has to live in a wrapper people are forced to use, not in a rule they're asked to remember.

Three further non-negotiables encoded above:

1. **Fails open.** A `try/catch` around every call. A webhook that 500s because the analytics vendor is down will cost you real money and real enrollments.
2. **No-ops without credentials.** Dev, CI, and Playwright must not emit events — otherwise your funnels fill with `student@e2etest.com` running the same purchase 300 times.
3. **Context is injected, never guessed.** `tenant_id` comes from `getCurrentTenantId()` / the webhook's own resolution, not from a header a client can forge.

---

## 3. Where the integration points are

### 3.1 Client bootstrap

`app/[locale]/layout.tsx` already nests `ThemeProvider` → `TenantProvider` → `NextIntlClientProvider`. Mount `<OpenPanelComponent>` inside, where tenant and locale are known:

```tsx
<OpenPanelComponent
  clientId={process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID!}
  trackScreenViews          // App Router route changes
  trackOutgoingLinks
  apiUrl="/api/op"          // first-party proxy, beats adblockers
  scriptUrl="/api/op/op1.js"
  globalProperties={{ tenant_id: tenantId, tenant_slug: slug, locale }}
/>
```

Plus `app/api/op/[...path]/route.ts` exporting `createRouteHandler()`.

> ⚠️ **Then add `op` to the `proxy.ts:537` matcher exclusion**, alongside `monitoring`. Without this, every event 307s into the tenant-membership redirect and you'll debug "no data" for an afternoon.

### 3.2 Identify + group

Server-rendered, in the dashboard layout where the session is already resolved (no extra `getUser()` call — `proxy.ts` sets `x-user-id`):

```tsx
<IdentifyComponent profileId={userId} properties={{ role, tenant_id: tenantId, locale }} />
```

Never send email or name. `profiles` has no email anyway.

### 3.3 Server events

`lib/analytics/server.ts` (§2.4), called from server actions, route handlers, and webhooks. Concentrated in `app/actions/**` (~170 exported actions, but only ~20 are business-meaningful) and the payment/billing/cron routes.

---

## 4. The event taxonomy

**Convention:** `object_verb`, snake_case, past tense (`checkout_completed`, not `completeCheckout`). Properties snake_case. Every event automatically carries `tenant_id`, `locale`, `role`, `profileId` via the wrapper — never re-declare them per event.

Organised by the five loops that actually determine whether this business works.

### Loop A — Acquisition (visitor → school owner) · *platform growth*

| Event | Fires from | Key properties |
|---|---|---|
| `landing_viewed` | auto screen view, `app/[locale]/(public)/page.tsx` | `referrer`, `utm_*` |
| `pricing_viewed` | auto, `/pricing`, `/platform-pricing` | `plan_highlighted` |
| `school_signup_started` | `/create-school` client | `source` |
| `school_created` | **server** — `app/actions/onboarding.ts:19 createSchoolForUser` | `plan`, `referral_code`, `time_to_create_ms` |
| `onboarding_step_completed` | `/onboarding` client | `step`, `step_index` |
| `onboarding_completed` | **server** — `app/actions/onboarding.ts:76 completeOnboarding` | `duration_ms`, `steps_skipped` |
| `join_school_requested` | **server** — `app/actions/join-school.ts:14` | `via_invite` |

*Question answered:* where does school signup leak? PRODUCT.md targets sub-5-minute setup (`#432`) — `time_to_create_ms` and `onboarding_step_completed` make that claim measurable instead of aspirational.

### Loop B — School activation (owner → publishable, sellable school) · **the highest-leverage loop**

A school that never publishes a course and never connects payments will never generate revenue. This loop is where a B2B SaaS lives or dies, and it is **completely invisible in your current DB reporting** — you can see that a school *has* zero courses, but not that its owner opened the course editor three times and gave up.

| Event | Fires from | Key properties |
|---|---|---|
| `course_created` | **server** — `app/actions/teacher/courses.ts:107` | `course_id`, `via` (`manual` \| `ai` \| `template`) |
| `course_ai_generation_started` / `_completed` | **server** — `app/actions/admin/ai-course.ts:70 generateStarterCourse` | `duration_ms`, `lesson_count`, `success` |
| `lesson_created` | **server** — `app/actions/teacher/lessons.ts:19` | `lesson_id`, `block_count` |
| `course_published` | **server** — `app/actions/teacher/courses.ts:187 updateCourse` (writes `status`, ~`:226`) | `course_id`, `lesson_count`, `days_since_course_created` |
| `product_created` | **server** — `app/actions/admin/products.ts:92` / `:405 saveProductCreationWizard` | `price`, `currency`, `provider`, `is_free` |
| `payment_provider_connected` | **server** — `app/actions/admin/settings.ts` (Solana/Binance), `app/api/stripe/connect` | `provider`, `is_first_provider` |
| `landing_page_published` | **server** — `app/actions/admin/landing-pages.ts:262` | `via_ai`, `block_count` |
| `landing_ai_generate_clicked` | client, Puck builder | `prompt_length` |
| `school_activated` | **derived** — first time a school has ≥1 published course **and** ≥1 connected provider | `days_since_school_created` |

`school_activated` is your **activation metric**. Fire it exactly once per tenant (guard on a `tenant_settings` flag) — it's the single number that best predicts platform revenue.

> ⚠️ **`course_published` needs transition detection.** `updateCourse` is a generic save that happens to write `status`. Firing on every call would emit `course_published` each time an already-live course is edited, inflating activation. Read the prior status and fire only on `draft → published`. Same applies to `landing_page_published` (`activateLandingPage` and `publishLandingPage` both set `is_published: true`, at `:277` and `:302` — two paths, one event, easy to double-count).

> Ties directly to shipped work: PR #617 gated checkout/publish on **Connect readiness, not account presence**. `payment_provider_connected` with `is_first_provider` tells you how many owners stall at exactly that gate — the thing that issue was about.

### Loop C — Monetization (student → payment → entitlement) · *the money loop*

**All revenue events are server-side.** See §2.3.

| Event | Fires from | Key properties |
|---|---|---|
| `product_viewed` | client — `/(public)/products/[productId]`, `/courses/[id]` | `product_id`, `price`, `currency` |
| `checkout_started` | **server** — `app/api/payments/checkout`, `app/api/stripe/create-payment-intent` | `provider`, `amount`, `currency`, `product_id` \| `plan_id` |
| `course_self_enrolled` | **client** — `lib/hooks/use-enrollment.ts` (`self_enroll_subscription_course` RPC) | `course_id`, `source: 'subscription'` |
| `checkout_abandoned` | **derived** (nightly job: `checkout_started` with no terminal event in 24h) | `provider`, `amount` |
| `payment_succeeded` | **server** — `lib/payments/webhook-dispatch.ts` (`dispatchBillingEvent`, :60), `app/api/billing/solana/verify`, and `app/actions/payment-requests.ts:324 completeAndEnroll` | `provider`, `amount_major`, `currency`, `is_subscription`, `platform_fee`, `school_percentage_snapshot` |
| `payment_failed` | **server** — webhook failure branches | `provider`, `failure_reason` |
| `entitlement_granted` | **server** — after `enroll_user()` RPC | `source_type`, `course_count` |
| `refund_issued` | **server** — refund handlers | `is_partial`, `refunded_amount`, `net_amount` |
| `manual_payment_requested` / `_confirmed` | **server** — `app/actions/payment-requests.ts:86` / `:262` | `hours_to_confirm` |

> ⚠️ **`course_self_enrolled` is a genuine hole in the money loop.** Subscription holders self-enroll from `components/student/browse-course-card.tsx:32` → `useEnrollment()` → the `self_enroll_subscription_course` SECURITY DEFINER RPC. **This never touches checkout, any server action, or any API route.** Without this event, subscription-driven course access is invisible and Loop C undercounts value delivered — you'd conclude plans aren't being used when they are.

**Five correctness traps — the first three from `CLAUDE.md`, the last two found during implementation:**

1. **Partial refunds keep `status = 'successful'`** (since #547). Any revenue property must use `amount - refunded_amount` (`netOfRefunds()` in `lib/payments/payouts-owed.ts`). Sending gross `amount` will overstate revenue in OpenPanel exactly the way it did on the school-facing screens before #547 — the same bug, in a new place.
2. **Platform fee comes from `ProviderCapabilities.bearsPlatformFee` + the transaction's own `school_percentage_snapshot`** — *never* `revenue_splits.applies_to_providers` (retired in #547). Getting this wrong makes your analytics disagree with your payouts.
3. **Manual payments break session attribution.** The confirmation runs hours after the student's session ended, from an *admin's* request context. Two mandatory precautions: attribute to the **student's** `profileId` (not the admin's), and pass an explicit `timestamp` of the original request — otherwise the sale lands in the wrong day's cohort and looks like the admin bought it. (`track()` supports this via `AnalyticsContext.timestamp` → `__timestamp`, `lib/analytics/server.ts:57`.) Carry `original_requested_at` as a property too — the confirmation lag is the operational cost of the manual rail, and nothing measures it today.

4. **Instrument the dispatcher, not the routes.** `app/api/payments/paypal/capture/route.ts:117` and `app/api/payments/webhook/paypal` *both* call `dispatchBillingEvent` for the same capture. The dispatcher is idempotent (`.eq('status','pending')` — only one flip wins); a `track()` at either route is not, so route-level instrumentation emits `payment_succeeded` **twice per PayPal sale**, and the same for Binance. The status-flip guard is the correctness boundary — put the event inside it. Bonus: it also catches a capture whose webhook never arrives.

5. **Manual `payment_succeeded` belongs at `completeAndEnroll` (`app/actions/payment-requests.ts:324`), not `confirmPaymentReceived` (:262).** The latter only flips the request to `payment_received` and grants nothing; the transaction row and entitlement are created at :324. `manual_payment_confirmed` is the correct event for :262.

Also: `transactions` has **no `created_at`** — it's `transaction_date`. Relevant if you ever backfill history into OpenPanel.

### Loop D — Learning engagement (does the product actually teach?) · *retention*

This is the loop that determines whether schools *renew*. It's also the highest-volume, so it needs throttling.

| Event | Fires from | Key properties |
|---|---|---|
| `lesson_viewed` | client — `/dashboard/student/courses/[courseId]/lessons/[lessonId]` | `lesson_id`, `course_id`, `position` |
| `lesson_completed` | **client** — `…/lessons/[lessonId]/lesson-navigation.tsx:154` (direct RLS insert) | `lesson_id`, `time_on_lesson_ms`, `is_sequential` |
| `lesson_uncompleted` | **client** — same file, `:95` (delete branch) | `lesson_id` |
| `video_progress` | client, **throttled to 25/50/75/100% only** | `percent`, `lesson_id` |
| `checkpoint_attempted` | **server** — `app/api/lesson-checkpoints/[checkpointId]/attempt` | `is_correct`, `attempt_number` |
| `exercise_submitted` | **server** — `app/api/exercises/artifact/evaluate` | `exercise_id`, `score`, `attempt_number` |
| `exam_submitted` | **server** — `create_exam_submission` RPC call site | `exam_id`, `question_count` |
| `exam_graded` | **server** — `app/api/teacher/exams/[examId]/grade` | `score`, `passed`, `graded_by` (`ai` \| `human`), `duration_ms` |
| `ai_tutor_message_sent` | **server** — `app/api/chat/aristotle` | `message_index`, `session_id` |
| `certificate_issued` | **server** — `app/api/certificates/issue` | `course_id`, `days_to_complete` |
| `course_completed` | **server** — on 100% progress | `course_id`, `days_to_complete`, `completion_path` |
| `community_post_created` | **server** — `app/actions/community.ts:40` | `has_poll`, `course_scoped` |

> ⚠️ **Volume discipline.** Do **not** emit a video heartbeat every 5s, or scroll depth, or every keystroke in the AI tutor. A learning platform can generate 10× the events of a normal SaaS. Four video milestones instead of per-second heartbeats is the difference between a $20/mo bill and a $350/mo bill — and the heartbeats answer no question the milestones don't.

### Loop E — Platform revenue (school → upgrade → churn) · *your income*

| Event | Fires from | Key properties |
|---|---|---|
| `plan_limit_hit` | **server** — `checkCourseLimit`, `app/api/cron/enforce-plan-limits` | `limit_type`, `plan`, `current`, `max` |
| `upgrade_page_viewed` | client — `/dashboard/admin/billing/upgrade` | `current_plan`, `triggered_by_limit` |
| `plan_change_previewed` | **server** — `app/actions/admin/billing.ts:528 previewPlanChange` | `from_plan`, `to_plan`, `proration` |
| `plan_changed` | **server** — `:584 changePlan` | `from_plan`, `to_plan`, `is_upgrade`, `provider` |
| `platform_payment_succeeded` | **server** — `app/api/billing/webhook/[provider]`, `billing/solana/verify` | `provider`, `amount`, `interval`, `is_renewal` |
| `subscription_cancel_scheduled` | **server** — `:665 cancelSubscription` | `plan`, `days_subscribed`, `reason` |
| `subscription_reactivated` | **server** — `:736` | `days_since_cancel` |
| `subscription_expired` | **server** — `app/api/cron/expire-platform-subscriptions` | `plan`, `was_grace` |

`plan_limit_hit` → `upgrade_page_viewed` → `plan_changed` is your **monetization funnel**, and it's the one that most directly moves your revenue. It tells you whether the free-tier limits (5 courses / 50 students) are set correctly — too loose and nobody upgrades, too tight and they churn before activating.

Note `is_renewal` on `platform_payment_succeeded`: per `CLAUDE.md`, crypto rails have **no subscription object** — a second checkout on the same rail *is* a renewal. Without that flag, renewals will read as new sales and inflate your growth numbers.

---

## 5. What this lets you answer that you currently cannot

Concrete decision questions, mapped to the events above:

1. **"Why don't schools launch?"** — Loop B. If `course_created` ≫ `course_published`, the editor is the problem. If `course_published` ≫ `payment_provider_connected`, payment setup is the problem. Two very different roadmaps; today you can't distinguish them.
2. **"Which payment provider should we invest in?"** — `checkout_started` → `payment_succeeded` conversion, split by `provider`. If Solana starts 40 checkouts and completes 3, the QR/polling UX is broken — and you'd never see it in the DB, because abandoned Solana checkouts leave only a stale `platform_payment_requests` row.
3. **"Is the free tier converting or just absorbing cost?"** — Loop E funnel, broken down by group.
4. **"Do LATAM (es) and English users behave differently?"** — every event carries `locale`. Given the dual-market strategy in PRODUCT.md, this is a first-class question, and right now it's unanswerable.
5. **"Is the AI course generator worth its OpenAI bill?"** — `course_created{via:'ai'}` → `course_published` vs `via:'manual'` → `course_published`. Pair with Langfuse cost data.
6. **"Which schools are about to churn?"** — group-level engagement decline. Feeds directly into the existing `getAtRiskTenants` in `app/actions/platform/billing-health.ts`, which today can only see billing state, not usage decay.

---

## 6. Phased plan

Phases 1–3 are largely independent and parallelize well across agents/sessions.

| Phase | Work | Effort |
|---|---|---|
| **0 — Spike** | **Verify the self-hosted instance supports Groups (§8) — blocking.** New project on the existing instance, `@openpanel/nextjs`, `<OpenPanelComponent>` + `/api/op` proxy, **add `op` to the `proxy.ts` matcher**, verify one event lands from `lvh.me`. | 0.5d |
| **1 — Foundation** | `lib/analytics/{server,client}.ts` wrapper (fails open, no-ops without creds). Identify + `upsertGroup`/`setGroup`. **Traffic exclusion: super admins, `/platform/*`, E2E accounts, impersonation sessions (§9.6).** `.env.example` entries. Unit test that the wrapper swallows a throwing transport. | 1d |
| **2 — Money loop** (Loop C + E) | Server events in webhooks, checkout routes, billing actions, crons. Use `netOfRefunds()`. Handle the manual-payment timestamp/attribution trap. | 1–1.5d |
| **3 — Activation loop** (Loop B) | Course/product/provider/landing events + the derived `school_activated` guard. | 1d |
| **4 — Engagement** (Loop D) | Lesson/exercise/exam/AI events, **with throttling**. | 1d |
| **5 — Read the data** | Dashboards for the 5 loops, funnels, 2–3 alerts. Wire the OpenPanel MCP server into Claude Code **if your self-hosted build exposes `/mcp`** (§8). | 0.5d |
| **6 — Wider surfaces** (independent) | §9 P1 events: auth errors, gamification/streaks, editor abandonment, browse zero-results. | 1d |
| **7 — MCP server** (independent, own issue) | One middleware hook, ~4 events, own env vars. Highest insight-per-hour of anything here. | 0.5d |
| **8 — Mobile** (independent, other repo) | `@openpanel/react-native` in `../lms-app`, same project, `platform` property, **identical event names**. | 1d |
| ~~Self-host~~ | Already done — you're running it. | — |

Enable **session replay** in phase 0, sampled at 100%. At 17 users that's your best research tool; drop the rate before launch.

---

## 7. Risks — the honest list

| Risk | Severity | Assessment & mitigation |
|---|---|---|
| **Bus factor of 1** | 🔴 **Highest** | `lindesvard` has **1,510 commits; the next contributor has 6.** This is one person's project (32 contributors, but a long tail of typo fixes). If they stop, you own an AGPL server. **Mitigation: §2.4 wrapper.** Vendor swap becomes a one-file change. Do not skip this. |
| **Young project** | 🟡 | Created Feb 2024, 6.3k stars, **no published GitHub releases**, last push 2026-07-06 (a month before writing). Not dead, not hyperactive. |
| **Session replay on rrweb alpha** | 🟡 | `rrweb@2.0.0-alpha.20`. Alpha dependency in a replay path. Contained: it's a lazily-loaded separate chunk, and replay is optional. Don't make it load-bearing. |
| **Subdomain session splitting** | 🟡 | Cookieless tracking derives identity per-origin. A user crossing `school-a.platform.com` → `school-b.platform.com` may register as two sessions. Mostly fine (they're arguably two contexts) but **will distort platform-level funnels** that span the apex domain and a tenant subdomain — notably `landing_viewed` → `school_created`. Verify in phase 0; `identify()` on both sides mitigates it. |
| **Analytics breaking payments** | 🔴 if unhandled | A `await op.track()` inside a Stripe webhook that hangs = failed webhook = lost enrollment. **Mitigation: try/catch + timeout, non-blocking, mandatory.** This is the one bug that would cost real money. |
| **Event volume surprise** | 🟢 | Only if Loop D throttling is skipped. See §4 Loop D warning. |
| **Instrumenting a product with no users** | 🟡 | Real, and the reason for the thin slice. Guard against gold-plating: **if an event doesn't map to a decision in §5, don't add it.** |
| **AGPL server** | 🟢 | Only binds if you modify and offer OpenPanel *itself* as a service. Self-hosting for internal use is fine; SDKs are MIT. Not a practical concern. |

---

## 8. Deployment: you already self-host — what changes

**You already run a self-hosted OpenPanel on a large shared server hosting other projects.** That settles the biggest open question and changes four things. The cloud-vs-self-host analysis below is retained only as background.

| Changes | Detail |
|---|---|
| **Marginal cost ≈ $0** | Create a new *project* in the existing instance. No new bill, no new infra. The §4 Loop D throttling advice **softens** — but see the caveat below. |
| **Data residency resolved** | The §9 concern about behaviour data leaving your infrastructure is void. LATAM/minors compliance is materially easier. |
| **Better adblocker story** | `scriptUrl` already points at your own domain, not a known-tracker host. Still route through `/api/op` so it's fully first-party to the tenant domain. |
| **You own retention** | Nobody deletes your data at 6 months. You must set a ClickHouse TTL yourself, or disk grows forever. |

### The three self-hosting gotchas — all now RESOLVED against the live instance

Project **"LMS Platform"** created in org `guille-tech` on 2026-08-07. Website + Backend/API clients enabled. Domain `https://preciopana.com`, allowed domains `https://preciopana.com` and `https://*.preciopana.com` (every school is a subdomain). Pipeline verified end-to-end: a `track` and an `identify` posted with the real credentials returned HTTP 200 and appeared in the dashboard with the profile correctly bound.

1. **Groups: NOT supported.** ❌ Confirmed by the validator's own error (see §2.1). `ANALYTICS_GROUPS_DISABLED=true`; flat `tenant_id` carries per-school analysis. **Session replay IS supported** — `replay` appears in that same accepted-types list.
2. **MCP: NOT exposed.** ❌ `POST https://openpanel.guille.tech/api/mcp` → `404 {"message":"Route POST:/mcp not found"}`. The §6 phase-5 "ask Claude Code about your analytics" step does not apply to this instance; read the dashboards directly.
3. **Noisy-neighbour risk: still live.** ⚠️ Shared server, so this project's events compete with your other six for ClickHouse and worker capacity. **Volume discipline still applies** — the reason is just "the other projects on that box" rather than a bill. Keep video at 4 milestones; set a ClickHouse TTL (12–24 months); scale `OP_WORKER_REPLICAS` if ingestion lags.

### Confirmed instance URLs

| Setting | Value | Note |
|---|---|---|
| Ingest API | `https://openpanel.guille.tech/api` | `NEXT_PUBLIC_OPENPANEL_API_URL` |
| Tracker script | `https://openpanel.dev/op1.js` | ⚠️ **the vendor CDN, not your instance** |
| Dashboard | `https://openpanel.guille.tech/guille-tech/lms-platform` | |

That second row is the self-hosting trap the foundation work anticipated: `createRouteHandler({apiUrl})` redirects only the *ingest* leg, and this instance's own snippet still loads the script from `openpanel.dev`. So **`NEXT_PUBLIC_OPENPANEL_SCRIPT_ORIGIN` stays empty** — `/api/op` fetches the CDN script server-side and re-serves it first-party, which keeps the browser talking only to `preciopana.com`.

### Background: cloud vs self-host

| Scale | Events/mo (est.) | Cloud | Self-host |
|---|---|---|---|
| Today (17 users) | <10k | **$2.50–5** | ~$20–40 VPS + ops |
| 100 active users | ~30k | **$20** | ~$40 + ops |
| 1,000 active users | ~300k | **$30–50** | ~$40 + ops |
| 10,000 active users | ~3M | $180–250 | ~$80 + ops |

*(Estimate basis: an engaged learner generates ~200–300 events/month at the Loop D throttling recommended above.)*

**Use cloud.** Self-hosting means running six containers (Postgres, Redis, ClickHouse, API, dashboard, worker) needing 4–8 GB RAM, plus backups, upgrades, and ClickHouse disk growth — to save roughly $20/month at your scale. That is a bad trade for a team that should be shipping the LMS.

The crossover is somewhere past **~1M events/month**, and even then the saving is mostly eaten by ops time. Migration later is cheap: same SDK, change `apiUrl`. Dokploy is an officially documented target and you already run it.

> One caveat worth stating plainly: cloud means user behaviour data leaves your infrastructure. For a LATAM-facing education product handling minors' data, check whether that's acceptable before phase 0. If it isn't, self-host from day one and accept the ops cost — that's a compliance decision, not an economic one.

*(Moot in practice — see §8 above. Kept for the record and in case the shared instance is ever retired.)*

---

## 9. Coverage map — every surface, what it needs, and what's noise

The §4 taxonomy covers the five revenue-critical loops. This section sweeps **everything else** so the decision to skip a surface is deliberate rather than accidental.

Priority: **P0** = phases 2–4, load-bearing · **P1** = worth adding once P0 is stable · **P2** = only if a question demands it · **skip** = deliberately not tracked.

### 9.1 Public / marketing

| Surface | Pri | Events | Why |
|---|---|---|---|
| `/(public)/page.tsx` (landing) | P0 | `landing_viewed` | Covered — Loop A |
| `/(public)/courses`, `/courses/[id]` | **P0** | `catalog_viewed`, `course_detail_viewed` `{course_id, is_free, price}` | Top of the student funnel. Anonymous → paid starts here. |
| `/(public)/courses/[id]/lessons/[lessonId]` | **P0** | `public_lesson_previewed` `{course_id, lesson_id}` | **Highest-value under-tracked page.** This is the free-sample conversion lever (#426). Preview→purchase rate is the single best test of whether your course pages sell. |
| `/(public)/products`, `/products/[productId]` | P0 | `product_viewed` | Covered — Loop C |
| `/(public)/p/[slug]` (Puck tenant pages) | **P0** | `tenant_landing_viewed` `{page_id, block_count}`, `tenant_landing_cta_clicked` | **Dual-purpose.** Tells a school if its page works *and* tells you if your page builder produces pages that convert. If schools' pages universally underperform, that's a product defect, not their marketing. |
| `/pricing`, `/platform-pricing` | P0 | `pricing_viewed` | Covered — Loop A |
| `/creators` | P1 | `creators_page_viewed` | Creator-acquisition landing; matters for the solo-educator segment in PRODUCT.md. |
| `/verify/[code]` | P1 | `certificate_verified` `{by_third_party: true}` | Low volume, high signal: an employer verifying a cert is proof of real-world credential value — and a free acquisition touch. |
| `/about` | P2 | auto screen view only | — |
| `/oauth/consent` | skip | — | Infrastructure. |

### 9.2 Auth — the cheapest leak to find

| Surface | Pri | Events |
|---|---|---|
| `/auth/sign-up` | **P0** | `signup_started`, `signup_submitted`, `signup_failed` `{reason}` |
| `/auth/sign-up-success` | P0 | `signup_confirmed` (email-verification landing) |
| `/auth/login` | P0 | `login_succeeded`, `login_failed` `{reason}` |
| `/auth/forgot-password`, `/update-password` | P1 | `password_reset_requested`, `password_reset_completed` |
| `/auth/error` | **P0** | `auth_error_shown` `{error_code}` |

`auth_error_shown` is disproportionately valuable and almost always missing. A silent auth failure is a user you never hear from — they don't file a bug, they leave. At 17 users you cannot afford to lose one to a broken magic link.

### 9.3 Student — gamification is the retention engine

| Surface | Pri | Events | Why |
|---|---|---|---|
| `/browse` | **P0** | `catalog_searched` `{query_length, result_count, filters}`, `browse_zero_results` `{query}` | `browse_zero_results` is a **content-gap detector** — it tells the school exactly which courses to build next. Genuinely sellable insight. |
| `/courses/[courseId]/lessons/[lessonId]` | P0 | Loop D | Covered |
| `/store` (`components/gamification/`) | **P1** | `store_viewed`, `store_item_purchased` `{item, coin_cost}`, `store_purchase_blocked` `{shortfall}` | The coin **sink**. If XP accrues and nothing is spent, the economy is broken and the gamification loop is decorative. Note: `gamification_profiles` has no `coins` column — balance is derived. |
| Gamification widgets (`lib/hooks/use-achievements.ts`, `use-league.ts`) | **P1** | `xp_awarded` `{action_type, amount}`, `achievement_unlocked` `{key}`, `streak_continued`/`_broken` `{length}`, `league_promoted`/`_demoted` | With Duolingo/Khan as the stated references, **streaks and leagues are the retention mechanic**. `streak_broken` is your single best churn predictor for learners — it precedes disengagement by days. |
| `/certificates` + `app/api/certificates/share` | **P1** | `certificate_viewed`, `certificate_shared` `{channel}` | Sharing is an organic acquisition loop. Also: cert auto-issue is **template-gated** — an active `certificate_templates` row is required. Track `certificate_expected_but_missing` to surface the known "100% but no cert" confusion. |
| `/billing` (student) | **P0** | `student_subscription_cancel_clicked`, `_confirmed` `{reason}` | Learner churn, distinct from school churn. `app/actions/subscriptions.ts`. |
| `/ai-assistant`, Aristotle panel | **P0** | `ai_session_started`, `ai_message_sent` `{index}`, `ai_session_abandoned` | Highest per-user *cost* surface. Pair with Langfuse for cost-per-outcome. |
| `/community` | P1 | `community_feed_viewed`, `post_created`, `reaction_added`, `poll_voted` | Engagement multiplier; low absolute volume today. |
| `/progress` | P1 | `progress_viewed` | Do learners self-monitor? Cheap to add. |
| `/access-suspended` | **P1** | `access_suspended_shown` `{reason}` | One event, high value: someone hitting this is mid-churn, and it's the last screen before they leave. |
| `/profile`, `/payments` | P2 | auto screen views | — |

### 9.4 Teacher / creator — where creators quit

| Surface | Pri | Events | Why |
|---|---|---|---|
| `lessons/new`, `lessons/[lessonId]` (BlockEditor) | **P0** | `lesson_editor_opened`, `lesson_editor_saved` `{block_count, duration_ms}`, `lesson_editor_abandoned` | **The most important creator surface.** Loop B tells you creators don't publish; only this tells you *why*. If `editor_opened ≫ editor_saved`, the editor is too hard — that's a roadmap-changing finding. |
| `courses/[courseId]/preview` | P1 | `course_previewed` | Previewing before publish is a confidence signal; not previewing predicts low-quality launches. |
| `exams/new`, `exercises/new` | P1 | `exam_created`, `exercise_created` `{type, question_count}` | Assessment authoring is the second-biggest creator workload. |
| `exams/[examId]/submissions/[submissionId]` | P1 | `submission_graded` `{by: 'ai'\|'human'}`, `ai_grade_overridden` | **`ai_grade_overridden` is the AI-grading quality metric.** A high override rate means teachers don't trust the AI — measurable, and otherwise invisible. |
| `courses/[courseId]/certificates/settings` | **P1** | `certificate_template_configured` | Directly de-mystifies the template gate above. |
| `courses/[courseId]/analytics` | P1 | `teacher_analytics_viewed` | Do teachers use the analytics you built (#579)? If not, stop investing there. |
| `/revenue` | P1 | `teacher_revenue_viewed` | |
| `/templates` | P2 | `template_used` `{template_id}` | Which starter templates actually get used (#429). |
| `/api-tokens` | **P1** | `mcp_token_created` | See §10.2 — the MCP adoption signal. |

### 9.5 Admin (school)

Mostly covered by Loops B and E. Additions:

| Surface | Pri | Events |
|---|---|---|
| `/appearance` (theming) | P1 | `theme_customized` `{preset, custom}` — a **strong activation proxy**: an owner who brands their school is invested |
| `/users`, `/enrollments` | P1 | `student_invited`, `invite_link_copied` — how schools actually grow their roster |
| `/community/moderation` | P2 | `moderation_action_taken` `{action}` — moderation load per school |
| `/notifications/templates` | P2 | `notification_template_edited` |
| `/invoices`, `/payouts`, `/transactions`, `/subscriptions` | skip | Read-only finance views; the DB already answers these |
| `/categories`, `/tenants` | skip | Low-frequency config |

### 9.6 Platform (`/platform/*`) — deliberately excluded

**Do not instrument your own super-admin panel, and actively filter your own traffic.**

At 17 users, you and your collaborators are plausibly **30–50% of all sessions**. Unfiltered, every chart measures you. Three filters, all in phase 1:

1. **Skip `/platform/*` entirely** — it's internal tooling, not product.
2. **Drop events where `isSuperAdmin()`** — a flag on the identify call, filtered server-side.
3. **Drop the seeded E2E accounts** (`*@e2etest.com`, `creator@codeacademy.com`, `alice@student.com`) — Playwright runs the purchase flow repeatedly and will otherwise manufacture a fake conversion funnel.

Also exclude `app/actions/platform/impersonate.ts` sessions, or admin impersonation will attribute your debugging to a real student.

---

## 10. Three surfaces beyond the web app

### 10.1 The mobile app (`../lms-app`, Expo 56 / RN 0.85.3)

A second client exists and is entirely uninstrumented. OpenPanel ships a **React Native SDK** (`@openpanel/react-native`, same MIT family).

**Send it to the same project, not a separate one**, with a `platform: 'web' | 'ios' | 'android'` global property. Rationale: the questions that matter are cross-device — *do students who install the app retain better?* *Do they learn on mobile and pay on web?* Separate projects make those unanswerable, and "which platform" is a breakdown, not a boundary.

Identity stitches automatically via the same `profileId` (Supabase auth user id) on both clients — the reason §2.4 mandates the auth user id rather than a device id.

**P1**, not P0: land the web slice first, then mirror the event names exactly. Divergent naming between clients is the classic way this becomes unanalyzable.

### 10.2 The MCP server (`mcp-server/`) — ~92 tools, zero visibility

Twenty tool files expose roughly 92 tools (`lessons.ts` 16, `exercises.ts` 10, `analytics.ts` 9, `exams.ts` 8, `practice.ts` 8, `landing-pages.ts` 8, `certificates.ts` 7, `courses.ts` 6, `student.ts` 6, …). This is a **real product surface** — users driving your LMS from Claude/ChatGPT — and you currently have no idea which parts are used.

| Event | Where | Properties |
|---|---|---|
| `mcp_tool_called` | middleware in `mcp-server/src/`, one hook for all tools | `tool_name`, `role`, `success`, `duration_ms` |
| `mcp_tool_failed` | same | `tool_name`, `error_type` |
| `mcp_session_started` | OAuth completion | `client` (claude.ai / Cursor / …) |
| `mcp_token_created` | `app/actions/mcp-tokens.ts:22` | adoption signal |

Worth it because it answers questions with direct roadmap consequences: **which of 92 tools are actually used** (probably a small fraction — the rest are maintenance burden you could retire), whether AI-driven usage skews student or teacher, and whether MCP users retain better than web-only users. Instrument via **one middleware hook**, not 92 call sites — `tool-policy.ts` already centralises per-role gating, so the interception point exists.

⚠️ The MCP server runs standalone on its own port and is fronted by `app/api/mcp/[[...path]]`. It needs its **own server-side OpenPanel client** with its own env vars — it does not share the Next.js app's module scope.

### 10.3 Email / notifications

You can't track opens without a pixel (don't — it breaks the cookieless/privacy posture). Track the two things that matter instead:

| Event | Where |
|---|---|
| `notification_dispatched` `{template, channel}` | `app/actions/admin/notifications.ts:105 dispatchNotification` |
| `digest_sent` `{recipient_count}` | `app/api/cron/daily-digest` |
| `returned_from_notification` `{source}` | client, reading a `?utm_source=digest` param on landing |

That third one closes the loop: it measures whether the daily digest (#397) actually brings learners back — the only question that justifies its existence.

---

## 11. Open questions for you

1. ~~Cloud or self-host?~~ **Resolved — self-hosted instance already exists.** Replaced by: **does that instance support Groups?** (§8). Blocking for phase 0; everything in §2.1 depends on it.
2. **Session replay on, at 100%, pre-launch?** Recommendation: yes — highest-value tool at n=17, and free on your own hardware. Mask all payment fields and PII. Set a shorter TTL on replays than on events; they dominate disk.
3. **Is per-tenant analytics a product feature** (Pro/Business perk) or purely internal? Self-hosting makes this *more* attractive — unlimited projects at zero marginal cost. Recommendation: internal now, revisit post-launch.
4. **Should this be one issue or an epic?** Recommendation: epic, one issue per phase — phases 2/3/4 parallelize cleanly, and §9/§10 add two more (mobile, MCP) that are independent of everything else.
5. **Instrument the MCP server in this epic or separately?** Recommendation: separate issue — different repo boundary, different env vars, one middleware hook. High insight-per-hour (§10.2).
