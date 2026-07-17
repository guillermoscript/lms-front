# Plan 013: The SOL/USD oracle rejects stale and low-confidence prices, not just out-of-band ones

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat e768e357..HEAD -- lib/payments/sol-price.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (tightens validation on a fetch; failure mode is "throw → checkout retries", already handled)
- **Depends on**: none. Plan 014 adds the tests for this.
- **Category**: security (price-oracle integrity)
- **Planned at**: commit `e768e357`, 2026-06-20

## Why this matters

When a school accepts native SOL, the USD course price is converted to a SOL
amount at checkout using a live SOL/USD quote and that amount is **locked** for
settlement. The quote comes from a single Pyth Hermes HTTP read. Today the only
sanity check is a very wide absolute band (`0.5 … 100_000` USD/SOL) — there is
**no check that the price is fresh** (Pyth returns a `publish_time`; the code
ignores it) and **no check on the price's confidence interval** (Pyth returns
`conf`; ignored). A stale-but-in-band price (e.g. the feed froze) or a
wide-confidence reading mis-locks the SOL amount, so the student over- or
under-pays versus the USD price the school set, with no signal. Mispricing a
payment is worse than failing it — the file's own header says so — so the oracle
should fail closed on stale/uncertain reads.

## Current state

`lib/payments/sol-price.ts`:

```ts
// lines 36-41 — the response shape the code declares (note: no publish_time / conf)
interface HermesPriceUpdate {
  price?: { price: string; expo: number }
}
interface HermesResponse { parsed?: HermesPriceUpdate[] }

// lines 47-81 — getSolUsdPrice
export async function getSolUsdPrice(now: number = Date.now()): Promise<number> {
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.price
  // ... fetch json ...
  const update = json.parsed?.[0]?.price
  if (!update || typeof update.price !== 'string' || typeof update.expo !== 'number') {
    throw new Error('Malformed SOL/USD price response')
  }
  const price = Number(update.price) * Math.pow(10, update.expo)
  if (!Number.isFinite(price) || price < MIN_SOL_USD || price > MAX_SOL_USD) {
    throw new Error(`Implausible SOL/USD price: ${price}`)
  }
  cached = { price, at: now }
  return price
}

// lines 27-28 — current band
const MIN_SOL_USD = 0.5
const MAX_SOL_USD = 100_000
```

Pyth Hermes `/v2/updates/price/latest` returns, per feed, a
`parsed[i].price = { price: string, conf: string, expo: number, publish_time: number }`
(`publish_time` is unix **seconds**; `conf` is the confidence interval in the same
integer-scaled units as `price`). Both fields are present today and simply unread.

The caller already handles a thrown oracle cleanly —
`app/api/payments/checkout/route.ts:131-138` catches `getSolUsdPrice()` and
returns a 503 "Could not price SOL right now — try again".

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Unit tests| `npm run test:unit` | all pass            |

## Scope

**In scope**:
- `lib/payments/sol-price.ts` only

**Out of scope** (do NOT touch):
- `app/api/payments/checkout/route.ts` — it already handles a thrown oracle; no change needed.
- The cache TTL mechanism (`CACHE_TTL_MS`) — keep it; staleness here means the *feed's* publish_time, not the in-process cache age.
- `usdToLamports` — unchanged.

## Steps

### Step 1: Read `publish_time` and `conf` from the Hermes response

Extend `HermesPriceUpdate` to include `conf?: string` and `publish_time?: number`
(alongside `price` and `expo`). Keep them optional so a malformed response still
falls into the existing "Malformed …" throw.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Reject stale prices (publish_time too old)

Add a max staleness constant, e.g. `const MAX_PRICE_AGE_S = 60`. After parsing
`publish_time`, throw if it is missing or older than `MAX_PRICE_AGE_S` relative to
`now`:

```ts
const publishTime = update.publish_time // unix seconds
if (typeof publishTime !== 'number' || (now / 1000) - publishTime > MAX_PRICE_AGE_S) {
  throw new Error(`Stale SOL/USD price (publish_time=${publishTime})`)
}
```

(Use the injectable `now` param — already threaded for the cache — so tests can
control it.)

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Reject low-confidence prices (wide confidence interval)

Compute the confidence as a fraction of price and reject when it exceeds a small
threshold, e.g. `const MAX_CONF_FRACTION = 0.02` (2%). `conf` is scaled by the
same `expo` as `price`:

```ts
const conf = update.conf != null ? Number(update.conf) * Math.pow(10, update.expo) : null
if (conf == null || !Number.isFinite(conf) || conf / price > MAX_CONF_FRACTION) {
  throw new Error(`SOL/USD price confidence too wide (conf=${conf}, price=${price})`)
}
```

Do this **after** the existing band check so `price` is already known finite/positive.

**Verify**: `npm run typecheck` → exit 0.

### Step 4: (Optional, low-risk) tighten the absolute band

Leave `MIN_SOL_USD`/`MAX_SOL_USD` as-is unless you are confident — the staleness +
confidence checks are the substantive wins. If you do tighten, keep it generous
(e.g. 1 … 10_000) and note the change in your report.

### Step 5: Full verification

**Verify**:
- `npm run typecheck` → exit 0
- `npm run test:unit` → all pass (plan 014 adds the oracle tests; if it has not
  run yet, this step only confirms nothing else regressed)

## Test plan

- Plan 014 owns the oracle unit tests. This plan must keep `getSolUsdPrice`
  **testable**: it already takes an injectable `now` and exposes
  `__resetSolPriceCache()`. Ensure your new checks read `publish_time`/`conf` from
  the same `json.parsed?.[0]?.price` object a test can mock via `global.fetch`.
- If you want a fast local check before 014 lands, add a temporary test that
  mocks `fetch` to return `{ parsed: [{ price: { price: '15000000000', conf: '...', expo: -8, publish_time: <now-5s> } }] }`
  and asserts a sane price; a far-past `publish_time` throws; a wide `conf` throws.
  Move these into `tests/unit/sol-price.test.ts` under plan 014 (do not leave two
  copies).

## Done criteria

ALL must hold:

- [ ] `getSolUsdPrice` throws on a missing/old `publish_time` (older than `MAX_PRICE_AGE_S`)
- [ ] `getSolUsdPrice` throws on a missing/wide `conf` (fraction over `MAX_CONF_FRACTION`)
- [ ] the existing band + malformed + cache behavior is preserved
- [ ] `now` remains injectable and `__resetSolPriceCache` still exported (tests rely on both)
- [ ] `npm run typecheck` exits 0; `npm run test:unit` passes
- [ ] `git status` shows only `lib/payments/sol-price.ts` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The live Hermes response does **not** include `publish_time`/`conf` under
  `parsed[].price` for the configured `PYTH_HERMES_URL` / feed id — report the
  actual shape; the staleness/confidence checks must read real fields, not guessed
  ones.
- A 2% confidence threshold rejects normal mainnet readings in practice (SOL/USD
  conf is typically far tighter, but verify against a real sample before locking
  the constant) — report and propose a calibrated value rather than guessing.

## Maintenance notes

- A single feed remains a single point of failure; a true multi-source median is a
  larger change (out of scope). The staleness + confidence gate is the
  high-leverage subset. If a second source is added later, this function is the
  place to combine them.
- A reviewer should sanity-check `MAX_PRICE_AGE_S` against the cron/checkout
  cadence: it must be larger than normal Hermes publish intervals but small enough
  that a frozen feed is caught within one checkout.
