# Plan 012: Solana payments are settled only after the transaction is finalized, not merely confirmed

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat e768e357..HEAD -- lib/payments/solana-split.ts app/api/payments/solana/verify/route.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (changes a commitment level; slower confirmation, no logic change)
- **Depends on**: none. Pairs with the deferred CHECKOUT-01 (poll timeout) — see Maintenance.
- **Category**: bug (money settlement finality)
- **Planned at**: commit `e768e357`, 2026-06-20

## Why this matters

The endpoint that **releases entitlements** for a Solana payment reads on-chain
state at the `'confirmed'` commitment. A `'confirmed'` block has one optimistic
confirmation and **can still be dropped in a chain reorg**; `'finalized'` (rooted,
~31 confirmations) cannot. Because confirming the transaction flips it to
`successful` and a trigger grants course access, settling at `'confirmed'` means a
payment that later disappears in a reorg can leave a student enrolled for a
transfer that never actually settled. For a money rail the conservative choice is
to confirm settlement at `'finalized'` and accept the extra latency (~13s), which
the client already absorbs by polling.

This is cheap insurance on the one path where being wrong gives away paid product.

## Current state

`lib/payments/solana-split.ts`, `verifySplitTransfer` (the money-confirming read):

```ts
// line 172
const sigInfo = await findReference(connection, reference, { finality: 'confirmed' })
// ...
// line 179
const parsed = await connection.getParsedTransaction(signature, {
  commitment: 'confirmed',
  maxSupportedTransactionVersion: 0,
})
```

`app/api/payments/solana/verify/route.ts`:

```ts
// line 155 — the Connection used for verifySplitTransfer (one-time Solana)
result = await verifySplitTransfer({
  connection: new Connection(rpcUrl, 'confirmed'),
  // ...
})
// line 271-273 — solana_subs subscribe confirmation
await findReference(new Connection(rpcUrl, 'confirmed'), new PublicKey(referencePubkey), {
  finality: 'confirmed',
})
```

The on-chain `getLatestBlockhash('finalized')` used when *building* the split tx
(`solana-split.ts:133`) is already finalized and is fine.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Unit tests| `npm run test:unit` | all pass            |
| Build     | `npm run build`     | exit 0              |

## Scope

**In scope**:
- `lib/payments/solana-split.ts` — `verifySplitTransfer`'s `findReference` finality + `getParsedTransaction` commitment
- `app/api/payments/solana/verify/route.ts` — the `Connection` at line 155, and the `solana_subs` `findReference` Connection + finality at lines 271-273

**Out of scope** (do NOT touch):
- `app/api/payments/solana/submit/route.ts` — that relay confirms an **init-authority** step, not a money settlement; changing it to finalized would slow the interactive Phantom flow with no settlement-safety benefit. (Noted, not changed.)
- The `getLatestBlockhash('finalized')` in `buildSplitTransaction` (already finalized).
- `app/api/payments/solana/tx/route.ts` (`new Connection(rpcUrl, 'confirmed')` there is only used to *build* a transaction, not to confirm settlement — leave it).
- Any amount/leg-matching logic in `verifySplitTransfer` — only the commitment strings change.

## Steps

### Step 1: Finalize the one-time split verification reads

In `lib/payments/solana-split.ts`, change `verifySplitTransfer`:
- `findReference(connection, reference, { finality: 'finalized' })`
- `getParsedTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 })`

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Finalize the verify route's settlement Connections

In `app/api/payments/solana/verify/route.ts`:
- Line 155: `new Connection(rpcUrl, 'finalized')` (the connection passed to `verifySplitTransfer`).
- Lines 271-273: `new Connection(rpcUrl, 'finalized')` and `{ finality: 'finalized' }` for the `solana_subs` subscribe confirmation.

Leave the `findReference` "not found yet → keep polling" behavior intact; with
`'finalized'` the client simply polls a few seconds longer before the transfer is
visible.

**Verify**: `npm run typecheck` → exit 0; `npm run build` → exit 0.

### Step 3: Full verification

**Verify**:
- `npm run typecheck` → exit 0
- `npm run test:unit` → all pass (if plan 014 added `verifySplitTransfer` tests, ensure their mock matches on `'finalized'` or is commitment-agnostic)
- `npm run build` → exit 0
- `grep -rn "'confirmed'" lib/payments/solana-split.ts app/api/payments/solana/verify/route.ts` → only matches that are NOT settlement reads remain (none should remain in `verifySplitTransfer` or the two verify Connections)
- `git status` → only in-scope files changed

## Test plan

- If `tests/unit/solana-split-verify.test.ts` exists (plan 014), confirm its fake
  `connection.getParsedTransaction` / `findReference` does not assert a specific
  commitment string (or update it to `'finalized'`). If it does not exist yet, no
  new test is required here — the change is commitment-level only and covered by
  typecheck/build.
- Manual (devnet, operator): a real Solana checkout still confirms end-to-end,
  just a few seconds slower. Note this in your report; do not run it in CI.

## Done criteria

ALL must hold:

- [ ] `verifySplitTransfer` uses `'finalized'` for both `findReference` and `getParsedTransaction`
- [ ] both settlement `Connection`s in `verify/route.ts` use `'finalized'`, and the `solana_subs` `findReference` uses `{ finality: 'finalized' }`
- [ ] `submit/route.ts` and `tx/route.ts` are unchanged
- [ ] `npm run typecheck` / `npm run build` exit 0; `npm run test:unit` passes
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A unit test asserts `'confirmed'` against the verification path and you cannot
  tell whether updating it to `'finalized'` changes intended behavior.
- The configured `SOLANA_RPC_URL` provider does not support `'finalized'`
  `getParsedTransaction` (rare) — report it rather than reverting silently.

## Maintenance notes

- `'finalized'` adds ~10–13s to confirmation. The client poll in
  `components/public/checkout-form.tsx` must allow enough attempts; the deferred
  finding **CHECKOUT-01** (the Solana poll has no timeout / fixed attempt budget)
  should be handled so a finalized confirmation is not cut off. Flag this to
  whoever picks up the money-UI batch.
- A reviewer should confirm no other code path treats a `'confirmed'`-level Solana
  read as settlement authority.
