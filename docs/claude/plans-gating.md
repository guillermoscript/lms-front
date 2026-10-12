# Plan limits & feature gating

> Moved verbatim from CLAUDE.md (index refactor). Loaded on demand — CLAUDE.md links here.

### Plan Limits & Feature Gating

Limits live in `platform_plans.limits` (JSONB): `free` (5 courses/50 students/10% fee) · `starter` (15/200/5%, $9/mo) · `pro` (100/1000/2%, $29/mo) · `business` (unlimited courses/5000 students, 0% fee, $79/mo) · `enterprise` (unlimited/0%, $199/mo). `get_plan_features(_tenant_id)` RPC is the single source of truth. Client hook: `usePlanFeatures()`. Component: `<FeatureGate feature="..." />`.

**Limits are enforced by the database (#658).** `enforce_course_plan_limit` / `enforce_student_plan_limit` triggers refuse any write that would make a `courses` row non-archived or a `tenant_users` row an active student beyond `max_courses` / `max_students`, from any client (server action, MCP, SQL). They raise SQLSTATE `LM001` with message `plan_limit_exceeded:<courses|students>` — map it with `isPlanLimitError()` / `courseLimitMessage()` from `lib/billing/plan-limit-error.ts`, never by matching the message. App-layer pre-checks (`checkCourseLimit()`, `joinCurrentSchool`) stay for the nicer message; the trigger is what wins a race. `-1` or a missing limit means unlimited; `SET app.bypass_plan_limits = 'on'` skips the check for operators/seed only. RLS-scoped callers pre-check through the `get_tenant_plan_usage(_tenant_id)` RPC (members / super admins / service role).

**Features are enforced on the server too (#662).** `lib/plans/server.ts`: `getTenantPlan(tenantId)` (React `cache()`, reads `tenants.plan` → `platform_plans` with NO `is_active` filter), `hasPlanFeature`, `requirePlanFeature` (throws `PlanFeatureError`, map with `planFeatureErrorMessage`), `getAnalyticsTier` (`none|basic|advanced`), `getCertificateTier` (`none|basic|custom`). Closed by default: a missing key is "not included", so any new key MUST be backfilled into every plan's JSON (see `20260901170000_backfill_plan_feature_keys.sql`) before a gate reads it. `FEATURE_REQUIRED_PLAN` in `lib/plans/features.ts` is the pricing promise and `tests/unit/plan-feature-gate-contract.test.ts` fails when a key there has no gate site. Tier meanings live in PRODUCT.md "Plan tiers".

