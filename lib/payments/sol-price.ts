/**
 * SOL/USD price oracle (issue #280 — USD-denominated native-SOL settlement).
 *
 * Products/plans are priced in USD. To accept *native SOL* while still
 * receiving the USD value, we must convert the USD price → a SOL amount at the
 * live exchange rate AT THE MOMENT OF CHECKOUT, then LOCK that amount (the rate
 * moves; verification compares against the locked amount, never a fresh quote).
 *
 * USDC needs no oracle — it is a 1:1 USD stablecoin, so `amount = price`.
 *
 * Source: Pyth Network's Hermes price service (decentralized, no API key). We
 * read the SOL/USD feed and apply the feed's exponent. The price is sanity-
 * bounded and cached briefly; on any failure we THROW — we never fall back to a
 * guess, because mispricing a payment is worse than failing it.
 */

// Pyth SOL/USD price feed id (Hermes, hex, no 0x prefix). Overridable via env
// in case the feed id changes or a different feed is preferred.
const SOL_USD_FEED_ID =
  process.env.PYTH_SOL_USD_FEED_ID ||
  'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'

const HERMES_BASE = process.env.PYTH_HERMES_URL || 'https://hermes.pyth.network'

// Plausible SOL/USD band. A price outside this range almost certainly means a
// bad/garbage feed read — reject rather than mis-charge.
const MIN_SOL_USD = 0.5
const MAX_SOL_USD = 100_000

// Brief in-process cache so a burst of checkouts doesn't hammer Hermes. The
// quote is locked per-transaction at checkout, so a few seconds of staleness is
// immaterial to settlement correctness.
const CACHE_TTL_MS = 30_000
let cached: { price: number; at: number } | null = null

interface HermesPriceUpdate {
  price?: { price: string; expo: number }
}
interface HermesResponse {
  parsed?: HermesPriceUpdate[]
}

/**
 * Current SOL price in USD (USD per 1 SOL). Throws on failure or implausible
 * value. Cached for {@link CACHE_TTL_MS}.
 */
export async function getSolUsdPrice(now: number = Date.now()): Promise<number> {
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.price
  }

  const url = `${HERMES_BASE}/v2/updates/price/latest?ids[]=${SOL_USD_FEED_ID}`
  let json: HermesResponse
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timeout)
    if (!res.ok) {
      throw new Error(`Hermes HTTP ${res.status}`)
    }
    json = (await res.json()) as HermesResponse
  } catch (err) {
    console.error('[sol-price] failed to fetch SOL/USD from Pyth Hermes:', err)
    throw new Error('Could not fetch SOL/USD price')
  }

  const update = json.parsed?.[0]?.price
  if (!update || typeof update.price !== 'string' || typeof update.expo !== 'number') {
    throw new Error('Malformed SOL/USD price response')
  }

  // Pyth prices are integers scaled by 10^expo (expo is typically negative).
  const price = Number(update.price) * Math.pow(10, update.expo)
  if (!Number.isFinite(price) || price < MIN_SOL_USD || price > MAX_SOL_USD) {
    throw new Error(`Implausible SOL/USD price: ${price}`)
  }

  cached = { price, at: now }
  return price
}

/** Reset the in-process cache (tests). */
export function __resetSolPriceCache() {
  cached = null
}

/**
 * Convert a USD major-unit amount to lamports at the given SOL/USD rate.
 * `lamports = round(usd / solUsd * 1e9)`. Caller supplies the locked rate.
 */
export function usdToLamports(usdMajor: number, solUsd: number): number {
  if (!(solUsd > 0)) throw new Error('Invalid SOL/USD rate')
  return Math.round((usdMajor / solUsd) * 1_000_000_000)
}
