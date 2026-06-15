# Plan 006: Unit tests for payment-critical pure logic (fee split, webhook signature, dispatcher)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e58974fb..HEAD -- lib/payments/solana-split.ts lib/payments/lemonsqueezy-provider.ts lib/payments/webhook-dispatch.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: LOW (adds tests only; no app code changes)
- **Depends on**: plans/002 (Vitest runner). Best executed AFTER plan 003 so the tests describe the corrected behavior, but not strictly required.
- **Category**: tests
- **Planned at**: commit `e58974fb`, 2026-06-15

## Why this matters

The newest, highest-risk code in the repo — the multi-provider payment layer (`lib/payments/*`, ~3,300 LOC) — has **zero unit tests**. The only automated coverage is Playwright E2E, which cannot exercise money-math edge cases or webhook-signature verification cheaply. The fee-split math (`computeSplit`) decides exactly how much money goes to the school vs. the platform on every Solana payment; a flooring/rounding bug there is a real financial bug, and it is currently unverified. This plan adds fast, deterministic unit tests for the **pure and near-pure** payment logic, where tests are cheap and certain. It deliberately scopes OUT full webhook-handler/E2E concurrency harnesses (those need a live Supabase and belong in a separate E2E plan) — the goal here is to lock down the logic a unit test can actually pin.

## Current state

Target 1 — pure fee-split math, `lib/payments/solana-split.ts:48-58`:
```ts
export function computeSplit(
  amountMajor: number,
  platformPercent: number,
  decimals: number,
): SplitAmounts {
  const factor = Math.pow(10, decimals)
  const totalBase = Math.round(amountMajor * factor)
  const platformBase = Math.floor((totalBase * platformPercent) / 100)
  const schoolBase = totalBase - platformBase
  return { totalBase, platformBase, schoolBase }
}
```
Invariant the comments promise (lines 43-47): "the two legs always sum to exactly the total (no dust lost or created)." `SplitAmounts = { totalBase, platformBase, schoolBase }`. This is fully pure — ideal for unit tests.

Target 2 — Lemon Squeezy webhook signature verification, `lib/payments/lemonsqueezy-provider.ts` (a `verifyWebhook` method using HMAC over the raw body with `X-Signature`). Read the method before testing; it should be deterministic given (body, signature, secret).

Target 3 — shared dispatcher, `lib/payments/webhook-dispatch.ts:30-150` — `dispatchBillingEvent(event, { provider, admin })`. It takes the Supabase admin client as a **parameter**, so it can be driven with a hand-written fake that records calls. Its branching (`subscription.activated|renewed|canceled|expired|past_due`, and the `past_due` → log-only / no enum write behavior) is the regression-prone surface.

Test runner (from plan 002): `tests/unit/**/*.test.ts`, Vitest `node` environment, `@/` alias resolved. Use `tests/unit/smoke.test.ts` as the structural pattern.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Install   | `npm install`                        | exit 0              |
| Unit tests| `npm run test:unit`                  | all pass            |
| Single file | `npx vitest run tests/unit/solana-split.test.ts` | pass    |
| Typecheck | `npm run typecheck`                  | exit 0              |

## Scope

**In scope** (create only these test files):
- `tests/unit/solana-split.test.ts` (create) — **the required core deliverable**
- `tests/unit/lemonsqueezy-webhook.test.ts` (create) — if `verifyWebhook` is unit-testable without network/env (see Step 2; skip with a logged note if not)
- `tests/unit/webhook-dispatch.test.ts` (create) — dispatcher branching with a fake admin client

**Out of scope** (do NOT touch):
- Any file under `lib/payments/` or `app/` — this plan adds tests only; if a test reveals a bug, record it in your report, do NOT fix the source here (that is plan 003 or a new plan).
- Solana on-chain verification (`verifySplitTransfer`, `findReference`) — needs a live/mocked RPC; out of scope.
- Playwright E2E concurrency harness for webhook idempotency — separate plan.
- Provider factory env validation (`lib/payments/index.ts`) — out of scope.

## Git workflow

- Branch: `advisor/006-payment-unit-tests`
- Commit per test file or one combined: `test(payments): unit tests for fee split, LS webhook signature, dispatcher`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Test the fee-split math (required)

Create `tests/unit/solana-split.test.ts` importing `computeSplit` from `@/lib/payments/solana-split`. Cover:

- **Sum invariant**: for several `(amountMajor, platformPercent, decimals)` combos, `platformBase + schoolBase === totalBase` exactly. Include amounts that don't divide evenly (e.g. `amountMajor=10, platformPercent=20, decimals=6` → totalBase 10_000_000, platform 2_000_000, school 8_000_000; and a dust case like `platformPercent=33`).
- **Flooring**: platform share is floored; e.g. `totalBase=100, platformPercent=33` → platformBase 33, schoolBase 67.
- **Boundary `platformPercent=0`**: platformBase 0, schoolBase === totalBase.
- **Boundary `platformPercent=100`**: schoolBase 0, platformBase === totalBase.
- **Decimals**: `decimals=9` (SOL) and `decimals=6` (USDC) produce the expected `totalBase = round(amountMajor * 10**decimals)`.
- **Rounding of total**: `amountMajor` with float imprecision (e.g. `0.1`) → `totalBase` uses `Math.round`, assert exact integer.

**Verify**: `npx vitest run tests/unit/solana-split.test.ts` → all pass. If the **sum-invariant** test fails, that is a real bug in `computeSplit` — STOP and report (do not "fix" the test to match buggy output).

### Step 2: Test Lemon Squeezy webhook signature verification (best-effort)

Open `lib/payments/lemonsqueezy-provider.ts` and find `verifyWebhook`. If it is a pure function of `(rawBody, signature, secret)` using Node `crypto` HMAC:
- Create `tests/unit/lemonsqueezy-webhook.test.ts`. Construct a known body string, compute the expected HMAC-SHA256 hex with a **test-only** secret using Node `crypto` in the test, and assert `verifyWebhook` returns true for the correct signature and false for a tampered signature/body.
- Use a clearly fake secret literal in the test (e.g. `'test_secret_not_real'`). Never use a real secret value.

If `verifyWebhook` requires constructing the provider with live env/config that isn't injectable, do NOT force it — create the file with a single `it.skip` documenting why, and note it in your report. Do not refactor the provider to make it testable in this plan.

**Verify**: `npx vitest run tests/unit/lemonsqueezy-webhook.test.ts` → passes (or runs with a documented skip).

### Step 3: Test the dispatcher branching with a fake admin client

Create `tests/unit/webhook-dispatch.test.ts` importing `dispatchBillingEvent` from `@/lib/payments/webhook-dispatch`. Build a minimal fake `admin` that records calls and returns `{ data, error }` shapes the dispatcher expects. The chained query builder (`.from().update().eq().eq()` and `.from().select().eq().maybeSingle()` and `.rpc(...)`) needs a small fluent fake — model it as an object whose methods return `this` and a terminal that resolves `{ data, error: null }`.

Cover:
- `subscription.past_due` → makes **no** `subscriptions` write and **no** rpc call (log-only). Assert the fake recorded zero update/rpc calls. (This is the documented "no past_due enum" behavior at lines 134-138.)
- `subscription.canceled` → calls `.from('subscriptions').update({ subscription_status: 'canceled', ... })` matched by `provider_subscription_id` + `payment_provider`.
- `subscription.renewed` with `periodEnd` → calls `admin.rpc('extend_subscription_period', {...})` with the ISO `periodEnd`.
- `subscription.renewed` **without** `periodEnd` → no rpc call (warns and breaks, lines 108-111).
- `payment.succeeded` / `refund.succeeded` → no-op (no writes).

Keep the fake small and local to the test file. The point is to pin the **branching contract**, not to simulate Postgres.

**Verify**: `npx vitest run tests/unit/webhook-dispatch.test.ts` → all pass.

### Step 4: Full run

**Verify**: `npm run test:unit` → all files pass; `npm run typecheck` → exit 0.

## Test plan

- New files: `tests/unit/solana-split.test.ts` (required), `tests/unit/lemonsqueezy-webhook.test.ts` (best-effort), `tests/unit/webhook-dispatch.test.ts`.
- Structural pattern: `tests/unit/smoke.test.ts` from plan 002.
- Verification: `npm run test:unit` → all pass, including the new files.

## Done criteria

ALL must hold:

- [ ] `tests/unit/solana-split.test.ts` exists with ≥6 assertions covering sum-invariant, flooring, 0%/100% boundaries, and decimals
- [ ] `tests/unit/webhook-dispatch.test.ts` exists and asserts the `past_due` no-write and `renewed`/`canceled` behaviors
- [ ] Lemon Squeezy signature test exists (real assertions or a documented `it.skip`)
- [ ] `npm run test:unit` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] No file under `lib/` or `app/` modified (`git status` shows only `tests/unit/**`)
- [ ] `plans/README.md` status row updated
- [ ] If any test revealed a real bug, it is documented in the executor's report (not silently worked around)

## STOP conditions

Stop and report back if:

- The `computeSplit` sum-invariant test fails (real money bug — escalate, don't paper over).
- An excerpt does not match the live code.
- `dispatchBillingEvent`'s signature/branches differ materially from the "Current state" excerpt (the fake would test the wrong contract).
- Making `verifyWebhook` testable would require editing the provider source (out of scope — skip with a note instead).

## Maintenance notes

- For the reviewer: the highest-value file is `solana-split.test.ts` — confirm the dust/sum-invariant assertions are exact equalities, not approximate.
- Follow-up deferred (own plans): (1) E2E concurrency test for `/api/payments/webhook/[provider]` idempotency against a live Supabase; (2) characterization E2E for the `enroll_user` / `extend_subscription_period` / `handle_new_subscription` RPC chain; (3) proxy.ts tenant-resolution/role-guard tests. These need infrastructure beyond this unit-test plan.
- As new providers are added, each should get a signature-verification unit test alongside this set.
