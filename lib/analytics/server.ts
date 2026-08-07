/**
 * Server-side product analytics — the ONLY module in the app that talks to
 * OpenPanel from the server.
 *
 * WHY A WRAPPER (`docs/ANALYTICS_OPENPANEL.md` §2.4): OpenPanel is a young,
 * effectively single-maintainer project. Keeping the vendor behind one file
 * turns "we have to migrate analytics" from a 200-call-site refactor into a
 * one-file change. Do not import `@openpanel/*` anywhere else on the server.
 *
 * THREE NON-NEGOTIABLES, all enforced below:
 *   1. FAILS OPEN. Every path is wrapped and every error swallowed. A Stripe
 *      webhook that 500s because the analytics box is down costs real money
 *      and a real enrollment. Nothing here ever rethrows.
 *   2. FAILS FAST. The vendor SDK retries a failed POST three times with
 *      exponential backoff (500/1000/2000 ms) before giving up, so a dead
 *      collector would otherwise add ~4 s to a webhook. Every call is raced
 *      against `TRACK_TIMEOUT_MS`; the loser keeps running detached and its
 *      result is discarded.
 *   3. NO-OPS WITHOUT CREDENTIALS. With the env vars unset the client is never
 *      constructed: no network, no console output, no behavioural change.
 *
 * CONTEXT IS INJECTED, NEVER GUESSED. `tenantId` comes from
 * `getCurrentTenantId()` or the webhook's own resolution — never from a header
 * a client can forge.
 */

import { OpenPanel } from '@openpanel/sdk'
import * as Sentry from '@sentry/nextjs'
import {
  type AnalyticsEventName,
  type AnalyticsProperties,
  type PropertiesFor,
} from './events'
import {
  type AnalyticsExclusionContext,
  isAnalyticsEnvironmentEnabled,
  shouldDropEvent,
} from './exclusions'

/**
 * Everything the wrapper needs to attribute an event. All optional: a cron job
 * has no user, a public webhook has no locale.
 */
export type AnalyticsContext = AnalyticsExclusionContext & {
  /** Supabase auth user id. Becomes `profileId`. Never an email — `profiles` has none. */
  userId?: string | null
  tenantId?: string | null
  locale?: string | null
  /** `student` | `teacher` | `admin` — from `getUserRole()`, not from a JWT claim. */
  role?: string | null
  /**
   * Backdates the event. REQUIRED for writes that settle long after the user's
   * session ended — `confirmPaymentReceived` fires hours or days later from an
   * *admin's* request, and without this the sale lands in the wrong day's
   * cohort and looks like the admin bought it (§4 Loop C trap 3).
   */
  timestamp?: Date | string | null
}

/**
 * How long a single analytics call may block the request that fired it.
 * Short on purpose: the event is worth far less than the webhook.
 */
const TRACK_TIMEOUT_MS = 1500

const GROUP_TYPE = 'school'

let client: OpenPanel | null | undefined
/**
 * Groups (§2.1) map schools onto OpenPanel accounts, but self-hosted instances
 * lag the cloud and older builds have no Groups feature. If group calls fail —
 * or `ANALYTICS_GROUPS_DISABLED` is set — we stop attaching group ids and keep
 * sending events. The flat `tenant_id` property is attached unconditionally and
 * is what every chart filters on, so a Groups-less instance loses account-level
 * rollups and nothing else.
 */
let groupsEnabled = process.env.ANALYTICS_GROUPS_DISABLED !== 'true'

function breadcrumb(message: string, error: unknown) {
  try {
    Sentry.addBreadcrumb({
      category: 'analytics',
      level: 'warning',
      message,
      data: { error: error instanceof Error ? error.message : String(error) },
    })
  } catch {
    // Sentry itself is best-effort here. Never let telemetry break telemetry.
  }
}

/**
 * A build without the Groups feature is a supported configuration, not an
 * outage: stop attaching group ids and let the flat `tenant_id` property carry
 * the data.
 *
 * Note this is a best-effort signal. The vendor SDK's transport resolves to
 * `null` on a non-2xx rather than rejecting, so a collector that rejects the
 * `group` payload outright may never surface here — `ANALYTICS_GROUPS_DISABLED`
 * is the reliable switch, and every chart filters on `tenant_id` regardless.
 */
function disableGroups(error: unknown) {
  groupsEnabled = false
  breadcrumb('analytics group upsert failed — groups disabled', error)
}

/**
 * Lazy singleton. Returns `null` — permanently, without logging — when the
 * credentials are absent or the environment is excluded, which is the state
 * every local dev machine, CI runner and Playwright run is in.
 */
function getClient(): OpenPanel | null {
  if (client !== undefined) return client

  const clientId = process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID
  const clientSecret = process.env.OPENPANEL_CLIENT_SECRET

  if (!clientId || !clientSecret || !isAnalyticsEnvironmentEnabled()) {
    client = null
    return client
  }

  try {
    client = new OpenPanel({
      clientId,
      clientSecret,
      // Self-hosted instance. Unset falls back to the vendor's cloud endpoint,
      // which for this deployment would simply 401 and drop the event.
      apiUrl: process.env.NEXT_PUBLIC_OPENPANEL_API_URL?.replace(/\/+$/, ''),
      sdk: 'nextjs-server',
    })
  } catch (error) {
    breadcrumb('openpanel client init failed', error)
    client = null
  }

  return client
}

/**
 * Race a vendor promise against a timer. The vendor promise is never awaited
 * past the deadline and its rejection is absorbed, so a hanging or retrying
 * transport cannot stall — or crash — the caller.
 */
async function withTimeout(
  work: Promise<unknown>,
  onError: (error: unknown) => void = (error) =>
    breadcrumb('openpanel transport rejected', error)
): Promise<void> {
  const settled = work.then(() => undefined, onError)

  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, TRACK_TIMEOUT_MS)
    // Don't hold a serverless invocation open just for the timer.
    ;(timer as unknown as { unref?: () => void }).unref?.()
  })

  try {
    await Promise.race([settled, deadline])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function toIsoTimestamp(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/**
 * Build the property bag actually sent. Context wins over caller properties on
 * the reserved keys: a hand-passed `tenant_id` that disagrees with the resolved
 * one is always the bug.
 */
function buildPayload(
  props: AnalyticsProperties,
  ctx: AnalyticsContext
): AnalyticsProperties {
  const payload: AnalyticsProperties = { ...props }

  if (ctx.tenantId) payload.tenant_id = ctx.tenantId
  if (ctx.locale) payload.locale = ctx.locale
  if (ctx.role) payload.role = ctx.role
  if (ctx.userId) payload.profileId = ctx.userId
  if (ctx.tenantId && groupsEnabled) payload.groups = [ctx.tenantId]

  // The ingest API reads `__timestamp` from properties — it is the same field
  // the SDK stamps onto queued events, so backdating rides the normal path.
  const timestamp = toIsoTimestamp(ctx.timestamp)
  if (timestamp) payload.__timestamp = timestamp

  return payload
}

/**
 * Record a product event. Resolves to `void` in every case — success, dropped,
 * misconfigured, vendor down, transport hung. It cannot throw; call sites do
 * not need their own try/catch, and MUST NOT let it gate a business write.
 *
 * ```ts
 * await track('payment_succeeded',
 *   { provider: 'stripe', amount_major: 49, currency: 'USD', is_subscription: false },
 *   { userId, tenantId, locale, role })
 * ```
 */
export async function track<E extends AnalyticsEventName>(
  name: E,
  props: PropertiesFor<E>,
  ctx: AnalyticsContext = {}
): Promise<void> {
  try {
    if (shouldDropEvent(ctx)) return
    const op = getClient()
    if (!op) return

    await withTimeout(
      Promise.resolve(op.track(name, buildPayload(props as AnalyticsProperties, ctx)))
    )
  } catch (error) {
    // Analytics must NEVER break a payment webhook. Swallow + breadcrumb only.
    breadcrumb(`analytics track failed: ${name}`, error)
  }
}

/**
 * Attach non-PII traits to a profile. NEVER send email, name or avatar —
 * `profiles` has no email column and the privacy-safe path is also the easy one.
 */
export async function identifyServer(
  userId: string,
  properties: AnalyticsProperties = {},
  ctx: AnalyticsContext = {}
): Promise<void> {
  try {
    if (!userId) return
    if (shouldDropEvent(ctx)) return
    const op = getClient()
    if (!op) return

    const payload: AnalyticsProperties = { ...properties }
    if (ctx.tenantId) payload.tenant_id = ctx.tenantId
    if (ctx.locale) payload.locale = ctx.locale
    if (ctx.role) payload.role = ctx.role

    await withTimeout(
      Promise.resolve(op.identify({ profileId: userId, properties: payload }) ?? undefined)
    )
  } catch (error) {
    breadcrumb('analytics identify failed', error)
  } finally {
    // `identify()` stores the profileId ON THE SINGLETON, and `track()` falls
    // back to it when a call omits one. On a shared server client that would
    // leak one user's identity onto the next request's events. Clear it; every
    // `track()` above passes `profileId` explicitly anyway.
    if (client) client.profileId = undefined
  }
}

/**
 * Register a school as an OpenPanel group (§2.1). This is what turns
 * "1,400 lesson views" into "Escuela X published 3 courses and hasn't
 * connected Stripe".
 *
 * Call it when tenant metadata changes (creation, plan change, rename) — not on
 * every event. Note that we deliberately do NOT call the SDK's `setGroup()`:
 * it mutates the singleton's group list permanently, so on a shared server
 * client one tenant's id would attach itself to every subsequent event from
 * every other tenant. `track()` passes `groups` per call instead.
 */
export async function upsertSchoolGroup(input: {
  tenantId: string
  name: string
  properties?: AnalyticsProperties
}): Promise<void> {
  try {
    if (!input.tenantId || !groupsEnabled) return
    if (!isAnalyticsEnvironmentEnabled()) return
    const op = getClient()
    if (!op) return

    await withTimeout(
      Promise.resolve(
        op.upsertGroup({
          id: input.tenantId,
          type: GROUP_TYPE,
          name: input.name,
          properties: input.properties,
        })
      ),
      // A rejection here is the async path of the same failure the catch below
      // handles synchronously; `withTimeout` absorbs rejections by default, so
      // the handler has to be passed in or the fallback never arms.
      disableGroups
    )
  } catch (error) {
    disableGroups(error)
  }
}

/** Test seam. Not for application code. */
export function __resetAnalyticsForTests(): void {
  client = undefined
  groupsEnabled = process.env.ANALYTICS_GROUPS_DISABLED !== 'true'
}
