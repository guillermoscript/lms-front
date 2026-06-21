# Plan 010: A confirmed native-Solana subscription whose first charge fails is retried, never silently free

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat e768e357..HEAD -- app/api/payments/solana/verify/route.ts app/api/cron/solana-pull/route.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the money-confirmation path; must stay idempotent)
- **Depends on**: none (works on the current schema; uses JSONB `provider_metadata`, no migration)
- **Category**: bug
- **Planned at**: commit `e768e357`, 2026-06-20

## Why this matters

For a native Solana auto-pull subscription (`solana_subs`), the verify endpoint
confirms the on-chain subscribe, flips the transaction to `successful` (a DB
trigger then creates the **active** subscription row and grants entitlements),
and immediately fires the **first** split charge. That first charge is wrapped in
a try/catch that only logs and then returns `{ confirmed: true }`. So when the
first pull fails (RPC blip, or the on-chain per-period cap reverts it), the
student ends up with an **active subscription and full access while the school
and platform collect $0** — and nothing ever retries it: the crank cron only
acts **after the on-chain period rolls over** (`solana-pull/route.ts` skips any
sub whose `nowSec < periodEndSec`), so the missed *first* period is never
re-attempted. There is no record that a charge is owed.

This plan makes the missed first charge **recoverable**: verify records a
`firstChargePending` marker on the subscription, and the crank treats that marker
as "due now" (independent of the period gate), charging it and clearing the
marker on success. It also fixes the unchecked metadata write in the same path
(a crash or error there leaves the crank unable to resolve the subscription's
on-chain coordinates).

## Current state

`app/api/payments/solana/verify/route.ts`, function `handleSolanaSubsVerify`
(lines 294-363) — after the status-guarded flip:

```ts
// 4. Flip → successful (status-guarded). ...
const { data: flipped, error: flipErr } = await admin
  .from('transactions')
  .update({ status: 'successful', provider_subscription_id: subscriptionPda })
  .eq('transaction_id', tx.transaction_id)
  .eq('status', 'pending')
  .select('transaction_id')
  .maybeSingle()
// ... (flipErr / !flipped handling) ...

// 5. Persist on-chain metadata on the subscription row (created by the trigger)
await admin
  .from('subscriptions')
  .update({
    provider_metadata: { subscriber, merchant, planId: String(planId), mint },
  })
  .eq('provider_subscription_id', subscriptionPda)
  .eq('payment_provider', 'solana_subs')          // <-- no error check (CONCUR-03)

// 6. FIRST charge: the split pull (school then platform).
try {
  await pullSplitForSubscription({ /* ...priceMajor: Number(tx.amount)... */ })
} catch (err) {
  // The subscription is confirmed even if the first crank pull is delayed; the
  // crank cron will retry. Log and still report confirmed.
  console.error(`[solana/verify] first pull failed for tx ${tx.transaction_id}:`, err)
}
return NextResponse.json({ confirmed: true })
```

The claim in the step-6 comment ("the crank cron will retry") is **false** as the
crank is written today.

`app/api/cron/solana-pull/route.ts`, the per-sub loop (lines 72-141) — the period
gate that prevents a first-period retry:

```ts
const periodEndSec = state.currentPeriodStartTs + state.periodHours * BigInt(3600)
if (BigInt(nowSec) < periodEndSec) continue // not due yet
```

`provider_metadata` shape the crank reads (lines 31-36, 72-74):
```ts
interface SolanaSubMeta { subscriber: string; merchant: string; planId: string; mint: string }
// ...
const meta = sub.provider_metadata as SolanaSubMeta | null
if (!meta?.subscriber || !meta.merchant || !meta.planId) continue
```

`pullSplitForSubscription` (`lib/payments/solana-subscription-pull.ts`) is
idempotent within a period: it accepts `alreadyPulledBase` and the on-chain
per-period cap reverts any over-pull, so re-invoking it for the same period after
a partial success is safe.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Unit tests| `npm run test:unit` | all pass            |
| Build     | `npm run build`     | exit 0              |

## Scope

**In scope**:
- `app/api/payments/solana/verify/route.ts` (the `handleSolanaSubsVerify` metadata write + first-charge block)
- `app/api/cron/solana-pull/route.ts` (the crank loop: honor `firstChargePending`)
- `tests/unit/solana-subscription-pull.test.ts` (extend — optional, see Test plan) OR a new `tests/unit/solana-first-charge.test.ts` for any pure helper you extract

**Out of scope** (do NOT touch):
- The status-guarded flip logic itself (lines 297-313) — it is correct and must remain `.eq('status','pending')`-guarded.
- The one-time Solana path (`tx.payment_provider === 'solana'`, lines 108-217) — different flow.
- Any DB migration — use the existing `subscriptions.provider_metadata` JSONB; do NOT add a column (that would re-introduce the plan-009 "unpushed migration" risk).
- `handle_new_subscription` / triggers.

## Steps

### Step 1: Make the metadata write reliable and carry the pending-charge marker

In `handleSolanaSubsVerify`, change the step-5 metadata update so it (a) is error-checked and (b) includes a `firstChargePending: true` flag in `provider_metadata`. Target shape:

```ts
const { error: metaErr } = await admin
  .from('subscriptions')
  .update({
    provider_metadata: { subscriber, merchant, planId: String(planId), mint, firstChargePending: true },
  })
  .eq('provider_subscription_id', subscriptionPda)
  .eq('payment_provider', 'solana_subs')
if (metaErr) {
  // Without metadata the crank cannot resolve on-chain coordinates — surface it.
  console.error(`[solana/verify] failed to persist subscription metadata for tx ${tx.transaction_id}:`, metaErr)
  return NextResponse.json({ error: 'Failed to finalize subscription' }, { status: 500 })
}
```

Note: the transaction is already flipped to `successful` at this point, so the
500 is a signal that finalization needs a retry; the verify endpoint is polled,
and a subsequent poll hits the "already confirmed" idempotent branch. (Document
this with a one-line comment.)

**Verify**: `npm run typecheck` → exit 0.

### Step 2: On first-charge success, clear the marker; on failure, leave it set

Replace the step-6 try/catch so a **successful** first pull clears
`firstChargePending`, and a **failed** one leaves it `true` (for the crank) and
is logged — the response stays `{ confirmed: true }` because the subscription IS
confirmed on-chain; only the off-chain charge is deferred:

```ts
try {
  await pullSplitForSubscription({ /* unchanged args, priceMajor: Number(tx.amount) */ })
  // Charged — clear the pending marker so the crank does not re-pull this period.
  await admin
    .from('subscriptions')
    .update({ provider_metadata: { subscriber, merchant, planId: String(planId), mint, firstChargePending: false } })
    .eq('provider_subscription_id', subscriptionPda)
    .eq('payment_provider', 'solana_subs')
} catch (err) {
  // First charge deferred: firstChargePending stays true; the crank (Step 3)
  // retries it on its next run, independent of the period gate.
  console.error(`[solana/verify] first pull failed for tx ${tx.transaction_id} — deferred to crank:`, err)
}
return NextResponse.json({ confirmed: true })
```

> If plan 011 has already landed and `pullSplitForSubscription` now takes
> `totalBase` (on-chain cap) instead of `priceMajor`, keep whatever argument
> shape the current code uses — do not change the amount source in this plan.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Make the crank treat `firstChargePending` as due-now

In `app/api/cron/solana-pull/route.ts`, update the `SolanaSubMeta` interface to
include `firstChargePending?: boolean`, and in the per-sub loop, **before** the
period-gate `continue`, short-circuit to "due" when the marker is set:

```ts
const firstChargeDue = meta.firstChargePending === true
// ... after computing periodEndSec ...
if (!firstChargeDue && BigInt(nowSec) < periodEndSec) continue // not due yet
```

After a successful `pullSplitForSubscription(...)` in the crank, clear the marker
(only if it was set) so the next run does not re-pull:

```ts
if (firstChargeDue) {
  await admin
    .from('subscriptions')
    .update({ provider_metadata: { ...meta, firstChargePending: false } })
    .eq('subscription_id', sub.subscription_id)
}
```

Important ordering: when `firstChargeDue`, do **not** also run
`extend_subscription_period` for that pass unless the period has genuinely rolled
(`BigInt(nowSec) >= periodEndSec`) — the first charge covers the *current* period
that has not rolled yet. Guard the existing `extend_subscription_period` call so
it only runs on a true period roll, not on a first-charge catch-up:

```ts
if (BigInt(nowSec) >= periodEndSec) {
  // ... existing extend_subscription_period call ...
}
```

**Verify**: `npm run typecheck` → exit 0; `npm run build` → exit 0.

### Step 4: Full verification

**Verify**:
- `npm run typecheck` → exit 0
- `npm run test:unit` → all pass (plus any new test from the Test plan)
- `npm run build` → exit 0
- `git status` → only in-scope files changed

## Test plan

- The two routes are not currently unit-tested directly (they need a Supabase +
  RPC fake). The cheapest meaningful test: if you extract the "is this sub due?"
  decision into a pure helper (e.g. `isPullDue({ firstChargePending, nowSec, periodEndSec })`),
  unit-test it in `tests/unit/solana-first-charge.test.ts` covering:
  - `firstChargePending=true`, period not rolled → **due**
  - `firstChargePending=false`, period not rolled → not due
  - `firstChargePending=false`, period rolled → due
  - `firstChargePending=true`, period rolled → due (and extend allowed)
  Model the file after `tests/unit/solana-subscription-pull.test.ts` (same
  vitest + `@/` import style).
- If you do not extract a helper, state in your report that the change is covered
  only by typecheck/build, and that route-level coverage is deferred to plan 014.

## Done criteria

ALL must hold:

- [ ] verify's subscription-metadata write is error-checked and sets `firstChargePending: true`
- [ ] a successful first charge sets `firstChargePending: false`; a failed one leaves it `true`
- [ ] the crank pulls a sub when `firstChargePending === true` even if the period has not rolled, and clears the marker after a successful pull
- [ ] the crank only calls `extend_subscription_period` on a genuine period roll
- [ ] `npm run typecheck` exits 0; `npm run build` exits 0; `npm run test:unit` passes
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `provider_metadata` is consumed by code outside these two files in a way that a
  new `firstChargePending` key would break (grep `provider_metadata` across
  `app/` and `lib/payments/` first).
- The crank's `extend_subscription_period` turns out to also advance on-chain
  state you must not double-advance — verify it is DB-only before relying on the
  period-roll guard.
- You find the trigger that creates the subscription already overwrites
  `provider_metadata` after verify sets it (a race that would drop the marker) —
  report it; the marker may need to be set by the crank's own detection instead.

## Maintenance notes

- This uses a JSONB flag deliberately to avoid an unpushed-migration dependency
  (see plan 009). If a `subscriptions.first_charge_pending` column is later added
  via a properly-deployed migration, migrate the flag to it and simplify.
- A reviewer should confirm the first-charge retry cannot double-charge: the
  on-chain per-period cap + `alreadyPulledBase` make a re-pull within the same
  period revert/skip, so even if both verify and the crank attempt it, only the
  uncovered amount moves.
- Pairs with plan 011 (charge from on-chain terms) — once 011 lands, the
  first-charge revert caused by price drift largely disappears, but the
  `firstChargePending` safety net still protects against transient RPC failures.
