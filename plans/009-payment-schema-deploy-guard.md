# Plan 009: Payment schema is provably present before the payments code runs in production

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat e768e357..HEAD -- supabase/migrations app/api/payments app/[locale]/platform/revenue`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (adds a guard script + CI step + comment edits; touches no runtime code path)
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `e768e357`, 2026-06-20

## Why this matters

This branch ships payments code that **reads database objects which exist only
in migrations the branch itself marks "LOCAL-ONLY … not pushed to cloud."** If
the branch is deployed to production without those migrations being applied
first, three things break silently or loudly:

1. **Checkout fails** — `app/api/payments/checkout/route.ts` inserts
   `settlement_currency/base/mint/sol_usd`, columns added by
   `20260617130000_solana_settlement_lock.sql`. Missing columns → every Solana
   checkout INSERT errors → "Failed to create transaction".
2. **Replay protection silently disappears** — the Solana double-spend guard
   relies on the partial-unique index `transactions_provider_charge_id_unique`
   from `20260615180000_consume_solana_signature.sql`. Without it,
   `app/api/payments/solana/verify/route.ts` can no longer reject a replayed
   on-chain signature (the 23505 branch never fires).
3. **The platform revenue page 500s** — `app/[locale]/platform/revenue/page.tsx`
   calls `rpc('get_platform_revenue')`, defined only in
   `20260617120000_get_platform_revenue.sql`.

The fix is **not** to push migrations from this plan (that mutates production —
out of scope; it is an operator action documented in the checklist below).
The fix an executor *can* deliver is a **preflight guard**: a script that asserts
the required DB objects exist and fails the deploy/CI if they do not, so a
half-applied schema can never reach users. Plus de-stale the two migration
comments that tell a future operator "do not push."

## Current state

- The six payment migrations added by this branch (verified with
  `git diff --name-only --diff-filter=A $(git merge-base master HEAD)..HEAD -- supabase/migrations`):
  - `supabase/migrations/20260615150000_add_lemonsqueezy_solana_providers.sql`
  - `supabase/migrations/20260615160000_tenant_payment_wallets.sql`
  - `supabase/migrations/20260615170000_solana_native_subscriptions.sql`
  - `supabase/migrations/20260615180000_consume_solana_signature.sql`
  - `supabase/migrations/20260617120000_get_platform_revenue.sql`
  - `supabase/migrations/20260617130000_solana_settlement_lock.sql`
- Two still carry an explicit "do not push" comment:
  - `20260617120000_get_platform_revenue.sql:26-27` — `-- LOCAL-ONLY: like the other 2026-06-15 payment migrations on this branch, this -- is not pushed to cloud until the operator says so.`
  - `20260617130000_solana_settlement_lock.sql:14` — `-- LOCAL-ONLY until the operator applies the #280/#334 migration set to cloud.`
- The replay index (target of the guard), `20260615180000_consume_solana_signature.sql:21-23`:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS transactions_provider_charge_id_unique
    ON public.transactions (payment_provider, provider_charge_id)
    WHERE provider_charge_id IS NOT NULL AND status = 'successful';
  ```
- The settlement columns, `20260617130000_solana_settlement_lock.sql:16-20`:
  `settlement_currency TEXT`, `settlement_base BIGINT`, `settlement_mint TEXT`, `settlement_sol_usd NUMERIC(20,8)`.
- The repo already has a CI workflow at `.github/workflows/ci.yml` (added earlier
  on this branch) — the guard step is added there.
- The repo's Node scripts convention: plain `.mjs`/`.ts` under `scripts/`, run
  with `node` or `tsx`. The Supabase service-role client is created in app code
  via `@supabase/supabase-js`'s `createClient(url, serviceKey)` — see
  `app/api/payments/checkout/route.ts` for the env var names
  (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

## Commands you will need

| Purpose   | Command                         | Expected on success |
|-----------|---------------------------------|---------------------|
| Typecheck | `npm run typecheck`             | exit 0, no errors   |
| Unit tests| `npm run test:unit`             | all pass            |
| Lint      | `npm run lint`                  | no NEW errors (repo has a known lint baseline; see plans/005) |
| Run guard | `node scripts/check-payment-schema.mjs` | prints a clear PASS/FAIL; exit 0 only when all objects present |

## Scope

**In scope** (the only files you should create/modify):
- `scripts/check-payment-schema.mjs` (create)
- `.github/workflows/ci.yml` (add one guarded job/step that runs the script)
- `supabase/migrations/20260617120000_get_platform_revenue.sql` (comment edit only — lines 26-27)
- `supabase/migrations/20260617130000_solana_settlement_lock.sql` (comment edit only — line 14)

**Out of scope** (do NOT touch):
- Any SQL statement body inside the migrations — change only the comment lines named above. The migrations are already applied locally; altering their DDL would create drift.
- Any application route or page — this plan adds a guard, it does not change runtime behavior.
- **Do NOT run `supabase db push` or any command that writes to a remote/cloud database.** That is the operator checklist below, not executor work.

## Steps

### Step 1: Write the preflight schema-check script

Create `scripts/check-payment-schema.mjs`. It connects with the service-role key
and asserts every object the shipped payments code depends on exists. It must:

- Read `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` from env.
  If either is missing, print `SKIP: Supabase env not set — schema check skipped` and exit **0** (so CI without DB creds does not fail; the gate is best-effort).
- Assert these objects, querying Postgres catalogs via the service-role client
  (use `supabase.rpc` is not available for catalogs — instead run lightweight
  probe queries that fail iff the object is absent):
  - **Columns** on `public.transactions`: `settlement_currency`, `settlement_base`, `settlement_mint`, `settlement_sol_usd`, `provider_charge_id`.
    Probe: `select settlement_currency, settlement_base, settlement_mint, settlement_sol_usd, provider_charge_id from transactions limit 0`. A PostgREST/Postgres error mentioning a missing column = FAIL.
  - **Table** `public.tenant_payment_wallets`: probe `select 1 from tenant_payment_wallets limit 0`.
  - **RPC** `get_platform_revenue`: probe `supabase.rpc('get_platform_revenue')`; a "function does not exist" error = FAIL (any other error, e.g. permission, still means it exists → treat as PASS for presence).
  - **Index** `transactions_provider_charge_id_unique`: probe with a raw catalog read if available; if you cannot read `pg_indexes` through the client, SKIP this single check and print a warning rather than failing (the column probe above already covers the dependent column).
- Collect failures into a list. At the end:
  - If empty: print `PASS: payment schema present` and exit 0.
  - Else: print `FAIL: missing payment schema objects:` followed by the list and the remediation line `Run: supabase db push (see plans/009)`, then exit **1**.
- Wrap each probe in try/catch so one missing object does not abort the others — report ALL missing objects in one run.

Keep it dependency-free beyond `@supabase/supabase-js` (already a dependency).

**Verify**: `node scripts/check-payment-schema.mjs` against your local DB →
prints `PASS: payment schema present` and exits 0 (local migrations are applied,
so every object exists). If env is unset locally, it prints `SKIP …` and exits 0.

### Step 2: Wire the guard into CI as a non-fatal-when-skipped gate

In `.github/workflows/ci.yml`, add a step (in the existing test/build job, after
dependencies install) that runs `node scripts/check-payment-schema.mjs`. The step
inherits `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from CI secrets
if present; when absent the script self-skips (exit 0), so this never breaks PRs
that lack DB creds, but it **fails the pipeline when creds are present and the
schema is incomplete** (the deploy-target case).

**Verify**: `git diff .github/workflows/ci.yml` shows exactly one added step
invoking the script; the YAML still parses (no tab characters; consistent
indentation with the surrounding steps).

### Step 3: De-stale the two "do not push" migration comments

These comments will mislead the operator who applies the set. Replace the
"LOCAL-ONLY … not pushed" wording with a neutral note that the migration is part
of the #280/#334 payment set and must be applied before deploying the payments
code (see plan 009). Edit **only** the comment lines:
- `20260617120000_get_platform_revenue.sql:26-27`
- `20260617130000_solana_settlement_lock.sql:14`

Do not alter any SQL.

**Verify**: `grep -rn "LOCAL-ONLY\|not pushed" supabase/migrations/` returns no
matches.

### Step 4: Full verification

**Verify**:
- `npm run typecheck` → exit 0
- `npm run test:unit` → all pass (you added no tests; nothing regresses)
- `git status` → only the four in-scope files changed

## Operator checklist (NOT executor work — for the human deploying this branch)

Before deploying this branch to any environment, the operator runs, against that
environment's database:

1. `supabase migration list` — confirm the six `2026061515xxxx`–`2026061718xxxx`
   payment migrations show as **not yet applied** remotely.
2. `supabase db push` — apply them (each uses `IF NOT EXISTS` / `create or
   replace`, so re-running is safe).
3. `node scripts/check-payment-schema.mjs` against that DB → must print `PASS`.

Only after PASS should the application image be promoted.

## Test plan

- No new unit tests required (the deliverable is an ops guard script).
- Manual: run `node scripts/check-payment-schema.mjs` against the local DB (expect PASS) and, to confirm the failure path, temporarily point it at a DB without the columns (expect a FAIL list + exit 1) — do **not** commit any such config.

## Done criteria

ALL must hold:

- [ ] `scripts/check-payment-schema.mjs` exists; running it locally prints `PASS` and exits 0
- [ ] The script exits 0 with a `SKIP` message when Supabase env vars are unset
- [ ] `.github/workflows/ci.yml` runs the script in CI
- [ ] `grep -rn "LOCAL-ONLY\|not pushed" supabase/migrations/` → no matches
- [ ] `npm run typecheck` exits 0; `npm run test:unit` passes
- [ ] `git status` shows only the four in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The settlement columns / RPC / index do NOT actually exist in your local DB
  (the probe FAILs locally) — that means local migrations are not applied; report
  it rather than "fixing" by pushing anything.
- The `@supabase/supabase-js` client cannot run the catalog/probe queries with the
  service-role key in your environment — report the limitation; do not switch to a
  direct `pg`/`psql` connection (not a repo dependency) without approval.
- You discover a runtime code path already guards against the missing schema
  (e.g. a feature flag) — report it; the guard may be redundant.

## Maintenance notes

- When future payment migrations add columns/RPCs the code depends on, extend
  `scripts/check-payment-schema.mjs` with the new probes — it is the single
  deploy gate for payment schema presence.
- A reviewer should confirm the CI step's skip-on-missing-creds behavior so the
  gate never blocks unrelated PRs, while still failing on an incomplete deploy DB.
- Deferred: making each route degrade gracefully (e.g. checkout returning a clean
  503 when settlement columns are absent) was intentionally left out — the guard
  prevents the broken-schema deploy in the first place, which is higher leverage.
