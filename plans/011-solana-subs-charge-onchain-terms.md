# Plan 011: Native-Solana subscription charges follow the immutable on-chain plan terms, resume partial periods, and confirm terms match

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat e768e357..HEAD -- lib/payments/solana-subscriptions.ts lib/payments/solana-subscription-pull.ts app/api/cron/solana-pull/route.ts app/api/payments/solana/verify/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (L if the on-chain `terms.amount` is not trivially exposable)
- **Risk**: MED (changes the amount charged on every native-sub renewal)
- **Depends on**: none (independent of 010, but read its context; if both land, keep 010's `firstChargePending` flow intact)
- **Category**: bug
- **Planned at**: commit `e768e357`, 2026-06-20

## Why this matters

A native Solana subscription (`solana_subs`) has **three independent price
sources** that can diverge:

1. `transactions.amount` — snapshotted from `plans.price` at checkout.
2. `plans.price` — read again at subscribe-tx time to set the **immutable**
   on-chain per-period cap, and read **again** by the crank each renewal.
3. The on-chain plan's `terms.amount` — fixed forever at first creation.

The crank (`app/api/cron/solana-pull/route.ts:93`) splits the **current, mutable**
`plans.price` and pulls that. So after any admin price edit:

- **Price ↑** → `round(newPrice*1e6)` exceeds the immutable on-chain cap → the
  on-chain `transfer_subscription` reverts → `pullSplitForSubscription` throws →
  the period is never extended → the subscription silently stalls and access
  lapses. (Self-documented as residual **H2(b)**.)
- **Price ↓** → the pull is under the cap, succeeds, and the school/platform
  collect the **new lower** amount even though the buyer authorized up to the old
  cap — silent under-collection, no alert.

Separately, the crank **never passes `alreadyPulledBase`** even though
`pullSplitForSubscription` supports it, so a period whose first (school) leg
landed but whose platform-fee leg failed can never be completed — the platform
fee for that period is **permanently lost** (residual **H2(a)**), and the helper's
resume capability is exercised only in tests.

Finally, verify confirms the on-chain delegation merely *exists*; it never checks
that the delegation's **terms (amount / mint / period)** match the DB plan the
student is paying for (**SUBVERIFY-02**), so a delegation created under stale or
mismatched terms still confirms.

The single root fix: **make the on-chain plan `terms` the source of truth** for
the charge amount everywhere, resume partial periods, and assert terms match at
confirmation time.

## Current state

`lib/payments/solana-subscriptions.ts`, `getSubscriptionState` (lines 442-472)
returns the per-period progress but **not** the immutable cap:

```ts
export async function getSubscriptionState(p: {
  // ...
}): Promise<{
  amountPulledInPeriod: bigint;
  currentPeriodStartTs: bigint;
  periodHours: bigint;
  expiresAtTs: bigint;
} | null> {
  // ...
  return {
    amountPulledInPeriod: d.amountPulledInPeriod,
    currentPeriodStartTs: d.currentPeriodStartTs,
    periodHours: d.terms.periodHours,   // <-- d.terms is available here
    expiresAtTs: d.expiresAtTs,
  }
}
```

`d.terms.amount` (the immutable per-period cap, a `bigint` in base units) is
already on the fetched account object `d` — the function reads `d.terms.periodHours`
on the line above. (`terms.amount`/`terms.periodHours` are set at creation in
`buildCreatePlanTxBase64`/`ensurePlanOnChain`, lines ~179-181 and ~773-775.)

`lib/payments/solana-subscription-pull.ts` already supports resume and computes
the split from `priceMajor` (lines 58-92):

```ts
export interface PullSplitParams {
  // ...
  priceMajor: number
  platformPercent: number
  alreadyPulledBase?: bigint   // <-- already supported, not wired by the crank
}
const USDC_DECIMALS = 6
export async function pullSplitForSubscription(p: PullSplitParams): Promise<void> {
  // ...
  const { schoolBase, platformBase } = computeSplit(p.priceMajor, p.platformPercent, USDC_DECIMALS)
  const alreadyPulled = p.alreadyPulledBase ?? BigInt(0)
  if (alreadyPulled < BigInt(schoolBase)) { await pullOnce({ ... amountBase: BigInt(schoolBase) }) }
  if (platformBase > 0 && alreadyPulled < BigInt(schoolBase + platformBase)) { await pullOnce({ ... amountBase: BigInt(platformBase) }) }
}
```

`lib/payments/solana-split.ts` already has the base-unit splitter (use it instead
of re-deriving from a major amount):

```ts
export function computeSplitFromBase(totalBase: number, platformPercent: number): SplitAmounts {
  const platformBase = Math.floor((totalBase * platformPercent) / 100)
  const schoolBase = totalBase - platformBase
  return { totalBase, platformBase, schoolBase }
}
```

`app/api/cron/solana-pull/route.ts` (lines 90-128): the crank reads `state` (which
will now include the cap), reads mutable `plans.price` at line 93, and calls
`pullSplitForSubscription({ ... priceMajor: price ... })` with **no**
`alreadyPulledBase`. The H2(a)/H2(b) residuals are documented at lines 104-116.

`app/api/payments/solana/verify/route.ts`, `handleSolanaSubsVerify` (lines 284-289):
```ts
const state = await getSubscriptionState({ rpcUrl, merchant, planId, subscriber })
if (!state) { return NextResponse.json({ confirmed: false }) }   // existence only — no terms check
```

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Unit tests| `npm run test:unit` | all pass            |
| Build     | `npm run build`     | exit 0              |

## Scope

**In scope**:
- `lib/payments/solana-subscriptions.ts` (expose `termsAmountBase` from `getSubscriptionState`)
- `lib/payments/solana-subscription-pull.ts` (accept a `totalBase` that takes precedence over `priceMajor`)
- `app/api/cron/solana-pull/route.ts` (split the on-chain cap; pass `alreadyPulledBase`)
- `app/api/payments/solana/verify/route.ts` (assert on-chain terms match the DB plan before confirming)
- `tests/unit/solana-subscription-pull.test.ts` (extend for the `totalBase` path)

**Out of scope** (do NOT touch):
- The on-chain instruction builders (`pullOnce`, `buildSubscribeTx*`, `ensurePlanOnChain`) — read them, do not change their signatures.
- Any migration / DB schema.
- The one-time Solana flow (`payment_provider === 'solana'`).
- Removing the H2 comments — leave them; this plan resolves them and a reviewer will confirm before deleting.

## Steps

### Step 1: Expose the immutable per-period cap from `getSubscriptionState`

In `lib/payments/solana-subscriptions.ts`, add `termsAmountBase: bigint` to
`getSubscriptionState`'s return type and return `d.terms.amount` for it (the value
is already on `d`; confirm the exact field name by reading the decoded-account
shape near lines 442-472 — it is `d.terms.amount`, sibling of the already-used
`d.terms.periodHours`).

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Let `pullSplitForSubscription` charge a base-unit total

In `lib/payments/solana-subscription-pull.ts`, add an optional
`totalBase?: bigint` to `PullSplitParams`. When provided, derive the split from it
via `computeSplitFromBase(Number(totalBase), platformPercent)` (import from
`./solana-split`); otherwise keep the existing
`computeSplit(priceMajor, platformPercent, USDC_DECIMALS)` path so callers that
still pass `priceMajor` are unaffected. `totalBase` takes precedence. Keep the
`alreadyPulledBase` resume logic unchanged (it already compares against
`schoolBase`/`platformBase`, which now come from whichever splitter ran).

**Verify**: `npm run typecheck` → exit 0; `npm run test:unit` → existing
`solana-subscription-pull` tests still pass.

### Step 3: Crank charges the on-chain cap and resumes partial periods

In `app/api/cron/solana-pull/route.ts`, replace the mutable-price charge:

- Remove the dependency on `plans.price` for the **amount** (you may keep loading
  it for logging only). Pass `totalBase: state.termsAmountBase` and
  `alreadyPulledBase: state.amountPulledInPeriod` into `pullSplitForSubscription`.
- Because the cap now drives the amount, a price edit can no longer push the pull
  over the cap (H2(b) resolved) and a partial period now resumes only the missing
  leg (H2(a) resolved).
- Leave the existing behavior that a thrown pull skips `extend_subscription_period`
  (a genuine revert must NOT extend access). Keep the per-sub try/catch.

**Verify**: `npm run typecheck` → exit 0; `npm run build` → exit 0.

### Step 4: verify asserts on-chain terms match the DB plan

In `handleSolanaSubsVerify` (`app/api/payments/solana/verify/route.ts`), after
`getSubscriptionState` returns a non-null `state`, assert the on-chain terms match
the plan the student is paying for **before** flipping the transaction:

- Compute the expected cap from the DB plan: `expectedBase = Math.round(Number(tx.amount) * 1e6)` (USDC, 6 decimals; `tx.amount` is the plan price at checkout).
- If `state.termsAmountBase !== BigInt(expectedBase)`, refuse to confirm: return a 409/422 with a clear error (`On-chain subscription terms do not match this plan`) and do NOT flip the transaction. (Period match is implied by `periodHours`; optionally also assert `state.periodHours === BigInt(durationDays * 24)`.)
- Log the mismatch with both values for debugging.

This closes SUBVERIFY-02: a delegation created under different/stale terms can no
longer confirm a DB transaction for a different price.

**Verify**: `npm run typecheck` → exit 0.

### Step 5: Full verification

**Verify**:
- `npm run typecheck` → exit 0
- `npm run test:unit` → all pass (including the new `totalBase` test below)
- `npm run build` → exit 0
- `git status` → only in-scope files changed

## Test plan

- Extend `tests/unit/solana-subscription-pull.test.ts` (it already mocks
  `pullOnce`; follow its existing `vi.mock` pattern):
  - `totalBase` provided → split derives from `computeSplitFromBase(totalBase, pct)`; both legs pulled with the base-unit amounts (assert the `amountBase` args).
  - `totalBase` + `alreadyPulledBase = schoolBase` → only the platform leg pulls.
  - `totalBase` takes precedence when both `totalBase` and `priceMajor` are passed.
  - `priceMajor`-only path still behaves exactly as before (regression).
- Verification: `npm run test:unit` → all pass, including the new cases.

## Done criteria

ALL must hold:

- [ ] `getSubscriptionState` returns `termsAmountBase`
- [ ] `pullSplitForSubscription` charges `totalBase` when provided, else `priceMajor` (unchanged default)
- [ ] the crank passes `totalBase: state.termsAmountBase` and `alreadyPulledBase: state.amountPulledInPeriod`
- [ ] verify refuses to confirm when on-chain terms ≠ DB plan terms
- [ ] `npm run typecheck` / `npm run build` exit 0; `npm run test:unit` passes with new cases
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The decoded subscription account does NOT expose `terms.amount` where this plan
  assumes (near `getSubscriptionState`) — report the actual decoded shape; the
  cap may need to be read from the plan account (`fetchPlanFromSeeds`, used near
  lines 236/300/552/598) instead, which is a larger change.
- `amountPulledInPeriod`'s reset semantics across a period boundary are unclear
  (a stale value would skip a legitimate charge) — the H2(a) comment flags this as
  needing a devnet check; if you cannot confirm it resets to 0 at each period
  roll, STOP and report rather than wiring `alreadyPulledBase` blind.
- Existing `pullSplitForSubscription` callers break under the new optional param.

## Maintenance notes

- After this lands and a reviewer confirms on devnet, the H2(a)/H2(b) comment
  block in `solana-pull/route.ts` (lines 104-116) should be removed in the same or
  a follow-up PR.
- The amount source is now the on-chain cap everywhere except verify's
  `expectedBase` derivation (still `tx.amount`) — that is intentional: verify uses
  the DB value only to *reject* a mismatched on-chain plan, never to charge.
- A reviewer should scrutinize the precision of `Math.round(Number(tx.amount)*1e6)`
  vs the on-chain `bigint` cap; for USDC course prices this is exact, but a future
  high-precision currency would need a `bigint`-native derivation.
