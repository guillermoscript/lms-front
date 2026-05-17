# Entitlements Migration Plan

**Status:** Proposed — not yet implemented
**Author:** Claude Code session, 2026-05-16
**Decision input:** Confirmed by product owner — *the same course will be sold both as a one-time product AND included in a subscription plan* (overlap is intended).

---

## 1. Problem statement

`enrollments` carries two unrelated concerns in one row:

1. **Access grant** — "user may open course X" (`status`)
2. **Billing attribution** — "...because of product P **or** subscription S" (`product_id` / `subscription_id` + the `valid_enrollment` CHECK)

The CHECK constraint:

```sql
CHECK ( (product_id IS NOT NULL AND subscription_id IS NULL)
     OR (product_id IS NULL AND subscription_id IS NOT NULL) )
```

forces **exactly one** access source per `(user, course)`. The unique index `enrollments_user_id_course_id_key (user_id, course_id)` allows **only one row** per `(user, course)`.

Because a course can be reached via a product **and** a plan (intended), a user can legitimately hold two access sources for one course. The schema cannot represent this. Symptoms:

- **HTTP 500 on plan purchase** — `handle_new_subscription`'s `ON CONFLICT (user_id, course_id) DO UPDATE` sets `subscription_id` on a row that already has `product_id` → both non-null → `valid_enrollment` violation → transaction rolls back. Verified 2026-05-16 on the Code Academy tenant.
- **Silent access loss (worse than the 500)** — if the upsert is "fixed" by nulling the other column, a subscription lapse can revoke a course the user **bought to own permanently** via a product, because the product attribution was overwritten.

### Goal

Separate **entitlement** (why a user has access) from **enrollment** (learning progress). Allow multiple concurrent access sources per `(user, course)`. Make subscription lapse revoke only subscription-derived access.

### Non-goals

- No change to `transactions`, `subscriptions`, `products`, `plans`, `payment_requests` schemas.
- No change to the checkout UI.
- No change to Stripe integration surface (webhook handlers change internally only).
- Lesson/exam **content** RLS stays tenant-scoped (it already is — see §4.5). Enrollment-based content RLS is noted as optional hardening, out of scope.

---

## 2. Target model

### 2.1 New table — `entitlements`

One row **per access source** per `(user, course)`.

```sql
CREATE TYPE entitlement_source AS ENUM ('product', 'subscription', 'free', 'admin_grant');
CREATE TYPE entitlement_status AS ENUM ('active', 'revoked', 'expired');

CREATE TABLE entitlements (
  entitlement_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         uuid    NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  course_id       integer NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  tenant_id       uuid    NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  source_type     entitlement_source NOT NULL,
  source_id       integer,            -- product_id | subscription_id; NULL for free / admin_grant
  status          entitlement_status NOT NULL DEFAULT 'active',
  granted_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,        -- NULL = perpetual (products, free); set for subscriptions
  revoked_at      timestamptz,
  CONSTRAINT entitlements_source_id_shape CHECK (
       (source_type IN ('product','subscription') AND source_id IS NOT NULL)
    OR (source_type IN ('free','admin_grant')     AND source_id IS NULL)
  )
);

-- one entitlement per (user, course, source). NULLS NOT DISTINCT (PG15+) so that
-- two 'free' rows (source_id NULL) for the same course also collide.
CREATE UNIQUE INDEX entitlements_unique_source
  ON entitlements (user_id, course_id, source_type, source_id) NULLS NOT DISTINCT;

CREATE INDEX idx_entitlements_access ON entitlements (user_id, course_id, status);
CREATE INDEX idx_entitlements_tenant ON entitlements (tenant_id);
CREATE INDEX idx_entitlements_source ON entitlements (source_type, source_id);  -- revoke-by-subscription
```

**Notes**
- `bigint` identity PK (project elsewhere uses `_id` integer serials; identity is the modern equivalent and avoids sequence ownership quirks).
- `expires_at`: products & free = `NULL` (perpetual); subscription entitlements = the subscription `end_date`. Access check treats `expires_at <= now()` as no access even before a status sweep runs.
- `source_id` is intentionally **not** a real FK — it points at either `products.product_id` or `subscriptions.subscription_id` depending on `source_type`. A polymorphic reference; integrity is maintained by the RPCs. (Alternative: two nullable FK columns. Rejected — reintroduces the XOR-shaped smell.)

### 2.2 `enrollments` after the refactor

Becomes a pure **learning record**: "user has this course in their workspace / progress."

- **Keep:** `enrollment_id`, `user_id`, `course_id`, `tenant_id`, `status`, `enrollment_date`.
- **`status`** semantics narrow to learning only: `active` (in progress) | `completed`. The `disabled` value is no longer set by billing logic (access is gated by `entitlements`). `disabled` may remain in the enum unused, or be dropped in Phase 3.
- **Drop (Phase 3):** `product_id`, `subscription_id`, both FKs, the `valid_enrollment` CHECK.
- Unique index `(user_id, course_id)` **stays** — still one learning record per course.

An `enrollments` row is created by the RPCs at grant time (as today), so existing dashboard/progress queries keep working with minimal change.

### 2.3 Access-check helper

A single source of truth, callable from SQL (RLS, RPCs) and reportable to the app.

```sql
CREATE OR REPLACE FUNCTION has_course_access(_user_id uuid, _course_id integer)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.user_id = _user_id
      AND e.course_id = _course_id
      AND e.status = 'active'
      AND (e.expires_at IS NULL OR e.expires_at > now())
  );
$$;
```

---

## 3. Database function changes

All three functions live in a new migration; they currently sit in `supabase/migrations/20260316000000_fix_enrollment_rpcs.sql`.

### 3.1 `enroll_user(_user_id uuid, _product_id integer)`

For each course in `product_courses` for the product:

1. **Upsert `entitlements`** — `source_type='product'`, `source_id=_product_id`, `status='active'`, `expires_at=NULL`.
   `ON CONFLICT (user_id, course_id, source_type, source_id) DO UPDATE SET status='active', revoked_at=NULL`.
2. **Upsert `enrollments`** — learning record only: `(user_id, course_id, tenant_id, status='active')`,
   `ON CONFLICT (user_id, course_id) DO UPDATE SET status = CASE WHEN enrollments.status='completed' THEN 'completed' ELSE 'active' END`.
   **No `product_id` / `subscription_id` written** (Phase 3); in Phase 1 still written for dual-write — see §5.

Never touches subscription entitlements. The overlap collision is gone by construction.

### 3.2 `handle_new_subscription(_user_id, _plan_id, _transaction_id, _start_date)`

1. Upsert `subscriptions` (unchanged).
2. For each course in `plan_courses`:
   - **Upsert `entitlements`** — `source_type='subscription'`, `source_id=<subscription_id>`, `status='active'`, `expires_at=<subscription end_date>`.
   - **Upsert `enrollments`** learning record (same as §3.1 step 2).

Never touches product entitlements.

### 3.3 `handle_subscription_status_change()` (trigger on `subscriptions`)

Current behaviour: on status → `canceled`/`expired`, sets `enrollments.status='disabled'` for that `subscription_id`; on → `active`, re-enables.

New behaviour — operate on **entitlements**:

- → `canceled` / `expired`: `UPDATE entitlements SET status='expired', revoked_at=now() WHERE source_type='subscription' AND source_id=<subscription_id>`.
- → `active` / `renewed`: `UPDATE entitlements SET status='active', expires_at=<new end_date>, revoked_at=NULL WHERE source_type='subscription' AND source_id=<subscription_id>`.
- **Never touches product or free entitlements.** A user who also owns a course outright keeps access. This is the core correctness win.

`handle_student_subscription_expiry()` (daily cron) is unchanged — it flips `subscriptions.subscription_status`, the trigger cascades.

### 3.4 New: `grant_free_entitlement(_user_id, _course_id)`

Replaces the fabricated `$0 product` workaround in `enrollFree`. Upserts `entitlements (source_type='free', source_id=NULL)` + the `enrollments` learning record. Removes the need to create synthetic `products` / `product_courses` rows.

### 3.5 Revenue split on non-Stripe sales — RESOLVED 2026-05-16

The original note here assumed `revenue_splits` was a per-sale ledger written by
the Stripe webhook. It is not — `revenue_splits` is a **per-tenant config** row
(`platform_percentage`, `school_percentage`, `applies_to_providers`, default
`['stripe']`), with the rate synced from the school's platform plan
(`app/actions/admin/billing.ts`).

The real gap was in `getRevenueOverview` (`app/actions/admin/revenue.ts`): it
computed `platformFees = totalRevenue × platform_percentage` over **every**
successful transaction, ignoring `applies_to_providers`. Stripe Connect collects
the platform fee via `application_fee_amount`; manual/offline sales settle
directly to the school, so charging them a platform fee in the dashboard
overstated fees and understated the school's net revenue.

Fixed: `getRevenueOverview` now derives each transaction's provider
(`stripe_payment_intent_id IS NOT NULL` → `stripe`, else `manual`) and applies
the platform fee only to revenue from providers in `applies_to_providers`. Also
fixed a latent bug in the same function — it selected a non-existent
`created_at` column (the column is `transaction_date`), which broke the monthly
trend.

---

## 4. Application code changes

Touch points from a full repo sweep. Grouped; **Phase** column says when each change lands (see §5).

### 4.1 Enrollment service — the chokepoint

`lib/services/enrollment-service.ts` — `CourseAccess`, `EnrollmentData` types and `determineAccessStatus()`. **This is the single best place to absorb the model change.** Rework it to read `entitlements`:

- `getCourseAccess(userId, courseId)` → query `entitlements`, return `{ hasAccess, sources: [...], isExpired, soonestExpiry }`.
- `accessType` becomes `accessTypes: ('product'|'subscription'|'free'|'admin_grant')[]` (a course can now have several).
- Keep a thin back-compat shim during Phase 2 so callers migrate incrementally.

Route as many of the callers below through this service as possible instead of hand-rolled `.from('enrollments')` access checks. **Phase 2.**

### 4.2 RPC callers

| File | Change | Phase |
|------|--------|-------|
| `app/[locale]/(public)/checkout/actions.ts` — `enrollUser` (product + plan branches) | No signature change; RPCs do the new work. Remove the **direct** `enroll_user` RPC call in the product branch — the `after_transaction_insert` trigger already enrolls (see §6 double-path). Keep transaction insert. | 2 |
| `app/[locale]/(public)/checkout/actions.ts` — `enrollFree` | Replace fabricated-product logic with a call to `grant_free_entitlement`. Delete the admin-client `products`/`product_courses` insert block. | 2 |
| `app/actions/payment-requests.ts` — `completeAndEnroll` | Same: rely on the transaction trigger; drop the explicit `enroll_user`/`handle_new_subscription` calls. | 2 |

### 4.3 `useEnrollment` hook + browse

| File | Change | Phase |
|------|--------|-------|
| `lib/hooks/use-enrollment.ts` | Currently client-side INSERT into `enrollments` with `subscription_id`. Replace with an RPC call `self_enroll_subscription_course(course_id)` (new, SECURITY DEFINER) that verifies an active subscription covers the course, then upserts a `subscription` entitlement + learning record. Client-side INSERT of a billing row is itself a smell — moving it server-side is a bonus hardening. | 2 |
| `app/[locale]/dashboard/student/browse/page.tsx` | "already enrolled" set: query `entitlements` (active) instead of `enrollments`. | 2 |
| `components/student/browse-course-card.tsx` | `EnrollmentStatus` type + enroll handler follow the hook change. | 2 |

### 4.4 Access-gate pages (read `enrollments` to allow/deny)

All switch from `select enrollment where status='active'` to `has_course_access()` / the enrollment service.

| File | Phase |
|------|-------|
| `app/[locale]/dashboard/student/courses/[courseId]/page.tsx` (course overview gate) | 2 |
| `app/[locale]/dashboard/student/courses/[courseId]/exams/[examId]/page.tsx` (exam gate) | 2 |
| `app/[locale]/dashboard/student/courses/[courseId]/lessons/[lessonId]/page.tsx` | 2 |
| `app/[locale]/dashboard/student/courses/[courseId]/community/page.tsx` | 2 |
| `app/actions/community.ts` (enrolled-before-post check) | 2 |
| `app/actions/teacher/lesson-resources.ts` (joins `enrollments.product_id = pc.product_id`) | 2 |
| `app/api/chat/aristotle/route.ts`, `app/api/exercises/artifact/evaluate/route.ts`, `app/api/exercises/media/upload-url/route.ts` | 2 |
| `app/api/certificates/generate/route.ts`, `app/api/certificates/issue/route.ts` | 2 |

### 4.5 RLS

Current `enrollments` RLS (SELECT own / teacher+admin tenant / super admin; INSERT own; UPDATE admin) — **keep**, `entitlements` gets a parallel policy set:

```
SELECT  "Students view own entitlements"      : auth.uid() = user_id AND tenant_id = get_tenant_id()
SELECT  "Teachers/admins view tenant entitlements"
SELECT  "Super admins view all entitlements"
-- No INSERT/UPDATE policy for end users: all writes go through SECURITY DEFINER RPCs.
```

`lessons` / `exams` SELECT RLS today is **tenant-scoped only** (any tenant user can read) — access is gated in page components, not RLS. **No RLS change required.** Optional hardening (separate ticket): add `has_course_access()` to `lessons`/`exam_questions` SELECT policies for defence-in-depth.

### 4.6 Enrichment / listing reads (display only, not gating)

These read `enrollments.product_id` / `subscription_id` to *show* "lifetime vs expires":

| File | Change | Phase |
|------|--------|-------|
| `app/[locale]/dashboard/student/courses/page.tsx` (in-progress/completed list, lines ~30-178) | Join `entitlements` instead of `product_id`/`subscription_id`; a course may now show multiple badges. | 2 |
| `components/student/enrolled-course-card.tsx` | Render from `entitlements` sources. | 2 |
| `app/[locale]/dashboard/student/page.tsx`, `.../progress/page.tsx` | Mostly progress %; verify they don't read billing columns. | 2 |
| `app/[locale]/dashboard/admin/enrollments/page.tsx` + admin/teacher/analytics pages | Listing — switch billing display to `entitlements`; counts that use raw `enrollments` are fine. | 2 |

### 4.7 Stripe webhook

`app/api/stripe/webhook/route.ts` — `charge.refunded` currently does `UPDATE enrollments SET status='disabled' WHERE product_id=...`. Change to `UPDATE entitlements SET status='revoked', revoked_at=now() WHERE source_type='product' AND source_id=<product_id>`. Plan refunds already go via subscription status → trigger. **Phase 2.**

### 4.8 Generated types & seeds

- Regenerate Supabase TypeScript types after Phase 1 (adds `entitlements`) and after Phase 3 (drops columns): `supabase gen types`.
- `supabase/seed.sql`, `tests/demos/seed-demo-data.sql` — add `entitlements` rows; drop `enrollments.product_id` inserts in Phase 3.
- Migration `20260310000000_lesson_resources_sequential_scheduling.sql` contains a JOIN `enrollments e ON e.product_id = pc.product_id` — that historical migration file is **not** edited (already applied); but any *view or function* it created with that join must be found and rewritten. Audit during Phase 2.

### 4.9 E2E tests

`tests/playwright/enrollment-flows.spec.ts`, `tests/student/student-flow.spec.ts`, `tests/playwright/student-exams.spec.ts`, `tests/purchase-flow.spec.ts` — update enrollment setup/teardown to `entitlements`. Add a new spec: **plan purchase for a course already owned via product** (the bug this whole plan exists for).

---

## 5. Phased rollout

Each phase is independently shippable and reversible.

### Phase 1 — Additive (no behaviour change, stops the 500)

1. Migration `A`: create `entitlement_source` / `entitlement_status` enums, `entitlements` table, indexes, RLS, `has_course_access()`.
2. Migration `B`: **backfill** — for each existing `enrollments` row, insert the matching `entitlements` row:
   - `product_id` set → `('product', product_id, expires_at=NULL)`
   - `subscription_id` set → `('subscription', subscription_id, expires_at=<sub end_date>)`
   - Current data: **7 rows, all product-based, 0 subscription, 0 orphan** — backfill is trivial and safe.
3. Migration `C`: **drop the `valid_enrollment` CHECK** + rewrite `enroll_user`, `handle_new_subscription`, `handle_subscription_status_change`, add `grant_free_entitlement` — **dual-write**: they write `entitlements` (new) **and** keep writing the legacy `enrollments` billing columns.
   - The `valid_enrollment` CHECK (`product_id` XOR `subscription_id`) is what raised the HTTP 500. Dropping it is the minimal, lossless crash fix: the columns stay and are still dual-written, a legacy row may now legitimately carry *both* ids, and that legacy attribution is simply no longer read once Phase 2 lands. (This supersedes the earlier "null the opposing column" stopgap idea — dropping the CHECK keeps both attributions instead of destroying one.)
4. App: no code change. (No generated Supabase types file exists in this repo — types are hand-written, see §4.1 — so there is nothing to regenerate.)

**Outcome:** plan purchase works again, including the product+plan **overlap** case; `entitlements` is populated and kept in sync; nothing reads it yet. Fully reversible (drop table + restore the CHECK + revert functions).

> **Status: Phase 1 applied 2026-05-16.** Migrations `20260516120000_entitlements_table.sql`, `20260516120001_entitlements_backfill.sql`, `20260516120002_entitlements_dual_write_rpcs.sql`. Backfilled 7 product entitlements. Verified end-to-end: a plan purchase for courses already owned via products now succeeds and produces coexisting `product` (perpetual) + `subscription` (expiring) entitlements on the same course. Note: `enrollement_status` enum (sic — typo in the original schema) has only `active`/`disabled`, no `completed` — the RPCs write `status = 'active'` on upsert.

### Phase 2 — Switch reads to `entitlements`

1. Rework `lib/services/enrollment-service.ts` (§4.1).
2. Migrate every access-gate, enrichment read, the `useEnrollment` hook, browse, Stripe webhook, RPC callers (§4.2–4.7) to `entitlements` / `has_course_access()`.
3. Remove the **direct** RPC calls from `checkout/actions.ts` and `payment-requests.ts`; let the `after_transaction_insert` trigger be the single enrollment path (§6).
4. Update E2E tests; add the overlap regression test.
5. Ship. Legacy `enrollments.product_id`/`subscription_id` are now **written but never read**.

**Outcome:** correct behaviour live — overlapping access works, subscription lapse spares owned courses. Reversible by reverting the app deploy (DB still dual-written).

> **Status: Phase 2 applied 2026-05-16.** Migration `20260516130000_phase2_self_enroll_rpc.sql` (`self_enroll_subscription_course` RPC). Reworked `lib/services/enrollment-service.ts` (entitlement-based `computeCourseAccess`) + new `lib/services/course-access.ts` (`hasCourseAccess`, `fetchCourseAccess`, `fetchAccessibleCourseIds`, `fetchCourseAccessMap`). Converted: `use-course-access` / `use-enrollment` hooks; access gates (course overview, exam, community pages); gating API routes (aristotle, artifact evaluate, media upload-url, certificates/generate) + server actions (`community.ts`, `teacher/lesson-resources.ts`); browse page + `enrolled-course-card` / student courses page (entitlement badges); Stripe refund webhook (revokes product entitlements). `npm run build` green; browser-verified — course gate via `has_course_access`, My Courses shows entitlement-derived badges, the product+subscription overlap course correctly reads "Lifetime Access".
>
> **Phase 2 follow-up — deferrals closed 2026-05-16.** Double-enrollment path removed: the explicit `enroll_user`/`handle_new_subscription` RPC calls are gone from `checkout/actions.ts` (`enrollUser`) and `payment-requests.ts` (`completeAndEnroll`) — the `after_transaction_insert` trigger is now the single enrollment path. `enrollFree` rewritten to call `grant_free_entitlement` (no more fabricated $0 products). E2E specs updated — `student-exams.spec.ts` seeds via the `enroll_user` RPC, `enrollment-flows.spec.ts` cleans entitlements; new `tests/playwright/entitlements-overlap.spec.ts` regression test (passes). Browser-verified: paid purchase enrolls via the trigger only; free enroll produces a clean `free` entitlement.
>
> Also fixed a real bug surfaced while closing the deferrals — migration `20260516140000_phase2_fix_renewal_entitlements.sql`: the trigger's subscription **renewal** path extended `subscriptions.end_date` but never the entitlements' `expires_at`, so a renewed subscription would still read as lapsed. `handle_new_subscription` is now renewal-aware (extends from the existing end_date) and the trigger always delegates to it. (The trigger is not SECURITY DEFINER, so it must not write `entitlements` directly — all entitlement writes route through the definer RPC.)
>
> Still genuinely out of scope: the lesson page remains gateless (it was gateless before this migration too — noted in §4.4 as optional hardening).

### Phase 3 — Drop legacy

After Phase 2 has been stable in production for a chosen soak period (suggest ≥1 billing cycle):

1. Migration `D`: stop dual-writing in the RPCs; `ALTER TABLE enrollments DROP COLUMN product_id, DROP COLUMN subscription_id;` (drops FKs + `valid_enrollment` CHECK with them).
2. Optionally drop `'disabled'` from the enrollment status enum if fully unused.
3. Delete dead code: fabricated-product block already removed in Phase 2; remove any remaining shims.
4. Regenerate types; update seeds.

**Outcome:** schema clean, single model. Rollback after this point requires a restore — hence the soak period.

> **Status: Phase 3 applied 2026-05-16.** Migration `20260516150000_phase3_drop_legacy_enrollment_columns.sql`. Soak period waived — the app is a pre-launch POC with no real users (owner's call). The RPCs (`enroll_user`, `handle_new_subscription`, `self_enroll_subscription_course`, `handle_subscription_status_change`) no longer write the legacy columns; `enrollments.product_id` / `subscription_id` and their FKs are dropped. `enrollments` is now `enrollment_id, user_id, course_id, enrollment_date, status, tenant_id` — a pure learning record. The `lesson_resources_select` RLS policy (which joined `enrollments.product_id`) was rewritten to use `has_course_access()`. App code that read the columns updated (`student/courses/page.tsx` enrichment, Stripe refund webhook); test specs + `tests/demos/seed-demo-data.sql` migrated to entitlements. `npm run build` green; overlap regression test passes; browser-verified. The `'disabled'` value of the `enrollement_status` enum is now unused but left in place (harmless).

---

## 6. Fix the double-enrollment path (folded into Phase 2)

Today: `enrollUser()` inserts a `transactions` row → `after_transaction_insert` trigger → `trigger_manage_transactions` calls `enroll_user`/`handle_new_subscription`; **and** the server action *also* calls the RPC directly. `completeAndEnroll` (manual flow) does the same. Two paths, same effect, idempotent — but fragile and confusing.

**Resolution:** the **transaction trigger is the single source of truth**. Server actions only insert the `transactions` row. Remove the direct RPC calls. The trigger already covers the Stripe webhook path uniformly, so this also removes a behavioural inconsistency between mock / manual / Stripe.

(The trigger fires on INSERT *and* UPDATE — confirm a `pending → successful` UPDATE re-running enrollment is harmless. With idempotent entitlement upserts, it is.)

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Reads switched before `entitlements` fully populated | Phase 1 backfill + dual-write guarantee parity before Phase 2 reads anything. |
| `source_id` polymorphic (no FK) drifts | All writes via SECURITY DEFINER RPCs; add a periodic integrity check query (orphaned `source_id`) to monitoring. |
| Trigger fires twice (INSERT + UPDATE) | Entitlement upserts are idempotent; verify with a test that flips a transaction `pending→successful`. |
| `useEnrollment` moving server-side changes client behaviour | Keep the hook's external API identical; only its body changes (now calls an RPC). |
| Soak period too short before Phase 3 | Require ≥1 billing cycle + a clean run of the overlap regression test in prod-like data. |
| Historical migration with `enrollments.product_id` JOIN | Phase 2 audits for any view/function created by `20260310000000_*`; the migration file itself is left untouched. |

---

## 8. Effort estimate

| Phase | Scope | Rough size |
|-------|-------|-----------|
| 1 | 3 migrations, backfill, RPC rewrite (dual-write), type regen | Small–Medium — isolated, no app code |
| 2 | enrollment-service rework + ~20 file edits + tests + double-path cleanup | Medium–Large — the bulk of the work |
| 3 | 1 migration, dead-code delete, type regen | Small |

Not an afternoon. Phase 1 alone unblocks the 500 quickly and safely; Phases 2–3 are the real refactor.

---

## 9. Open questions for the owner

1. **Soak period** before Phase 3 — 1 billing cycle, or a fixed calendar window?
2. ~~`revenue_splits` for non-Stripe sales (§3.5)~~ — resolved 2026-05-16, see §3.5.
3. **Optional RLS hardening** — add `has_course_access()` to `lessons`/`exam_questions` SELECT policies, or leave content RLS tenant-scoped and keep gating in pages?
4. When a user holds **both** a product (perpetual) and subscription (expiring) entitlement for a course, the dashboard should show — "Owned" (product wins for display), or both badges? Affects §4.6 only.
