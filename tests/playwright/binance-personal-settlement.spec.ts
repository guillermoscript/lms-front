/**
 * A Binance Pay transfer settles a real transaction and grants real access —
 * over real HTTP, through the real adapter, against the real database (#740).
 *
 * WHY THIS FILE EXISTS. `binance_personal` is a poll-confirmed rail: there is no
 * webhook, and the ONLY thing that can turn a pending transaction into a
 * settled one is the server reading the school's own Binance Pay history
 * (`GET /sapi/v1/pay/transactions`) and matching a transfer against it. Nothing
 * has ever driven that end to end. `tests/unit/binance-personal-verify-route.test.ts`
 * mocks `@/lib/supabase/server` (including `auth.getUser`), `@/lib/supabase/tenant`,
 * `@/lib/rate-limit`, `@supabase/supabase-js` AND the whole
 * `binance-personal-reconcile` module, then calls `POST` with a hand-faked
 * `NextRequest` — so it pins the guard ladder and nothing else.
 * `tests/unit/binance-personal.test.ts` is offline by construction ("No network
 * is touched") and exercises the pure functions against a fluent Supabase fake.
 * Between them, no test in this repo has ever built the real signed request,
 * decrypted a real credential row, or watched a real Postgres trigger grant a
 * real entitlement on this rail.
 *
 * WHAT IS SYNTHETIC AND WHAT IS REAL. Exactly one thing is synthetic: Binance
 * itself. A `node:http` server inside the Playwright process answers
 * `/sapi/v1/pay/transactions` with the shape `normalizePayHistory` parses, and
 * `BINANCE_PAY_API_BASE` points the app at it. Everything else is the shipping
 * code — the real login and session cookie, `proxy.ts` deriving `x-tenant-id`
 * from the subdomain, the route's own `supabase.auth.getUser()`, the RLS-scoped
 * transaction read, `loadBinancePersonalConfig` reading a real
 * `tenant_payment_wallets` row and AES-256-GCM-decrypting it, the real
 * `signSapiQuery` HMAC (this file recomputes it independently, with `node:crypto`,
 * rather than trusting the adapter's own helper), the real match rules, the real
 * status-guarded flip, and the real `after_transaction_update` →
 * `trigger_manage_transactions` → `enroll_user` → `entitlements` chain.
 *
 * What it deliberately does NOT prove: that Binance's live payload still looks
 * like this fixture, and that a real key is accepted — only a funded account
 * proves either.
 *
 * THE ONE PRODUCTION CHANGE THIS NEEDED. `lib/payments/binance-personal-provider.ts`
 * hardcoded `https://api.binance.com`, so any spec that got past the config
 * check made a genuine outbound call and landed on 503. It now reads
 * `BINANCE_PAY_API_BASE` at CALL time (never set in production). A module-level
 * const would freeze whatever the environment looked like when Next first
 * imported the file, which is the wrong shape for a value that must follow the
 * server process. The adapter accepts LOOPBACK origins only and otherwise falls
 * back to Binance: the request carries the school's decrypted API key, so a
 * stray non-loopback value would exfiltrate it on every poll.
 *
 * WHY THE ENTITLEMENT, NOT THE STATUS, IS THE ASSERTION THAT MATTERS. A settled
 * `transactions` row is half a sale; access lives in `entitlements` (since
 * `20260516150000`) and is written by a trigger. Migration
 * `20260914120000_trigger_manage_transactions_search_path.sql` is what that
 * class of bug looks like — the trigger died under a locked `search_path` and
 * refunds silently stopped applying. To be accurate about credit: that instance
 * was caught by `lemonsqueezy-webhook-settlement.spec.ts`, and it could not have
 * been caught here, because this rail's flip is a service-role PostgREST write
 * (`search_path = public`) rather than a call from a hardened SQL function. What
 * this file owns is the proof that the flip → trigger → entitlement chain runs
 * AT ALL for binance_personal, for every course the product maps to.
 *
 * AMBIGUITY IS NOT WHAT IT SOUNDS LIKE. Two transfers that both match do NOT
 * make a reconcile ambiguous — `lib/payments/binance-personal-reconcile.ts:161`
 * simply takes the first candidate. Ambiguity is a property of the LEDGER, not
 * of the history: it happens when rule 1 (note carries the payment code) finds
 * nothing, an exact-amount transfer exists, and MORE THAN ONE pending
 * binance_personal transaction in that tenant shares the amount — so no transfer
 * can be attributed to one buyer. The case below therefore seeds two colliding
 * pending transactions and two note-less exact-amount transfers; asserting on
 * two transfers alone would assert something false.
 *
 * THE FIXTURE IS SPEC-OWNED, not seeded. This spec owns two tenants: the school
 * being paid (`qa-binance-personal`) and a second one that exists only to own
 * the transaction the buyer may not reach. `supabase/seed.sql` has no
 * `tenant_payment_wallets` row at all, and the seeded tenants are load-bearing
 * for a dozen other specs. The BUYER is the seeded student — creating an auth
 * user by SQL skips `handle_new_user()` — so nothing of hers is deleted in
 * teardown beyond rows this file created. One side effect is worth knowing:
 * logging her into a QA subdomain rewrites her `app_metadata.tenant_id` (the
 * claim sync at `proxy.ts:441`), exactly as `loop-3-student-pays.spec.ts` does;
 * her next login elsewhere syncs it back.
 *
 * RATE LIMITS. The verify route spends `paymentPollLimiter` (30/min/user, SHARED
 * with both Solana verify routes on the bare user id) and, only when the school
 * is configured, `binancePayHistoryLimiter` (12/min/tenant). This file makes 5
 * POSTs and just 2 outbound Binance calls, and the tenant budget is its own. The
 * counters are NOT run-long — `lib/rate-limit.ts` gives the LRU `ttl: interval`
 * and only `set`s a key at count 0, so each one expires 60 s after its first
 * request — but they are per PROCESS, and a polling loop here would spend a whole
 * 12/min tenant budget inside one test, so do not add one.
 *
 * ORDERING. Serial and desktop-only: the tests share DB state and the first one
 * is the only moment at which this school has no credentials, so it is also what
 * arranges the wallet row for the rest.
 */
import { createServer, type Server } from 'node:http'
import { createHmac } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { login } from './utils/auth'
import {
  SEEDED,
  addMember,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  insertCourse,
  tenantBase,
  type QaTenant,
} from './utils/plan-gate-fixtures'
// Relative, not `@/…`: the credentials row MUST be written with the same helper
// the app decrypts with (16-byte IV, sha256 of the RAW master key — a hand-rolled
// 12-byte-IV copy produces a row `decryptCredential` cannot read), and no runtime
// import in this suite exercises Playwright's tsconfig-path resolution today.
import { encryptCredential, getPaymentCredentialsKey } from '../../lib/payments/credentials'

const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000302',
  slug: 'qa-binance-personal',
  name: 'QA Binance Personal',
  // No throwaway platform plan — the tenant stays on `free`. `destroyQaTenant`
  // deletes by this slug, which simply matches nothing.
  planSlug: 'e2e-binance-personal-no-plan',
}

/** A second school, owning nothing but the transaction the buyer may not verify. */
const OTHER: QaTenant = {
  id: '00000000-0000-0000-0000-000000000303',
  slug: 'qa-binance-personal-other',
  name: 'QA Binance Personal (other school)',
  planSlug: 'e2e-binance-personal-other-no-plan',
}

const QA_BASE = tenantBase(QA.slug)
/**
 * The tenant SUBDOMAIN, not the platform root. `getCurrentTenantId()` reads the
 * `x-tenant-id` header `proxy.ts` derives from the host, and the route filters
 * the transaction by it — a POST to the root host resolves the DEFAULT tenant
 * and 404s. CI pins this hostname in /etc/hosts alongside the other three.
 */
const VERIFY_URL = `${QA_BASE}/api/payments/binance-personal/verify`

/**
 * The APP process is what calls Binance, and only a server Playwright started —
 * or a `npm run dev` whose `.env.local` carries the same line — has the
 * override. The runner's own copy is the closest observable proxy: ci.yml sets
 * it on the job, so this never skips in CI, and if that line is ever dropped the
 * reason below matches `check-e2e-skips.mjs`'s ENV_SKIP ("not set", "required")
 * and fails the job. Locally a developer with neither gets a clean skip instead
 * of a 503 and a signed request to the real api.binance.com.
 * `PAYMENT_CREDENTIALS_ENCRYPTION_KEY` joins the gate because without it
 * `loadBinancePersonalConfig` swallows the throw into `null` and every
 * settlement case would read as "school not configured".
 */
const STUB_BASE = process.env.BINANCE_PAY_API_BASE
const READY = Boolean(STUB_BASE && process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY)

/** Recommended (and ci.yml's) port; the stub binds whatever port the env names. */
const DEFAULT_STUB_PORT = 3099

const RUN = Date.now()
/** Every synthesised Binance order id carries this so a crashed run is LIKE-matchable. */
const ORDER_PREFIX = `binance-e2e-order-${RUN}`
const SETTLE_ORDER = `${ORDER_PREFIX}-settle`
const AMBIG_ORDER_A = `${ORDER_PREFIX}-ambig-a`
const AMBIG_ORDER_B = `${ORDER_PREFIX}-ambig-b`
const OTHER_ORDER = `${ORDER_PREFIX}-other`

/** `numeric(10,2)`, and matched 1:1 against USDT by the reconcile core. */
const SALE_AMOUNT = 37.11
/** A second price, shared by the two colliding pending rows of the ambiguity case. */
const AMBIG_AMOUNT = 41.23

// Per-run so a stale wallet row can never be mistaken for this run's.
const PAY_ID = `qa-pay-id-${RUN}`
const API_KEY = `qa-binance-key-${RUN}`
const API_SECRET = `qa-binance-secret-${RUN}`

// ---------------------------------------------------------------------------
// The stub. Inside the Playwright process rather than a second `webServer`
// entry: the app server is always on this same machine, the fixture can be
// reprogrammed between assertions with a plain variable, and a busy port throws
// EADDRINUSE loudly instead of `reuseExistingServer` silently adopting a stale
// stub left by a crashed run.
// ---------------------------------------------------------------------------

/** The six fields `normalizePayHistory` reads, in Binance's own spelling. */
interface StubTransfer {
  orderId: string
  amount: number
  currency: string
  note: string
  transactionTime: number
}

/** Reprogrammed per test — the handler reads it at request time. */
let stubTransfers: StubTransfer[] = []

interface StubHit {
  path: string
  /** The signed string: the query WITHOUT the appended `&signature=…`. */
  query: string
  signature: string | null
  apiKey: string | undefined
}

const stubHits: StubHit[] = []
let stubServer: Server | undefined

async function startStub(base: string) {
  const url = new URL(base)
  // Literally 127.0.0.1 — a fake Binance answering on the LAN is not a test
  // util, and `localhost` is not good enough either: the stub binds one address
  // while the app's undici resolves the name itself and may try ::1 first, which
  // is an ECONNREFUSED, the route's 503 path, and a stub sitting idle.
  if (url.hostname !== '127.0.0.1') {
    throw new Error(
      `BINANCE_PAY_API_BASE must be http://127.0.0.1:<port> for this spec to serve it — not a hostname, which may resolve to ::1 (got ${base})`,
    )
  }
  if (!url.port) {
    throw new Error(
      `BINANCE_PAY_API_BASE must carry an explicit port — the stub binds it (e.g. http://127.0.0.1:${DEFAULT_STUB_PORT})`,
    )
  }

  const server = createServer((req, res) => {
    const raw = req.url ?? '/'
    // Routed EXACTLY as sent. The stub used to collapse `//` so a base with a
    // trailing slash still matched, which hid the double slash a real host would
    // 404 on; `baseUrl()` now trims the slash itself, so let a regression there
    // surface as the 404 → 503 → failed assertion it would be in production.
    const path = raw.split('?')[0] || '/'
    const search = raw.split('?')[1] ?? ''
    // The adapter signs `params.toString()` and appends `&signature=` AFTER —
    // so the signed string is everything before that last separator.
    const cut = search.lastIndexOf('&signature=')
    stubHits.push({
      path,
      query: cut >= 0 ? search.slice(0, cut) : search,
      signature: cut >= 0 ? search.slice(cut + '&signature='.length) : null,
      apiKey: req.headers['x-mbx-apikey'] as string | undefined,
    })

    if (path !== '/sapi/v1/pay/transactions') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end('{}')
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: '000000', message: 'success', success: true, data: stubTransfers }))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(Number(url.port), '127.0.0.1', resolve)
  })
  stubServer = server
}

async function stopStub() {
  const server = stubServer
  stubServer = undefined
  if (!server) return
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

// ---------------------------------------------------------------------------
// DB helpers. `transactions` has NO `created_at` — the column is
// `transaction_date`; selecting the former 42703s the whole request.
// ---------------------------------------------------------------------------

type Admin = ReturnType<typeof getAdmin>

async function readTransaction(admin: Admin, transactionId: number) {
  const { data, error } = await admin
    .from('transactions')
    .select(
      'transaction_id, status, amount, currency, payment_provider, provider_charge_id, provider_subscription_id, tenant_id, user_id, product_id, plan_id, transaction_date',
    )
    .eq('transaction_id', transactionId)
    .single()
  if (error) throw new Error(`could not read transaction ${transactionId}: ${error.message}`)
  return data
}

/** Every course the product grants — the loop `enroll_user` walks. */
async function coursesOf(admin: Admin, productId: number): Promise<number[]> {
  const { data, error } = await admin
    .from('product_courses')
    .select('course_id')
    .eq('product_id', productId)
    .order('course_id')
  if (error) throw new Error(`could not read product_courses for ${productId}: ${error.message}`)
  return (data ?? []).map((row) => row.course_id as number)
}

async function entitlementsOf(admin: Admin, userId: string, productId: number) {
  const { data, error } = await admin
    .from('entitlements')
    .select('entitlement_id, course_id, tenant_id, source_type, source_id, status, revoked_at')
    .eq('user_id', userId)
    .eq('source_type', 'product')
    .eq('source_id', productId)
    .order('course_id')
  if (error) throw new Error(`could not read entitlements for product ${productId}: ${error.message}`)
  return data ?? []
}

/**
 * How many SETTLED rows have consumed this Binance orderId (the idempotency
 * ledger). The three predicates are exactly the partial unique index
 * `transactions_provider_charge_id_unique` — UNIQUE (payment_provider,
 * provider_charge_id) WHERE provider_charge_id IS NOT NULL AND status =
 * 'successful' — so this counts what the database itself would refuse a second
 * of. Pending rows never carry a charge id in this file, and each case asserts
 * `provider_charge_id` on its own rows besides.
 */
async function consumersOf(admin: Admin, orderId: string): Promise<number> {
  const { count, error } = await admin
    .from('transactions')
    .select('transaction_id', { count: 'exact', head: true })
    .eq('payment_provider', 'binance_personal')
    .eq('provider_charge_id', orderId)
    .eq('status', 'successful')
  if (error) throw new Error(`could not count consumers of ${orderId}: ${error.message}`)
  return count ?? 0
}

async function insertProduct(
  admin: Admin,
  tenantId: string,
  name: string,
  price: number,
  courseIds: number[],
): Promise<number> {
  const { data, error } = await admin
    .from('products')
    .insert({
      name,
      description: 'Binance personal settlement fixture',
      price,
      currency: 'usd',
      status: 'active',
      payment_provider: 'binance_personal',
      tenant_id: tenantId,
    })
    .select('product_id')
    .single()
  if (error) throw new Error(`could not insert product "${name}": ${error.message}`)
  const productId = data.product_id as number
  for (const courseId of courseIds) {
    const { error: mapError } = await admin
      .from('product_courses')
      .insert({ product_id: productId, course_id: courseId, tenant_id: tenantId })
    if (mapError) throw new Error(`could not map product ${productId} to course ${courseId}: ${mapError.message}`)
  }
  return productId
}

/**
 * `authenticated` has no INSERT grant on `transactions` (#538) — every seeded
 * row is service-role. Seeded `pending` and already on `binance_personal`: the
 * route hard-guards the rail (`!== 'binance_personal'` → 400) and the reconcile
 * flip never rewrites that column, so a different provider here would only make
 * every case 400.
 *
 * Respects `transactions_unique_product` — one live row per (user, product) —
 * by giving every fixture row its own product.
 */
async function seedPending(admin: Admin, tenantId: string, productId: number, amount: number): Promise<number> {
  const { data, error } = await admin
    .from('transactions')
    .insert({
      user_id: SEEDED.student.id,
      product_id: productId,
      plan_id: null,
      amount,
      currency: 'usd',
      status: 'pending',
      tenant_id: tenantId,
      payment_provider: 'binance_personal',
    })
    .select('transaction_id')
    .single()
  if (error) throw new Error(`could not seed transaction for product ${productId}: ${error.message}`)
  return data.transaction_id as number
}

/** The school's Binance settings row, written exactly as `app/actions/admin/settings.ts` writes it. */
async function configureWallet(admin: Admin) {
  const masterKey = getPaymentCredentialsKey()
  const { error } = await admin.from('tenant_payment_wallets').upsert(
    {
      tenant_id: QA.id,
      provider: 'binance_personal',
      wallet_address: PAY_ID,
      credentials: {
        api_key: encryptCredential(API_KEY, masterKey),
        api_secret: encryptCredential(API_SECRET, masterKey),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,provider' },
  )
  if (error) throw new Error(`could not configure the binance_personal wallet: ${error.message}`)
}

/**
 * Everything this spec creates, children before parents. Safe on a clean
 * database, and it also runs FIRST in `beforeAll` — that is what makes a second
 * run safe after a crash.
 *
 * The deletes THIS function owns are checked, so a silently failing one (a
 * future FK, an RLS change on the service-role path) surfaces here and not as a
 * baffling assertion failure three tests later. `destroyQaTenant`'s own deletes
 * are not — it fires and forgets — but nothing it touches can fail here: no FK
 * to `public.courses` is NO ACTION, and the NO-ACTION FKs to `tenants`
 * (notifications, gamification_*, community_*, certificate_templates) get no
 * rows, because this file adds membership by SQL and the only
 * `gamification_profiles` writer is `app/actions/join-school.ts`. Every fixture
 * id is fresh per run besides, so even a silent failure leaves the next run green.
 */
async function teardown() {
  const admin = getAdmin()
  const wipe = async (what: string, run: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run
    if (error) throw new Error(`teardown could not clear ${what}: ${error.message}`)
  }

  for (const tenant of [QA, OTHER]) {
    // tenant_payment_wallets cascades on the tenant delete, but clear it first
    // so a teardown that dies half way cannot leave live credentials behind.
    await wipe(
      'tenant_payment_wallets',
      admin.from('tenant_payment_wallets').delete().eq('tenant_id', tenant.id),
    )
    // transactions reference products, and products/product_courses are not part
    // of destroyQaTenant's cascade — drop them in FK order first.
    await wipe('transactions', admin.from('transactions').delete().eq('tenant_id', tenant.id))
    await wipe('product_courses', admin.from('product_courses').delete().eq('tenant_id', tenant.id))
    await wipe('products', admin.from('products').delete().eq('tenant_id', tenant.id))
    // entitlements / enrollments / courses / tenant_users / tenants.
    await destroyQaTenant(admin, tenant)
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('Binance Pay (personal) — a real transfer settles and grants access (#740)', () => {
  test.skip(
    !READY,
    `BINANCE_PAY_API_BASE is not set (the app server must point at the local Binance Pay stub) and PAYMENT_CREDENTIALS_ENCRYPTION_KEY is required — to run this locally put BINANCE_PAY_API_BASE=http://127.0.0.1:${DEFAULT_STUB_PORT} in .env.local AND restart your dev server, since a server already listening cannot be handed an env var`,
  )

  let courseIds: number[] = []
  let saleProductId: number
  let saleTransactionId: number
  let ambigProductA: number
  let ambigProductB: number
  let ambigTransactionA: number
  let ambigTransactionB: number
  let otherProductId: number
  let otherTransactionId: number

  /**
   * One logged-in context for the whole file, created lazily so the nightly
   * `--project=mobile` run (whose tests all skip in `beforeEach`) never pays for
   * a login. `page.request` inherits the context's cookies, and the session
   * cookie is issued on `.lvh.me`, so the POST below is authenticated.
   */
  let buyer: Page | undefined
  async function buyerPage(browser: Browser): Promise<Page> {
    if (buyer) return buyer
    const context = await browser.newContext()
    const page = await context.newPage()
    // Logging in ON the QA subdomain is load-bearing, not cosmetic: RLS scopes
    // the route's transaction read with `get_tenant_id()`, which reads the JWT
    // `tenant_id` claim — and that claim is only re-synced to this tenant by the
    // membership block in proxy.ts on a PAGE request (it returns before that for
    // /api). A login on the platform root would leave her claim on the default
    // tenant and every read here would come back empty.
    await login(page, SEEDED.student.email, SEEDED.student.password, QA_BASE)
    buyer = page
    return page
  }

  function verify(page: Page, transactionId: number) {
    // A body is mandatory even for the refusal cases: `page.request.post(url)`
    // with no `data` makes the route's `req.json()` throw into its outer catch
    // and answer 500, which would hide every status this file asserts.
    return page.request.post(VERIFY_URL, { data: { transactionId } })
  }

  test.beforeAll(async () => {
    const admin = getAdmin()
    await teardown() // a crashed previous run must not poison this one
    if (READY) await startStub(STUB_BASE!)

    await createQaTenant(admin, QA, 'free')
    await addMember(admin, QA.id, SEEDED.owner.id, 'admin')
    await addMember(admin, QA.id, SEEDED.student.id, 'student')

    // TWO courses on the sold product: `enroll_user` loops `product_courses`,
    // and a one-course fixture cannot tell a loop from a single insert.
    courseIds = [
      await insertCourse(admin, QA.id, `Binance Settlement Course A ${RUN}`, { status: 'published' }),
      await insertCourse(admin, QA.id, `Binance Settlement Course B ${RUN}`, { status: 'published' }),
    ].sort((a, b) => a - b)

    saleProductId = await insertProduct(admin, QA.id, `Binance Bundle ${RUN}`, SALE_AMOUNT, courseIds)
    saleTransactionId = await seedPending(admin, QA.id, saleProductId, SALE_AMOUNT)

    // The colliding pair: same tenant, same amount, both pending — which is the
    // only thing that can make a reconcile ambiguous.
    ambigProductA = await insertProduct(admin, QA.id, `Binance Ambiguous A ${RUN}`, AMBIG_AMOUNT, [courseIds[0]])
    ambigProductB = await insertProduct(admin, QA.id, `Binance Ambiguous B ${RUN}`, AMBIG_AMOUNT, [courseIds[1]])
    ambigTransactionA = await seedPending(admin, QA.id, ambigProductA, AMBIG_AMOUNT)
    ambigTransactionB = await seedPending(admin, QA.id, ambigProductB, AMBIG_AMOUNT)

    // The other school. It never needs a course, a member or credentials — the
    // buyer must not get far enough to need any of them.
    await createQaTenant(admin, OTHER, 'free')
    otherProductId = await insertProduct(admin, OTHER.id, `Binance Other School ${RUN}`, SALE_AMOUNT, [])
    otherTransactionId = await seedPending(admin, OTHER.id, otherProductId, SALE_AMOUNT)
  })

  test.afterAll(async () => {
    await buyer?.context().close()
    buyer = undefined
    // MUST close: the nightly run adds --project=mobile and this file is then
    // evaluated twice in one process — a leaked listener means EADDRINUSE.
    await stopStub()
    await teardown()
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(!['desktop-chromium', 'human'].includes(testInfo.project.name), 'runs once — DB state is shared')
    // Locally the webServer is `next dev`, and this file pays Turbopack's
    // on-demand compile of the login page and the verify route inside the test
    // budget. The shared 30 s (playwright.config.ts:50) is not enough for a cold
    // server; CI runs `next start` on a prebuilt app and never spends it.
    testInfo.setTimeout(120_000)
  })

  test('a school with no Binance credentials cannot be paid, and nothing is written', async ({ browser }) => {
    const admin = getAdmin()
    const page = await buyerPage(browser)
    const callsBefore = stubHits.length

    const res = await verify(page, saleTransactionId)
    expect(res.status(), await res.text()).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'School has not configured Binance Pay (personal)' })

    // The config load precedes the tenant history budget AND the outbound call,
    // so an unconfigured school cannot spend either.
    expect(stubHits).toHaveLength(callsBefore)

    const tx = await readTransaction(admin, saleTransactionId)
    expect(tx.status).toBe('pending')
    expect(tx.provider_charge_id).toBeNull()
    expect(await entitlementsOf(admin, SEEDED.student.id, saleProductId)).toHaveLength(0)

    // ARRANGES THE REST OF THE FILE. "No wallet row" is a state only this test
    // can observe, so the row is written here rather than in `beforeAll`.
    await configureWallet(admin)
  })

  test('a transfer whose note carries the payment code settles the sale and grants every mapped course', async ({
    browser,
  }) => {
    const admin = getAdmin()
    const page = await buyerPage(browser)
    const callsBefore = stubHits.length
    const courses = await coursesOf(admin, saleProductId)
    expect(courses).toEqual(courseIds)

    stubTransfers = [
      {
        orderId: SETTLE_ORDER,
        amount: SALE_AMOUNT,
        // USDT only, uppercase-compared; the row's own `usd` is matched 1:1.
        currency: 'USDT',
        // The payment code is our transaction id, and `noteContainsCode` wants it
        // as a STANDALONE digit run — "14825" would not match code "482".
        note: `LMS ${saleTransactionId}`,
        // Inside the match window: `transaction_date - 10 min`.
        transactionTime: Date.now(),
      },
    ]

    const res = await verify(page, saleTransactionId)
    const body = await res.text()

    // The app really talked to the stub — asserted BEFORE the status, because
    // this is the assertion that explains the other one. A server that booted
    // without BINANCE_PAY_API_BASE calls the real api.binance.com, the route
    // catches the failure and answers 503, and a status assertion first would
    // report "503 != 200" while this diagnostic never ran. Nothing is lost by
    // going first: the response is in the message. It also stops a future
    // regression satisfying everything below without reading Binance at all.
    expect(
      stubHits.length,
      `the app server never called the Binance Pay stub (it answered ${res.status()}: ${body}). ` +
        'A 503 means it booted before BINANCE_PAY_API_BASE was set — put the line in .env.local ' +
        `(e.g. http://127.0.0.1:${DEFAULT_STUB_PORT}) and restart your dev server; Playwright reuses a ` +
        'server already listening and cannot hand it an env var after the fact.',
    ).toBe(callsBefore + 1)
    const hit = stubHits.at(-1)!

    expect(res.status(), body).toBe(200)
    expect(await res.json()).toEqual({ confirmed: true, orderId: SETTLE_ORDER })
    expect(hit.path).toBe('/sapi/v1/pay/transactions')

    // The key reached the wire as PLAINTEXT, which means the whole credential
    // round-trip ran for real: encryptCredential → tenant_payment_wallets →
    // loadBinancePersonalConfig → decryptCredential → X-MBX-APIKEY.
    expect(hit.apiKey).toBe(API_KEY)
    // …and the query is signed with the decrypted SECRET. Recomputed here with
    // node:crypto rather than with the adapter's own `signSapiQuery`, so a
    // regression in the signing scheme cannot cancel itself out.
    expect(hit.signature).toBe(createHmac('sha256', API_SECRET).update(hit.query).digest('hex'))
    const query = new URLSearchParams(hit.query)
    expect(query.get('recvWindow')).toBe('10000')
    expect(query.get('limit')).toBe('100')
    expect(query.get('signature')).toBeNull() // the signature is appended, never signed

    const tx = await readTransaction(admin, saleTransactionId)
    expect(tx.status).toBe('successful')
    // The orderId is CONSUMED — this is what stops one transfer paying two orders.
    expect(tx.provider_charge_id).toBe(SETTLE_ORDER)
    // Product-shaped row: the plan-only column stays untouched.
    expect(tx.provider_subscription_id).toBeNull()

    // Everything below is Postgres: after_transaction_update →
    // trigger_manage_transactions → enroll_user. A settled row with no
    // entitlement is a sale the student cannot use.
    const grants = await entitlementsOf(admin, SEEDED.student.id, saleProductId)
    expect(grants).toHaveLength(courses.length)
    for (const course of courses) {
      expect(grants).toContainEqual(
        expect.objectContaining({
          course_id: course,
          // enroll_user takes the tenant from product_courses, not the transaction.
          tenant_id: QA.id,
          source_type: 'product',
          source_id: saleProductId,
          status: 'active',
          revoked_at: null,
        }),
      )
    }

    const { data: enrollments, error: enrollmentsError } = await admin
      .from('enrollments')
      .select('course_id, status')
      .eq('user_id', SEEDED.student.id)
      .eq('tenant_id', QA.id)
      .order('course_id')
    if (enrollmentsError) throw new Error(`could not read enrollments: ${enrollmentsError.message}`)
    expect(enrollments).toEqual(courses.map((course) => ({ course_id: course, status: 'active' })))
  })

  test('polling again after settlement is acked without a Binance call and grants nothing twice', async ({
    browser,
  }) => {
    const admin = getAdmin()
    const page = await buyerPage(browser)
    const callsBefore = stubHits.length
    const grantsBefore = await entitlementsOf(admin, SEEDED.student.id, saleProductId)

    // The transfer is still sitting in the school's history — a redelivery that
    // an idempotent poll must ignore, not re-consume.
    stubTransfers = [
      {
        orderId: SETTLE_ORDER,
        amount: SALE_AMOUNT,
        currency: 'USDT',
        note: `LMS ${saleTransactionId}`,
        transactionTime: Date.now(),
      },
    ]

    const res = await verify(page, saleTransactionId)
    expect(res.status(), await res.text()).toBe(200)
    // No `orderId` on this shape — the settlement belongs to the earlier poll.
    expect(await res.json()).toEqual({ confirmed: true, alreadyProcessed: true })

    // The `status === 'successful'` short-circuit sits BEFORE the config load,
    // the tenant history budget and the fetch, so a client polling every few
    // seconds cannot burn 12 weight-heavy Binance calls a minute.
    expect(stubHits).toHaveLength(callsBefore)

    const tx = await readTransaction(admin, saleTransactionId)
    expect(tx.status).toBe('successful')
    expect(tx.provider_charge_id).toBe(SETTLE_ORDER)

    const grants = await entitlementsOf(admin, SEEDED.student.id, saleProductId)
    expect(grants).toHaveLength(grantsBefore.length)
    expect(grants.map((row) => row.entitlement_id)).toEqual(grantsBefore.map((row) => row.entitlement_id))
    expect(grants.every((row) => row.status === 'active')).toBe(true)

    // The transfer was not re-consumed: one orderId, one settled order.
    expect(await consumersOf(admin, SETTLE_ORDER)).toBe(1)
  })

  test('two pending orders sharing an amount are never guessed at — the transaction stays pending', async ({
    browser,
  }) => {
    const admin = getAdmin()
    const page = await buyerPage(browser)
    const callsBefore = stubHits.length

    // Neither note carries a payment code (no digits at all), so rule 1 finds
    // nothing and rule 2's collision COUNT decides. Two pending rows of this
    // amount exist in this tenant, so no transfer can be attributed.
    stubTransfers = [
      { orderId: AMBIG_ORDER_A, amount: AMBIG_AMOUNT, currency: 'USDT', note: 'pago del curso', transactionTime: Date.now() },
      { orderId: AMBIG_ORDER_B, amount: AMBIG_AMOUNT, currency: 'USDT', note: 'course payment', transactionTime: Date.now() },
    ]

    const res = await verify(page, ambigTransactionA)
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toEqual({ confirmed: false, ambiguous: true })

    // It really looked (this is not a config or throttle short-circuit).
    expect(stubHits.length).toBe(callsBefore + 1)

    for (const [transactionId, productId] of [
      [ambigTransactionA, ambigProductA],
      [ambigTransactionB, ambigProductB],
    ] as const) {
      const tx = await readTransaction(admin, transactionId)
      expect(tx.status).toBe('pending')
      expect(tx.provider_charge_id).toBeNull()
      expect(await entitlementsOf(admin, SEEDED.student.id, productId)).toHaveLength(0)
    }

    // Neither orderId was consumed — an ambiguous match must leave the transfers
    // available for the admin's one-click manual confirmation.
    expect(await consumersOf(admin, AMBIG_ORDER_A)).toBe(0)
    expect(await consumersOf(admin, AMBIG_ORDER_B)).toBe(0)
  })

  test('another school’s transaction cannot be verified, even with a perfectly matching transfer', async ({
    browser,
  }) => {
    const admin = getAdmin()
    const page = await buyerPage(browser)
    const callsBefore = stubHits.length

    // A transfer that WOULD settle that row if it were reachable — so the
    // refusal below is the tenant scope, not a failure to match.
    stubTransfers = [
      {
        orderId: OTHER_ORDER,
        amount: SALE_AMOUNT,
        currency: 'USDT',
        note: `LMS ${otherTransactionId}`,
        transactionTime: Date.now(),
      },
    ]

    const res = await verify(page, otherTransactionId)
    // The row is read with `transaction_id + user_id + tenant_id`, where the
    // tenant comes from the host via proxy.ts (a client-sent x-tenant-id is
    // overwritten) and the user from a real session cookie — and RLS scopes the
    // same read to the JWT's tenant on top. Same buyer, different school: 404.
    expect(res.status(), await res.text()).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'Transaction not found' })

    // Refused before the school's Pay history was ever read.
    expect(stubHits).toHaveLength(callsBefore)

    const tx = await readTransaction(admin, otherTransactionId)
    expect(tx.status).toBe('pending')
    expect(tx.provider_charge_id).toBeNull()
    expect(await entitlementsOf(admin, SEEDED.student.id, otherProductId)).toHaveLength(0)
    expect(await consumersOf(admin, OTHER_ORDER)).toBe(0)
  })
})
