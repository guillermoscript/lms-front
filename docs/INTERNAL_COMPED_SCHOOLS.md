# Internal & comped schools (`billing_mode`)

Status: design agreed 2026-10-20 (owner interview). Implementation tracked in the EPIC + 3 stacked PRs below.

## Why

1. **Dogfooding.** The platform owner needs their own academies (1..N) with every feature, no limits, no self-payment, no workarounds.
2. **Partner schools.** Friends' schools get the top plan for free ("comped"), optionally time-boxed, optionally paying a platform fee on their student sales, convertible to paid later.

Today the closest thing is `forceTenantPlanChange` (`app/actions/platform/plans.ts:397`) + `platform_subscriptions.plan_override_at/by`, a hardcoded UUID in `FEE_BLOCK_EXEMPT_TENANT_IDS` (`lib/billing/platform-fee-enforcement.ts:58`) and `platform_fee_account.enforcement_exempt`. Three partial mechanisms, none respected by every cron/gate.

## Model

`tenants.billing_mode` — `paid` (default) | `comped` | `internal`.

**Plan stays the plan.** `tenants.plan` still decides features and limits (`platform_plans`). `billing_mode` only decides whether the **billing machinery** applies. This keeps `lib/plans/*`, `FeatureGate`, DB limit triggers untouched.

| | `paid` | `comped` | `internal` |
|---|---|---|---|
| Plan | whatever they pay for | editable, default top plan (`enterprise`) | top plan, fixed |
| Subscription expiry cron | yes | no (own expiry, below) | never |
| Over-limit access cutoff | yes | n/a in practice (top plan unlimited); if plan lowered, yes | never |
| Platform fee on student sales | plan's `transaction_fee_percent` | `fee_percent_override` (0 if unset) | 0 |
| Fee ledger enforcement | per ledger mode | **notify only**, never block | never |
| Dunning emails / upsell banners | yes | no (expiry notices instead) | no |
| Ends | — | `comped_until` optional | never |

New columns on `tenants`:
- `billing_mode text not null default 'paid'` + CHECK in (`paid`,`comped`,`internal`)
- `comped_until timestamptz null` (only meaningful for `comped`)
- `comped_reason text null`, `comped_by uuid null` (super admin), `comped_at timestamptz null`
- `fee_percent_override numeric(5,2) null` (CHECK 0..100; null = use plan; only honoured for `comped`)
- `comped_notice_sent jsonb default '{}'` (which of 30/14/3-day notices were sent, idempotency)

Audit: every mode change writes a row (reuse `impersonation_log`-style table or a new `tenant_billing_mode_log`; decide in PR 1).

### Comped expiry lifecycle
1. 30, 14, 3 days before `comped_until`: notify tenant admins (email + in-app) and the platform owner. Idempotent via `comped_notice_sent`.
2. At expiry: `billing_mode -> 'paid'`, `comped_until -> null`; the normal 7-day grace in `expire-platform-subscriptions` (`GRACE_DAYS = 7`, `app/api/cron/expire-platform-subscriptions/route.ts:65`) then `downgradeTenantToFree` (`lib/billing/downgrade-tenant.ts:19`) and the normal cutoff reconcile.
3. If the school buys a plan before expiry ("Contratar plan"), it flips to `paid` with a real `platform_subscriptions` row.

### Tenant-facing transparency
Admin billing page shows, for `comped`: "Plan cortesía: Enterprise hasta DD/MM/AAAA · fee X %" plus a "Contratar plan" CTA to `/dashboard/admin/billing/upgrade`. For `internal`: no upsell UI at all.

## Decisions (all confirmed by owner)

- One mechanism, two modes (not a tag).
- Comped fee: per-tenant `fee_percent_override`, entered when creating/converting; empty = 0 %.
- Unpaid comped fee: `notify_only` forever (no sales block) for now.
- Expiry: notices at 30/14/3 days, then soft downgrade through the existing grace.
- Consolidate: migrate + delete `plan_override_*`, `enforcement_exempt`, the hardcoded UUID. Platform tenant (`00000000-0000-0000-0000-000000000001`) becomes `internal`; existing override rows become `comped`. No back-compat shims (prod is sandbox).
- Entry: convert existing school first; create-on-behalf-of second.
- Delivery: 3 stacked PRs.

## Known inconsistencies to fix in PR 1 (found by survey, verify first)

- `has_course_access()` (`supabase/migrations/20260724130000_access_cutoff_enforcement.sql:19-33`) checks only `access_cutoff_at`, never limits; docs claim "while over limit".
- Missing `platform_plans` row: `getTenantPlan()` (`lib/plans/server.ts:46`) closes all features; `get_plan_features()` falls back to free; `tenant_plan_limit` returns -1 (unlimited); reconciler treats limits as unknown. Pick one rule (fail closed for `paid`, top plan for `internal`/`comped` regardless of row).
- Unverified: whether `forceTenantPlanChange` reconciles the cutoff.
- `docs/DATABASE_SCHEMA.md` is stale for `tenants` (still lists `stripe_customer_id`; misses `access_cutoff_at`, `country`, `stripe_*` booleans).

### Resolved in PR 1 (#982)

- `has_course_access()` doc corrected: the function is intentionally cutoff-only (`access_cutoff_at`, plus the `internal` bypass); the reconciler is the limit mechanism.
- Missing `platform_plans` row rule unified: `paid` fails closed (features `{}`, limit 0); `comped` and `internal` fall back to `enterprise`.
- `forceTenantPlanChange` now reconciles the cutoff and sets `comped` (it did NOT reconcile before).
- `docs/DATABASE_SCHEMA.md` `tenants` section refreshed (and `tenant_billing_mode_log` added).

Decisions made while implementing:
- Fee-exempt and `plan_override` schools migrated to `comped`, preserving today's fee in `fee_percent_override` (100 - `school_percentage`, default 20).
- `comped` keeps plan limits and the cutoff; only `internal` is exempt from the cutoff.

## Code map (from survey; re-verify before editing)

- Plan resolution: `lib/plans/server.ts`, `lib/plans/features.ts`, `lib/billing/plan-limits.ts`
- DB limits: `supabase/migrations/20260901120000_plan_limit_db_triggers.sql` (`LM001`)
- Cutoff: `lib/billing/access-cutoff.ts` (`ACCESS_CUTOFF_GRACE_DAYS = 14`), cron `app/api/cron/enforce-plan-limits/route.ts` (pg_cron `0 3 * * *`)
- Subscription expiry: `app/api/cron/expire-platform-subscriptions/route.ts`
- Fee ledger / gate: `lib/billing/platform-fee-enforcement.ts`, `lib/billing/sales-gate.ts`, `lib/billing/platform-fee-admin.ts`, migration `20261009110000_platform_fee_gate_929.sql`; design `docs/PLATFORM_FEE_LEDGER_DESIGN.md`
- Super admin: `app/actions/platform/plans.ts`, `app/actions/platform/impersonate.ts`, `app/[locale]/platform/`, `isSuperAdmin()` in `lib/supabase/get-user-role.ts:91`
- School creation: RPC `create_school` (`supabase/migrations/20261001120000_create_school_country_865.sql`), `components/tenant/create-school-flow.tsx`, legacy `app/actions/onboarding.ts:23`
- Prior art: #493–#564 (cutoff), #600–#614 (provider-agnostic billing), #927–#956 (fee ledger)

## Delivery: stacked PRs

Stack order matters; merge bottom-up, **never `--delete-branch` on a base branch** (auto-closes the child PR); `rebase --onto` children after each squash-merge.

1. **Core** (`billing_mode` + guards + fee override)
2. **Super-admin UI + transparency + expiry notices**
3. **Create school on behalf of someone** (invite flow)

Each PR: migration cloud-applied before merge, `npm run db:types`, unit + Playwright specs, `npm run typecheck` + `npm run build`.

## Out of scope

Invite-code/"free school" redemption links (option C, revisit with many partners), per-school fee-block opt-in, automatic comped→paid conversion billing, changing plan prices.
