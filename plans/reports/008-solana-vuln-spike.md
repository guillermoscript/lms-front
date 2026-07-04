# Spike report 008 — Solana dependency vulnerability (`bigint-buffer` DoS)

**Date:** 2026-06-15
**Branch:** `advisor/008-solana-vuln-spike` (off the P2/P3 stack tip `c6f8c8ce`)
**Outcome:** **No dependency change applied** (STOP condition hit). Recommend a
follow-up migration plan (option c). Details below.

---

## 1. The vulnerable chain

`npm ls bigint-buffer`:

```
lms-front@0.1.0
└─┬ @solana/spl-token@0.4.14
  └─┬ @solana/buffer-layout-utils@0.2.0
    └── bigint-buffer@1.1.5
```

- **Advisory:** `GHSA-3gc7-fjrx-p6mg` — *"bigint-buffer Vulnerable to Buffer
  Overflow via `toBigIntLE()` Function."*
- **Severity:** HIGH, **CVSS 7.5** — vector `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`.
  Note `C:N / I:N / A:H`: **availability only**. This is a Denial of Service
  (crash / hang), **not** RCE and **not** a confidentiality/integrity break.
  CWE-120 (classic buffer overflow) in a native addon read path.
- **Advisory range:** `<=1.1.5`. `bigint-buffer@1.1.5` is the **latest and final**
  published version (`npm view bigint-buffer versions` ends at 1.1.5; package is
  effectively unmaintained). **Therefore every published version is vulnerable —
  there is no patched version to upgrade or pin to.**
- `npm audit`'s only `fixAvailable` is `@solana/spl-token@0.1.8`
  (`isSemVerMajor: true`) — an ancient **major downgrade** from 0.4.14 that would
  remove the instruction builders the payment code relies on. Not viable.

Related advisories in the same Solana subtree (same root cause / SDK era, all
runtime, from `npm audit --omit=dev` = **12 vulns, 7 moderate / 5 high**):
`@solana/buffer-layout-utils`, `@solana/pay`, `@solana/spl-token`,
`@solana/spl-token-group`, `@solana/spl-token-metadata`, `@solana/web3.js`
(→ `jayson` → `uuid`). All trace back to the legacy `@solana/web3.js@1.x` SDK.

## 2. App reachability of the vulnerable function

The vulnerable `toBigIntLE()` lives in `bigint-buffer`'s **decode/read** path. In
the Solana ecosystem it is invoked by `@solana/buffer-layout-utils`'s `u64`/
`bigInt` layout when **deserializing** on-chain account or mint state (e.g.
`@solana/spl-token`'s `unpackAccount` / `getAccount` / `getMint` /
`decodeTransferCheckedInstruction`).

What the app actually imports from `@solana/spl-token` (`grep -rn` over `lib/ app/`):

| Site | Symbol(s) | What it does | Hits `toBigIntLE`? |
|------|-----------|--------------|--------------------|
| `lib/payments/solana-split.ts:29-33` | `getAssociatedTokenAddressSync`, `createAssociatedTokenAccountIdempotentInstruction`, `createTransferCheckedInstruction` | Derive ATAs (PDA hashing) + **build/encode** transfer instructions | No — PDA derivation is hashing; instruction building **encodes** amounts via the write path (`toBufferLE`), not the vulnerable `toBigIntLE` read path |
| `lib/payments/solana-subscription-pull.ts:16` | `getAssociatedTokenAddressSync` | Derive delegator/user ATA | No — pure PDA derivation |
| `lib/payments/solana-subscriptions.ts:264,359,555` | dynamic `import("@solana/spl-token")` → `getAssociatedTokenAddressSync` | Derive ATA when building subscribe/pull txs | No — pure PDA derivation |

`@solana/pay` usage: `encodeURL` (`solana-provider.ts`,
`solana-subscriptions-provider.ts`) and `findReference` / `FindReferenceError`
(`solana-split.ts`, `app/api/payments/solana/verify/route.ts`). `findReference`
queries signatures-for-address; neither decodes account buffers via spl-token.

**On-chain verification** (`verifySplitTransfer`, `solana-split.ts:142-196`) reads
transactions via `connection.getParsedTransaction(...)` and walks the **RPC's
pre-parsed JSON** instruction list manually — it does **not** call any
`@solana/spl-token` account/mint decoder. So the attacker-controlled bytes from
chain never flow through `toBigIntLE` in our code path.

**Conclusion:** `toBigIntLE` is **not reachable from app code with
attacker-controlled input** as written. The app uses spl-token for address
derivation and instruction *encoding* only; the deserialize path that triggers
the overflow is not exercised. Even if it were, the realistic impact is a DoS of
the affected server route/worker (CVSS `A:H`) — **not** fund misrouting or data
disclosure (`C:N / I:N`). Funds-correctness is guarded separately by
`verifySplitTransfer`'s explicit leg-amount/destination assertions.

## 3. Remediation options

### (a) Pin a non-vulnerable `bigint-buffer` via npm `overrides` — **IMPOSSIBLE**
There is no non-vulnerable version. Advisory range `<=1.1.5`; 1.1.5 is the latest
and final release. Overriding `@solana/buffer-layout-utils` to its latest `0.3.0`
does **not** help either — `0.3.0` still declares `bigint-buffer: ^1.1.5`
(`npm view @solana/buffer-layout-utils@0.3.0 dependencies`). **No `overrides`
pin to a published safe version can clear this advisory.** Blast radius: N/A.
- *Interim-only variant (NOT recommended):* one could `overrides` to a community
  fork (e.g. a maintained `bigint-buffer` fork) or `patch-package` the native
  addon. That is a **supply-chain substitution** on live payment rails — not
  "provably safe," and exactly what this spike is meant to avoid. Mentioned for
  completeness; do not apply without a dedicated security review.

### (b) Bump `@solana/spl-token` / `@solana/pay` within a compatible range — **NO-OP**
`@solana/spl-token@0.4.14` is already the **latest** release; the whole `0.4.x`
line depends on `@solana/buffer-layout-utils@^0.2.0` → `bigint-buffer`. There is
no higher 0.4.x or any non-major spl-token that drops the chain. `@solana/pay`
latest is `1.0.18` (we're on `0.2.6`) — a **major** bump tied to the modular SDK,
out of scope for a contained change. Blast radius if attempted: high (major SDK
churn on payment rails). Not viable as a "safe in-range" fix.

### (c) Migrate the payment Solana code to `@solana/kit` — **RECOMMENDED (as a new plan)**
`@solana/kit@^6.9.0` (+ `kit-plugin-rpc`, `kit-plugin-signer`,
`@solana/subscriptions@^0.3.0`) is **already a dependency** — the subscriptions
feature is partway onto the modular SDK while payments still use legacy
`@solana/web3.js@1.x` + `@solana/pay@0.2.x` + `@solana/spl-token`. The modular
`@solana/kit` line does **not** pull the legacy `bigint-buffer`/`jayson`/`uuid`
chain, so consolidating payments onto it removes this **entire class** of
advisories at once (not just `bigint-buffer`).
- **Blast radius:** large. Touches `lib/payments/solana-split.ts` (197 LOC),
  `solana-provider.ts`, `solana-subscriptions.ts` (723 LOC),
  `solana-subscriptions-provider.ts`, `solana-subscription-pull.ts`, and routes
  `app/api/payments/solana/{tx,verify,subscribe-tx}/route.ts` +
  `app/api/cron/solana-pull/route.ts`. Rewrites transaction *building* and the
  *verification* leg-matching against `@solana/kit` primitives.
- **Risk:** HIGH if rushed — this is live on-chain money movement and fee splits.
  Needs devnet payment E2E (`tests/playwright/payment-flows.spec.ts`) + a manual
  devnet split payment before/after, and a careful diff of the leg-amount
  assertions. Multi-day effort. **Requires explicit user buy-in.**

## 4. Recommendation

**Do not apply any dependency change in this spike** — option (a) is impossible
and (b) is a no-op/major. The advisory is a HIGH-CVSS **DoS** that, per §2, is
**not reachable on a hot path with attacker input** in the current code, so it is
**not an emergency**: accept the residual risk short-term (documented here),
and schedule **option (c)** — a `@solana/web3.js`/`@solana/pay` → `@solana/kit`
migration for the payment rails — as its **own large plan** gated on user buy-in.
That migration is the only durable fix (it also clears the sibling
`web3.js`/`jayson`/`uuid` advisories) and aligns payments with the SDK the
subscriptions feature already uses.

**Interim hardening (optional, separate decision):** if a quick risk reduction is
wanted before the migration, evaluate a vetted `overrides`→maintained-fork of
`bigint-buffer` *under a security review* — but treat it as a supply-chain change,
not a free win.

## 5. Verification performed (read-only)

```
npm audit --omit=dev            # 12 vulns (7 moderate, 5 high); bigint-buffer HIGH
npm ls bigint-buffer            # @solana/spl-token@0.4.14 → buffer-layout-utils@0.2.0 → bigint-buffer@1.1.5
npm view bigint-buffer versions # ends at 1.1.5 (latest = only candidate, in-range)
npm view @solana/spl-token version                 # 0.4.14 (already latest)
npm view @solana/buffer-layout-utils@0.3.0 dependencies  # still bigint-buffer ^1.1.5
npm view @solana/pay version    # 1.0.18 (major ahead of installed 0.2.6)
grep -rn "@solana/spl-token|@solana/pay" lib/ app/  # reachability table in §2
```

No `package.json` / `package-lock.json` / `lib/payments/` changes were made on
this branch — the spike is report-only.
