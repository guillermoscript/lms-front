# Plan 012 (LARGE): Migrate Solana payment rails from `@solana/web3.js` + `@solana/pay` to `@solana/kit`

> **Executor instructions**: This is the **large follow-up plan** that spike 008
> (`plans/reports/008-solana-vuln-spike.md`, §3 option (c), §4) recommended and
> the operator has now approved scoping. It is **live on-chain money movement** —
> do NOT rush it, do NOT merge any phase without the devnet verification in
> "Devnet test harness" passing. Execute phase by phase, each phase its own commit
> and its own PR if you prefer. When a STOP condition hits, stop and write up what
> you found. Update the status row for this plan in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat HEAD -- lib/payments/solana-* app/api/payments/solana/ app/api/cron/solana-pull/ package.json` and re-run the recon greps below — the line numbers in this plan were captured at the commit named under "Status" and the Solana code is under active development on `feat/payments-lemonsqueezy-solana` (#334).

## Status

- **Priority**: P2 (security: clears 5 high + 7 moderate runtime advisories) / tech-debt (dual-SDK consolidation)
- **Effort**: XL (multi-day; security-critical verification rewrite)
- **Risk**: HIGH — rewrites transaction *building* and *verification* of real fee-split payments and auto-pull subscriptions. A subtle error mis-routes funds or skips a leg.
- **Depends on**: **PR #334 merged first** (this migrates the code #334 introduces; doing it on a separate base would conflict massively). Gated on user buy-in (granted 2026-06-16).
- **Category**: dependencies / migration / security
- **Planned at**: commit `7fd6ae16` (branch `feat/payments-lemonsqueezy-solana`), 2026-06-16
- **Supersedes**: the deferred H2 on-chain residual from the #334 security review (partial-leg resume wiring + charge-from-on-chain-terms) — Phase 5 here is its home.

## Why this matters

`npm audit --omit=dev` reports **12 runtime advisories (5 high / 7 moderate)**, all rooted in the legacy `@solana/web3.js@1.x` SDK era: `bigint-buffer` (HIGH DoS `GHSA-3gc7-fjrx-p6mg`, no patched version exists), `@solana/buffer-layout-utils`, `@solana/pay`, `@solana/spl-token`, `@solana/spl-token-group`, `@solana/spl-token-metadata`, and `web3.js → jayson → uuid`. Spike 008 proved there is **no `overrides` pin and no in-range bump** that clears them (`bigint-buffer@1.1.5` is the final release; spl-token 0.4.14 is latest and still pulls the chain). The **only durable fix is migrating the payment Solana code onto `@solana/kit`** — the modular SDK the repo already depends on (`@solana/kit@^6.9.0`, `@solana/subscriptions@^0.3.0`) and which does NOT pull the legacy chain. This removes the **entire class** of advisories at once, not just one.

It also pays down the dual-SDK tech debt: payments currently mix kit (RPC/signing) with legacy (`web3.js` `PublicKey`/`Transaction`, `@solana/pay`, `@solana/spl-token` ATA helpers), even *inside* the "kit" subscriptions module (see Current state). Consolidating onto one SDK removes a whole category of "which SDK owns this type" bugs.

## Current state (recon at `7fd6ae16`)

**Legacy import sites to migrate** (`grep -rlE "@solana/web3\.js|@solana/pay|@solana/spl-token" lib app`):

| File | LOC | Legacy surface | Notes |
|------|-----|----------------|-------|
| `lib/payments/solana-split.ts` | 196 | `Connection, PublicKey, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL` (web3); `getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction` (spl-token); `findReference, FindReferenceError` (pay) | **Security-critical.** Builds the two-leg split tx AND verifies both legs (`verifySplitTransfer`, lines 142-196). Migrate last-but-carefully; leg-amount/destination assertions must stay byte-identical. |
| `app/api/payments/solana/verify/route.ts` | 348 | `Connection, PublicKey, Keypair` (web3); `findReference, FindReferenceError` (pay); already imports `getBase58Encoder` from kit | The on-chain confirmation route. **H1 lives here** (`provider_charge_id` consume on flip) — preserve it. |
| `app/api/payments/solana/tx/route.ts` | 123 | `Connection, PublicKey` (web3) | One-time payment tx-request builder. |
| `app/api/payments/solana/subscribe-tx/route.ts` | 184 | `PublicKey, Keypair` (web3); already imports `getBase58Encoder` from kit | M2/M4 fixes live here — preserve the `.eq('tenant_id', …)` plan lookup and the write-once `.is('provider_metadata', null)`. |
| `lib/payments/solana-provider.ts` | 214 | `encodeURL` (pay) | Builds the Solana Pay URL for one-time payments. |
| `lib/payments/solana-subscriptions-provider.ts` | 205 | `encodeURL` (pay) | Builds the Solana Pay URL for subscriptions. |
| `lib/payments/solana-subscription-pull.ts` | 93 | `PublicKey` (web3); `getAssociatedTokenAddressSync` (spl-token) | Two-leg auto-pull split. **H2 resume primitive (`alreadyPulledBase`) lives here** — preserve it; Phase 5 wires it. |
| `lib/payments/solana-subscriptions.ts` | 723 | **dynamic** `import("@solana/spl-token")` + `import("@solana/web3.js")` at lines **264, 359, 555** for `getAssociatedTokenAddressSync` + `PublicKey` | "On kit" for RPC/signing but still falls back to legacy for ATA derivation. These 3 dynamic sites MUST migrate or the legacy deps cannot be dropped. |

**Not installed yet** — the kit-era program clients the migration needs:
`@solana-program/system` (replaces `SystemProgram.transfer`) and `@solana-program/token` (replaces the spl-token ATA + transfer helpers: `findAssociatedTokenPda`, `getCreateAssociatedTokenIdempotentInstruction`, `getTransferCheckedInstruction`). Confirm exact latest versions + exact exported names at execution time (`npm view @solana-program/token` / read its `.d.ts`) — do NOT trust the symbol names in this plan blindly; the kit program-client API has churned.

**No kit equivalent for `@solana/pay`.** `encodeURL`, `findReference`, `FindReferenceError` are web3.js-bound and have no kit port. They must be reimplemented (Phase 1) — both are small:
- `encodeURL` just string-builds a `solana:` URI (recipient + `amount`/`spl-token`/`reference`/`label`/`message` query params, or `solana:<link>` for a transaction request). Spec is stable and simple.
- `findReference` queries `getSignaturesForAddress(reference)` and returns the matching signature. Reimplement on the kit RPC (`createSolanaRpc(url).getSignaturesForAddress(address(ref), {…}).send()`). **Preserve `@solana/pay`'s exact semantics**: it returns the *oldest* (or per-options) signature whose tx lists the reference, and throws `FindReferenceError` when none is found yet (the caller treats that as "keep polling", NOT failure). Pin this in a unit test against the documented behavior before swapping it into the verify path.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Audit before | `npm audit --omit=dev` | 12 vulns (5 high / 7 moderate) |
| Trace chain | `npm ls @solana/web3.js @solana/pay @solana/spl-token bigint-buffer` | the legacy tree |
| Find usage | `grep -rnE "@solana/(web3\.js\|pay\|spl-token)" lib app` | call sites |
| Confirm kit client API | `npm view @solana-program/token version && npm view @solana-program/system version` | latest versions |
| Typecheck | `npx tsc --noEmit` (after `rm -rf .next`) | 0 errors |
| Unit | `npm run test:unit` | pass (extend, don't break) |
| Build | `npm run build` | exit 0 |
| Audit after | `npm audit --omit=dev` | the 5 Solana high + related moderates GONE |
| Devnet | see "Devnet test harness" | both legs land; cap enforced |

## Scope

**In scope**: the 8 files in the recon table; adding `@solana-program/system` + `@solana-program/token`; removing `@solana/web3.js` + `@solana/pay` + `@solana/spl-token` from `package.json` once no import remains; the `encodeURL`/`findReference` reimplementation; Phase 5 (H2 on-chain residual) **only behind devnet verification**.

**Out of scope**: Stripe / PayPal / Lemon Squeezy providers; the `subscriptions` DB schema; any change to the split *percentages* or revenue model; the on-chain program itself (you consume it, you don't redeploy it — except to a local validator for testing).

## Steps

### Phase 1 — Solana Pay compat shim (no behavior change, fully unit-tested)
Create `lib/payments/solana-pay-compat.ts` exporting `encodeURL`, `findReference`, `FindReferenceError` reimplemented on `@solana/kit` (`createSolanaRpc`, `address`, `getSignaturesForAddress`). Add `@solana-program/system` + `@solana-program/token` to deps (regenerate the lockfile with **npm matching CI's node-20 major** — see "Lockfile gotcha"). Do NOT touch any call site yet.

**Verify**: new `tests/unit/solana-pay-compat.test.ts` pins (a) `encodeURL` output byte-for-byte against `@solana/pay`'s output for a SOL transfer, an SPL transfer, and a transaction-request URL; (b) `findReference` returns the same signature `@solana/pay` would for a known fixture and throws `FindReferenceError` on none. `npm run test:unit` green; `@solana/pay` still installed (parallel, not yet removed).

### Phase 2 — Migrate `solana-split.ts` (the security-critical core)
Rewrite `buildSplitTransaction` and `verifySplitTransfer` onto kit: `Connection`→`createSolanaRpc`; `PublicKey`→`address`; `SystemProgram.transfer`→`@solana-program/system` transfer instruction; spl-token ATA/transfer helpers→`@solana-program/token`; reference-on-leg via a read-only `AccountMeta` (`AccountRole.READONLY`); `findReference`/`getParsedTransaction`→the shim + `rpc.getTransaction(sig,{encoding:'jsonParsed',maxSupportedTransactionVersion:0}).send()`. **The leg-matching in `verifySplitTransfer` (lines 164-193) must remain semantically identical** — same `(destination, exact baseAmount)` assertion per leg, same "destination is the ATA for SPL" rule (this is what binds the USDC mint — see the #334 review note), same throw-on-mismatch. `computeSplit` is pure and does NOT change.

**Verify**: extend `tests/unit/solana-split.test.ts` — `computeSplit` invariants still hold; add a `verifySplitTransfer` test feeding a crafted parsed-tx fixture (good legs → confirmed; wrong amount → throws; wrong destination → throws; missing platform leg when `platformBase>0` → throws). Then the **devnet split** (harness below) end-to-end before this phase is considered done.

### Phase 3 — Migrate routes + providers + pull + the 3 dynamic sites
Migrate `tx/route.ts`, `verify/route.ts` (keep H1 intact), `subscribe-tx/route.ts` (keep M2/M4 intact), `solana-provider.ts` + `solana-subscriptions-provider.ts` (swap `encodeURL`→shim), `solana-subscription-pull.ts` (keep H2 `alreadyPulledBase` intact), and the **3 dynamic legacy imports in `solana-subscriptions.ts` (264/359/555)** → `@solana-program/token` `findAssociatedTokenPda` + kit `address`.

**Verify**: `grep -rnE "@solana/(web3\.js|pay|spl-token)" lib app` returns **nothing** (including dynamic `import()`). `npx tsc --noEmit` 0; `npm run test:unit` green; `npm run build` exit 0.

### Phase 4 — Drop the legacy deps
Remove `@solana/web3.js`, `@solana/pay`, `@solana/spl-token` from `package.json`; delete the Phase-1 parallel-install of `@solana/pay`. Regenerate the lockfile (real install, CI-matched npm). 

**Verify**: `npm audit --omit=dev` — the 5 Solana highs (incl. `bigint-buffer`) and the related moderates are **gone** (residual non-Solana advisories, if any, noted). `npm ls bigint-buffer` → empty. `npm run build` exit 0. Full devnet harness re-run.

### Phase 5 — H2 on-chain residual (devnet-GATED; do NOT ship without it)
Now that the rails are on kit and a devnet harness exists, address the two residuals documented in `app/api/cron/solana-pull/route.ts:106-116`:
1. **Partial-leg resume**: wire `state.amountPulledInPeriod` (on-chain) into `pullSplitForSubscription`'s `alreadyPulledBase` so a period where the school leg landed but the platform leg's RPC failed resumes only the platform leg. The resume primitive + its monotonic-safety unit tests already exist (`tests/unit/solana-subscription-pull.test.ts`); this only wires the real on-chain value in. **Confirm the program's per-period counter reset timing on devnet first** — a stale `amountPulledInPeriod` read across a period boundary would skip a legitimate renewal charge.
2. **Charge from on-chain plan terms, not `plans.price`**: the cron charges the mutable DB `plans.price` while the on-chain cap is immutable, so an admin price edit makes renewals revert. Read the per-period amount from the on-chain plan account and charge that; treat `plans.price` as display-only.

**Verify**: on devnet — (a) force a platform-leg RPC failure mid-pull, re-run the cron, assert ONLY the platform leg pulls and the period advances exactly once; (b) edit `plans.price` after subscription creation, run a renewal, assert it still succeeds at the on-chain terms. These two behaviors are the whole reason Phase 5 was deferred — they are the STOP-without-devnet items.

## Devnet test harness (required for Phases 2, 4, 5)

No phase that changes money movement merges without this. Set up once:
- `solana-test-validator` (or a public devnet endpoint) with the Subscriptions program deployed (the same program id the code targets); a funded puller keypair (holds SOL for fees); a test USDC mint + funded payer/school/platform ATAs.
- Env: `SOLANA_RPC_URL` (devnet), `SOLANA_PULLER_SECRET_KEY`, `SOLANA_PLATFORM_WALLET`, `SOLANA_USDC_MINT` — **devnet values only, never a mainnet key in test config**.

Scenarios to assert:
1. **One-time split** (SOL and USDC): build via `buildSplitTransaction`, sign+submit, then `verifySplitTransfer` → `confirmed:true`; on-chain balances show school got `schoolBase`, platform got `platformBase`, sum == total.
2. **Tampered tx**: submit a tx paying the school the full amount (no platform leg) → `verifySplitTransfer` **throws** (must not confirm).
3. **Subscription create → first pull → renewal pull**: cap enforced (an over-cap or in-period pull reverts and the cron skips the row); period advances once per pull.
4. **Partial-leg resume (Phase 5)**: scenario (a) above.
5. **Price-drift (Phase 5)**: scenario (b) above.

Where Playwright env exists, also run `npx playwright test tests/playwright/payment-*.spec.ts`.

## Done criteria

ALL must hold:
- [ ] `grep -rnE "@solana/(web3\.js|pay|spl-token)" lib app` returns nothing (static AND dynamic imports)
- [ ] `@solana/web3.js`, `@solana/pay`, `@solana/spl-token` removed from `package.json`; `@solana-program/system` + `@solana-program/token` added; lockfile regenerated with CI-matched npm
- [ ] `npm audit --omit=dev` no longer lists `bigint-buffer`/`@solana/pay`/`@solana/spl-token`/`web3.js→jayson→uuid` advisories
- [ ] H1 (`provider_charge_id` consume), M2/M4 (tenant-scoped plan lookup, write-once metadata), and H2 (`alreadyPulledBase` resume) are all preserved through the migration
- [ ] `npx tsc --noEmit` 0 · `npm run test:unit` green (new compat + verify tests added) · `npm run build` exit 0
- [ ] Devnet harness scenarios 1-3 pass for Phases 2/4; scenarios 4-5 pass for Phase 5
- [ ] `plans/README.md` status row updated

## STOP conditions

Write up and stop (do not improvise) if:
- `@solana-program/token`/`system` lack an instruction builder that the legacy spl-token call needs an exact match for (e.g. the idempotent-create or transferChecked shape differs) — record the gap and the workaround before proceeding.
- The reimplemented `findReference` cannot reproduce `@solana/pay`'s polling semantics against a devnet fixture — the verify path depends on "no tx yet → keep polling", and a wrong throw here would mark unpaid orders failed (or paid). Do not swap it in until the unit test is green.
- Any devnet split lands with mismatched leg amounts/destinations — STOP; a verification rewrite that accepts a bad split is the worst-case failure.
- Phase 5: the on-chain per-period counter reset timing cannot be confirmed on devnet — leave Phase 5 deferred (the resume primitive stays dormant; behavior unchanged) and ship Phases 1-4 only.

## Maintenance notes

- **Lockfile gotcha** (cost ~3 CI cycles on #334): local npm is 11, CI is node-20 → npm 10. Regenerate with `rm -rf node_modules package-lock.json && npx -y npm@10 install` (real install, NOT `--package-lock-only`, which omits non-darwin optional-dep `node_modules` entries and breaks linux CI). Verify the lock has the `@rollup/rollup-*` platform entries master has.
- `solana-subscriptions.ts` is the largest file but mostly on kit already — budget the effort on `solana-split.ts` (verification correctness) and the `@solana/pay` shim, not LOC count.
- Re-run `npm audit` after the migration AND periodically — the kit line has its own advisory cadence; this plan removes the *legacy* class, not all future ones.
- This plan is the durable fix recommended by `plans/reports/008-solana-vuln-spike.md` §4 and absorbs the H2 deferral from the #334 security review (`plans/README.md` / memory `project_advisor_p2_p3_execution`).
