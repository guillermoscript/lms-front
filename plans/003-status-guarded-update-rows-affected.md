# Plan 003: Status-guarded transaction updates must verify a row was actually affected

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e58974fb..HEAD -- app/api/stripe/webhook/route.ts app/api/payments/solana/verify/route.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/002 (only for the optional unit test in the Test plan; the code fix itself does not require it)
- **Category**: bug / security
- **Planned at**: commit `e58974fb`, 2026-06-15

## Why this matters

Three payment-confirmation paths flip a transaction to `successful` with a status-guarded update — `.update({ status: 'successful' }).eq('transaction_id', id).eq('status', 'pending')` — and then only check the returned `error`. In the Supabase JS client, an `UPDATE` whose `WHERE` clause matches **zero rows returns no error**. So under concurrent webhook/verify delivery (the second request reads `status='pending'` before the first commits), the second update silently matches 0 rows, the code treats it as success, and it proceeds to **send a duplicate enrollment email** (Stripe) or **return `{ confirmed: true }` on a no-op** (Solana). The `.eq('status','pending')` guard keeps the *data* safe (it does not double-process), but the code cannot distinguish "I just transitioned this" from "someone else already did" — so duplicate side effects fire and genuine failures are invisible. The repo already has the correct pattern elsewhere (`app/api/exercises/media/analyze/route.ts:66-76`): add `.select('id').single()` and check whether a row came back. This plan applies that pattern to the three transaction-flip sites.

## Current state

The repo's **correct** pattern to copy — `app/api/exercises/media/analyze/route.ts:66-76`:
```ts
const { data: updated, error: updateError } = await adminClient
  .from('exercise_media_submissions')
  .update({ status: 'processing' })
  .eq('id', submissionId)
  .eq('status', 'pending') // only transition from pending → processing
  .select('id')
  .single()

if (updateError || !updated) {
  return new Response('Submission is already being processed', { status: 409 })
}
```

Site A — `app/api/stripe/webhook/route.ts:114-156` (inside `payment_intent.succeeded`). There is already an early skip at lines 109-112 (`if (txBefore?.status !== 'pending') break`), but that read-then-act has a race window before the update:
```ts
// app/api/stripe/webhook/route.ts:114-123
const { error } = await getSupabaseAdmin()
  .from('transactions')
  .update({ status: 'successful' })
  .eq('transaction_id', parseInt(transactionId))
  .eq('status', 'pending')

if (error) {
  console.error('Failed to update transaction:', error)
  return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
}

// Send enrollment confirmation email
if (txBefore?.user_id) {       // <-- fires even if the update above matched 0 rows
  ...sendEmail...
}
```

Site B — `app/api/payments/solana/verify/route.ts:160-174` (one-time Solana payment):
```ts
const { error: flipErr } = await admin
  .from('transactions')
  .update({ status: 'successful' })
  .eq('transaction_id', tx.transaction_id)
  .eq('status', 'pending')

if (flipErr) {
  console.error(`[solana/verify] failed to flip tx ${transactionId}:`, flipErr)
  return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
}
console.log(`[solana/verify] confirmed tx ${transactionId} (sig ${result.signature})`)
return NextResponse.json({ confirmed: true, signature: result.signature })
```

Site C — `app/api/payments/solana/verify/route.ts:259-267` (native auto-pull `solana_subs`, inside `handleSolanaSubsVerify`):
```ts
const { error: flipErr } = await admin
  .from('transactions')
  .update({ status: 'successful', provider_subscription_id: subscriptionPda })
  .eq('transaction_id', tx.transaction_id)
  .eq('status', 'pending')
if (flipErr) {
  console.error(`[solana/verify] failed to flip solana_subs tx ${tx.transaction_id}:`, flipErr)
  return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
}
```

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Install   | `npm install`          | exit 0              |
| Typecheck | `npm run typecheck`    | exit 0 (requires plan 002; else use `npm run build`) |
| Build     | `npm run build`        | exit 0              |
| Lint      | `npm run lint`         | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `app/api/stripe/webhook/route.ts` (Site A only — the `payment_intent.succeeded` flip)
- `app/api/payments/solana/verify/route.ts` (Sites B and C)

**Out of scope** (do NOT touch):
- The DB triggers (`trigger_manage_transactions`, `after_transaction_update`) that fire on the status change — they are correct; you are only changing how the route detects whether its own update applied.
- Other `case` branches in the Stripe webhook (`charge.refunded`, `payout.paid`, `payment_intent.payment_failed`).
- The on-chain validation logic in the Solana route (`verifySplitTransfer`, `findReference`, `getSubscriptionState`) — leave untouched.
- `lib/payments/webhook-dispatch.ts` and `app/api/payments/webhook/[provider]/route.ts` — that dispatcher uses idempotent `UPDATE`-by-event and is handled separately; do not change it here.

## Git workflow

- Branch: `advisor/003-update-rows-affected`
- One commit: `fix(payments): verify status-guarded transaction flips affected a row`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Site A — Stripe webhook: detect the no-op and skip the side effect

Change the update at `app/api/stripe/webhook/route.ts:114-118` to request the affected row, and only send the enrollment email when a row was actually flipped:

```ts
const { data: flipped, error } = await getSupabaseAdmin()
  .from('transactions')
  .update({ status: 'successful' })
  .eq('transaction_id', parseInt(transactionId))
  .eq('status', 'pending')
  .select('transaction_id')
  .maybeSingle()

if (error) {
  console.error('Failed to update transaction:', error)
  return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
}

if (!flipped) {
  // Concurrent delivery already flipped this transaction — do not re-send the
  // enrollment email or re-run side effects. The first delivery owns them.
  console.log(`Transaction ${transactionId} already flipped by a concurrent delivery — skipping side effects`)
  break
}
```

Then guard the existing email block so it only runs after a real flip. Since the `if (!flipped) break` above already exits the case, the existing email block at lines 125-156 will only run on a genuine flip — leave the email block itself unchanged. Use `.maybeSingle()` (not `.single()`), because a 0-row update with `.single()` would raise an error and be misclassified as a DB failure.

**Verify**: `npm run build` → exit 0. Manually re-read the file to confirm the email block is now unreachable when `!flipped`.

### Step 2: Site B — Solana one-time verify: return alreadyProcessed on no-op

Change `app/api/payments/solana/verify/route.ts:162-174`:

```ts
const { data: flipped, error: flipErr } = await admin
  .from('transactions')
  .update({ status: 'successful' })
  .eq('transaction_id', tx.transaction_id)
  .eq('status', 'pending')
  .select('transaction_id')
  .maybeSingle()

if (flipErr) {
  console.error(`[solana/verify] failed to flip tx ${transactionId}:`, flipErr)
  return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
}

if (!flipped) {
  // A concurrent/earlier verify already confirmed this transaction (idempotency
  // guard matched 0 rows). Report success without implying we just did the work.
  console.log(`[solana/verify] tx ${transactionId} was already confirmed`)
  return NextResponse.json({ confirmed: true, alreadyProcessed: true })
}

console.log(`[solana/verify] confirmed tx ${transactionId} (sig ${result.signature})`)
return NextResponse.json({ confirmed: true, signature: result.signature })
```

### Step 3: Site C — Solana subs verify: same treatment

Change `app/api/payments/solana/verify/route.ts:259-267`:

```ts
const { data: flipped, error: flipErr } = await admin
  .from('transactions')
  .update({ status: 'successful', provider_subscription_id: subscriptionPda })
  .eq('transaction_id', tx.transaction_id)
  .eq('status', 'pending')
  .select('transaction_id')
  .maybeSingle()
if (flipErr) {
  console.error(`[solana/verify] failed to flip solana_subs tx ${tx.transaction_id}:`, flipErr)
  return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
}
if (!flipped) {
  console.log(`[solana/verify] solana_subs tx ${tx.transaction_id} was already confirmed`)
  return NextResponse.json({ confirmed: true, alreadyProcessed: true })
}
```

**Important**: in Site C the pull/split logic at and after line 269 must NOT run on a no-op (it would attempt a second on-chain pull). Confirm the `if (!flipped) return ...` short-circuits before any pull is submitted. If the pull happens *before* this flip in the live code (drift), STOP and report.

### Step 4: Verify

**Verify**: `npm run build` → exit 0; `npm run lint` → exit 0.

## Test plan

If plan 002 (Vitest) has landed, this logic is hard to unit-test in isolation because it is inlined in route handlers calling Supabase. Do **not** refactor the handlers to make them testable as part of this plan (scope creep). Instead, plan 006 adds characterization E2E coverage for concurrent webhook/verify delivery. The done criteria below rely on build + lint + the grep gate.

Optional (only if trivial): add a note in plan 006's scope that the "duplicate email on concurrent delivery" regression is now covered by the `if (!flipped)` guard.

## Done criteria

ALL must hold:

- [ ] All three flip sites use `.select('transaction_id').maybeSingle()` and branch on `!flipped`
- [ ] `grep -n "update({ status: 'successful'" app/api/stripe/webhook/route.ts app/api/payments/solana/verify/route.ts` shows each immediately followed (within ~6 lines) by a `.select(` — verify by reading
- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] In Site A, the enrollment-email block cannot execute when the update matched 0 rows
- [ ] In Site C, no on-chain pull executes when the update matched 0 rows
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the three excerpts does not match the live code.
- The Solana route's pull/split (Site C) executes *before* the status flip in the live code — re-ordering side effects is beyond this plan's scope.
- `.maybeSingle()` causes a typecheck/build error for these queries (report the type error).
- You discover a fourth transaction-flip site with the same pattern not listed in Scope — report its file:line; do not fix it here without confirmation.

## Maintenance notes

- For the reviewer: the key behavioral change is "no side effects on a 0-row guarded update." Scrutinize that the Stripe email and Solana pull are gated on `flipped`.
- This is defense against concurrent delivery; the DB triggers remain the source of truth for enrollment/subscription creation.
- Future new payment providers that flip transactions must adopt this same `.select().maybeSingle()` + `!flipped` pattern; consider a shared helper `flipTransactionToSuccessful(admin, id)` in a later refactor (not now).
