/**
 * POST /api/landing/generate
 *
 * Conversational landing-page assistant — the runtime that ties the json-render catalog to the
 * Puck editor. It supports a multi-turn chat where each turn either rewrites the WHOLE page or
 * edits the currently-SELECTED block.
 *
 * Two intents (chosen by whether the user has a block selected in Puck):
 *
 *   PAGE  (nothing selected, or "rebuild the page")  → stream a full json-render spec →
 *         normalizeSpec → landingCatalog.validate → specToPuckData → { kind:'page', data }
 *         The client applies it via dispatch({type:'setData'}) (replaces the whole tree).
 *
 *   BLOCK (a block is selected)                      → generate just that block's new props →
 *         validate as a one-element spec → { kind:'block', targetId, type, props }
 *         The client replaces only that item's props, leaving the rest of the page untouched.
 *
 * Both intents validate against the SAME catalog, so the anti-hallucination guarantee and the
 * defaultProps backfill apply to both. See docs/adr/0001-json-render-puck-landing-builder.md.
 *
 * STREAMING: the page intent uses `streamText` + `Output.object` and streams NDJSON progress
 * events (one per block as it appears) so the editor shows motion instead of a ~15s blank wait,
 * then a single `page` event with the validated Puck Data. The block intent is small/fast
 * (`generateText` + `Output.object`) and returns one `block` event.
 *
 * BYOK: runs on the school's own AI key (feature `landing_builder`). The model is resolved
 * BEFORE the rate limiter and before the stream opens, so a school without a key gets a clean
 * typed JSON error (402/424/422/429/502, see lib/ai/errors.ts) instead of a half-open stream.
 * A provider failure after the stream opened is sent as an `error` event carrying the same
 * `code`. Structured-output invariants (array + `propsJson` string, every key required) are
 * unchanged, they are what keeps OpenAI strict mode and the other providers happy.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { rateLimit } from '@/lib/rate-limit'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { handleAiError, isAiErrorCode, type AiErrorCode } from '@/lib/ai/errors'
import type { ProviderId } from '@/lib/ai/provider-ids'
import { redact } from '@/lib/ai/byok/redact'
import { streamText, generateText, Output, NoObjectGeneratedError, type LanguageModel, type ModelMessage } from 'ai'
import { pageSpecShape, blockEditShape } from '@/lib/json-render/spec-schemas'
import { landingCatalog, DEFAULT_PROPS_BY_TYPE } from '@/lib/json-render/catalog'
import {
  specToPuckData,
  normalizeSpec,
  arraySpecToSpec,
  cleanProps,
  type JsonRenderArraySpec,
} from '@/lib/json-render/to-puck'
import { LANDING_AUTHORING_GUIDE } from '@/lib/json-render/authoring-guide'

export const maxDuration = 120
const MAX_MESSAGES = 20
const MAX_CONTENT_LEN = 4000

// Plans allowed to use the landing-page AI assistant. The builder itself is available on every
// plan (free is capped at one page), but the AI assistant stays paid-only — the UI hides the
// panel (PuckEditor aiEnabled) and this server gate stops direct calls from spending tokens.
// NOTE (BYOK): the tokens are now the school's own, so this gate no longer protects a platform
// cost. It is kept pending a product decision on whether the landing assistant stays paid-only.
const PAID_PLANS = ['starter', 'pro', 'business', 'enterprise']

// AI generation is expensive (OpenAI tokens + ~10s of compute), so cap how often a single user
// can trigger it. In-memory per-instance limiter — good enough as a first line of defence; move
// to a shared store (Redis) if/when this runs multi-instance. See lib/rate-limit.ts.
const LANDING_AI_RATE_LIMIT = 20 // requests per window, per user
const landingAiLimiter = rateLimit({
  interval: 5 * 60 * 1000, // 5 minutes
  uniqueTokenPerInterval: 500, // track up to 500 users
})

// ── Request body ─────────────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
interface SelectedBlock {
  id: string
  type: string
  props: Record<string, unknown>
}

/** One line of the NDJSON event stream sent to the client. */
type StreamEvent =
  | { type: 'progress'; count: number; lastType?: string }
  | { type: 'page'; data: unknown; blocks: number; reply: string }
  | { type: 'block'; targetId: string; blockType: string; props: Record<string, unknown>; reply: string }
  | { type: 'error'; status: number; error: string; issues?: unknown; code?: AiErrorCode; canConfigure?: boolean }

export async function POST(req: Request) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!tenantId) return new Response('No tenant context', { status: 400 })

  // Role gate — only admins can use the landing builder (every save action goes through
  // verifyAdminAccess), so don't let students/teachers spend OpenAI tokens generating pages
  // they can never persist. tenant_users is the authoritative role source; checked via the
  // admin client with the getUser()-verified id (getUserRole()'s x-user-id header is not
  // forwarded to API route handlers).
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('tenant_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
  if (membership?.role !== 'admin') {
    return new Response('The landing-page AI assistant requires admin access.', { status: 403 })
  }

  // Only admins reach this point, so they are the ones who can fix an AI setup problem.
  return withTenantAi(
    { tenantId, feature: 'landing_builder', canConfigure: true, actorId: user.id },
    async (ai) => {
      // Plan gate — the landing-page AI assistant is a paid feature. Enforce server-side (the UI
      // already hides it on the free plan) so the endpoint can't be hit directly.
      const { data: planResult } = await admin.rpc('get_plan_features', { _tenant_id: tenantId })
      const plan = (planResult as { plan?: string } | null)?.plan ?? 'free'
      if (!PAID_PLANS.includes(plan)) {
        return new Response('The landing-page AI assistant requires a paid plan.', { status: 403 })
      }

      // Resolve the school's model BEFORE the rate limiter and the stream:
      // no key = a typed JSON error and no side effects.
      const { model, providerId } = await ai.getModelForFeature('landing_builder')

      // Rate limit per user — AI generation is expensive, so throttle before doing any work.
      try {
        await landingAiLimiter.check(LANDING_AI_RATE_LIMIT, user.id)
      } catch {
        return new Response('Too many requests. Please wait a moment and try again.', { status: 429 })
      }

      const body = await req.json().catch(() => null)
      const rawMessages = Array.isArray(body?.messages) ? (body.messages as ChatMessage[]) : null
      if (!rawMessages || rawMessages.length === 0) {
        return new Response('A `messages` array is required', { status: 400 })
      }
      const selectedBlock: SelectedBlock | undefined =
        body?.selectedBlock && typeof body.selectedBlock?.id === 'string'
          ? body.selectedBlock
          : undefined

      // Sanitize history: cap count + length, keep only role/content the model needs.
      const messages: ModelMessage[] = rawMessages
        .slice(-MAX_MESSAGES)
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_LEN) }))

      if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
        return new Response('Last message must be from the user', { status: 400 })
      }

      // Decide the intent: a selected block means the user is refining that block.
      const intent: 'page' | 'block' = selectedBlock ? 'block' : 'page'

      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: StreamEvent) =>
            controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))

          try {
            if (intent === 'block' && selectedBlock) {
              await handleBlockEdit({ send, model, messages, selectedBlock, tenantId, userId: user.id, providerId, signal: req.signal })
            } else {
              await handlePageEdit({ send, model, messages, tenantId, userId: user.id, providerId, signal: req.signal })
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
              controller.close()
              return
            }
            if (NoObjectGeneratedError.isInstance(err)) {
              // Log only that it happened: `err.text` is raw model output and `cause` can echo it.
              console.error('[landing/generate] no object generated', { tenantId, providerId })
            }
            send(await streamErrorEvent(err, { tenantId, userId: user.id, providerId }))
          } finally {
            controller.close()
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Accel-Buffering': 'no',
        },
      })
    },
  )
}

/**
 * A failure after the stream opened can't change the HTTP status, so it becomes an `error` event.
 * Provider failures (bad key, quota, unknown model...) carry the typed `code` (and flag the key
 * invalid via handleAiError); anything else is the generic 502.
 */
async function streamErrorEvent(
  err: unknown,
  ctx: { tenantId: string; userId: string; providerId: ProviderId },
): Promise<StreamEvent> {
  try {
    const res = await handleAiError(err, {
      feature: 'landing_builder',
      canConfigure: true,
      tenantId: ctx.tenantId,
      providerId: ctx.providerId,
      actorId: ctx.userId,
    })
    const body = (await res.json()) as { error?: { code?: unknown } }
    const code = body.error?.code
    if (isAiErrorCode(code)) {
      return { type: 'error', status: res.status, error: 'AI is unavailable for this school.', code, canConfigure: true }
    }
  } catch {
    // Not a provider failure (handleAiError rethrows those): our own bug, logged below.
    console.error('[landing/generate] model error', err instanceof Error ? err.name : typeof err, redact(err instanceof Error ? err.message : '').slice(0, 200))
  }
  return { type: 'error', status: 502, error: 'Generation failed. Please try again.' }
}

// ── PAGE intent: stream a full page ──────────────────────────────────────────────────────────
async function handlePageEdit(opts: {
  send: (e: StreamEvent) => void
  model: LanguageModel
  messages: ModelMessage[]
  tenantId: string
  userId: string
  providerId: ProviderId
  signal: AbortSignal
}) {
  const { send, model, messages, tenantId, userId, providerId, signal } = opts

  const system =
    landingCatalog.prompt() +
    '\n\n' +
    LANDING_AUTHORING_GUIDE +
    '\n\nYou are in a CHAT with a creator building their landing page. The conversation may ask ' +
    'you to build a new page or to revise the page you previously proposed. Each time, return the ' +
    'COMPLETE page (all sections), incorporating the requested changes while preserving the parts ' +
    'the user liked. Output only the JSON object.'

  // streamText does not throw provider failures: they surface through onError, and the stream
  // just ends. Capture the first one so the caller gets the real (typed) error instead of a
  // generic "no output generated" from awaiting `result.output` below.
  let streamError: unknown
  const result = streamText({
    model,
    output: Output.object({ schema: pageSpecShape }),
    system,
    messages,
    abortSignal: signal,
    onError: ({ error }) => {
      streamError ??= error
    },
  })

  let lastCount = 0
  for await (const partial of result.partialOutputStream) {
    const els = partial?.elements
    if (!Array.isArray(els)) continue
    if (els.length > lastCount) {
      lastCount = els.length
      send({ type: 'progress', count: els.length, lastType: els[els.length - 1]?.type ?? undefined })
    }
  }
  if (streamError) throw streamError

  const object = await result.output
  const usage = await result.usage
  console.log('[landing/generate] page usage', { tenantId, userId, providerId, ...usage })

  const arraySpec: JsonRenderArraySpec = {
    root: object.root,
    elements: object.elements.map((el) => ({
      id: el.id,
      type: el.type,
      props: parseJson(el.propsJson),
      children: el.children,
    })),
  }
  const spec = normalizeSpec(arraySpecToSpec(arraySpec))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validation = (landingCatalog as any).validate(spec)
  if (!validation.success) {
    send({
      type: 'error',
      status: 422,
      error: 'The generated page did not match the component catalog.',
      issues: validation.error?.issues ?? validation.error?.message,
    })
    return
  }

  const data = specToPuckData(spec, DEFAULT_PROPS_BY_TYPE)
  send({
    type: 'page',
    data,
    blocks: data.content.length,
    reply: `Built a ${data.content.length}-section page. Select any block and tell me how to refine it, or ask me to change the whole page.`,
  })
}

// ── BLOCK intent: edit just the selected block ───────────────────────────────────────────────
async function handleBlockEdit(opts: {
  send: (e: StreamEvent) => void
  model: LanguageModel
  messages: ModelMessage[]
  selectedBlock: SelectedBlock
  tenantId: string
  userId: string
  providerId: ProviderId
  signal: AbortSignal
}) {
  const { send, model, messages, selectedBlock, tenantId, userId, providerId, signal } = opts
  const { id, type, props } = selectedBlock

  // Look up this block's documented prop shape from the catalog so we can describe it precisely
  // and validate the result. If the type isn't generatable, bail clearly.
  if (!DEFAULT_PROPS_BY_TYPE[type]) {
    send({ type: 'error', status: 422, error: `Block type "${type}" can't be edited by the assistant.` })
    return
  }

  const system =
    landingCatalog.prompt() +
    '\n\nYou are in a CHAT helping a creator refine ONE block on their landing page. The user has ' +
    `selected a "${type}" block. Apply their request and return the block's FULL updated props as ` +
    'a JSON object string in `propsJson` (include every prop the block should have afterward, not ' +
    'just the changed ones). Only use props documented for ' +
    `${type} in the component list above. Keep copy on-brand and concrete. Output only the JSON object.\n\n` +
    `CURRENT PROPS of the selected ${type} (id ${id}):\n${JSON.stringify(props, null, 2)}`

  const { output, usage } = await generateText({
    model,
    output: Output.object({ schema: blockEditShape }),
    system,
    messages,
    abortSignal: signal,
  })
  console.log('[landing/generate] block usage', { tenantId, userId, providerId, type, ...usage })

  const newProps = parseJson(output.propsJson)

  // Validate the edited block as a one-element spec against the catalog (same guarantee as pages).
  const spec = normalizeSpec(
    arraySpecToSpec({ root: id, elements: [{ id, type, props: newProps, children: [] }] })
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validation = (landingCatalog as any).validate(spec)
  if (!validation.success) {
    send({
      type: 'error',
      status: 422,
      error: 'The edited block did not match the component catalog.',
      issues: validation.error?.issues ?? validation.error?.message,
    })
    return
  }

  // Merge defaults under the new props so any prop the model dropped falls back gracefully.
  const merged = { ...(DEFAULT_PROPS_BY_TYPE[type] ?? {}), ...cleanProps(newProps) }
  send({
    type: 'block',
    targetId: id,
    blockType: type,
    props: merged,
    reply: `Updated the ${humanizeType(type)}. Want another change?`,
  })
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────
function parseJson(s: string | null | undefined): Record<string, unknown> {
  if (!s) return {}
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function humanizeType(type: string): string {
  // "HeroBlock" → "Hero block", "FaqAccordion" → "Faq accordion"
  return type
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^(.)/, (c) => c.toUpperCase())
    .toLowerCase()
    .replace(/^(.)/, (c) => c.toUpperCase())
}
