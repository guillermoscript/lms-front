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
 * STREAMING: the page intent uses `streamObject` and streams NDJSON progress events (one per
 * block as it appears) so the editor shows motion instead of a ~15s blank wait, then a single
 * `done` event with the validated Puck Data. The block intent is small/fast and returns one
 * `done` event.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { rateLimit } from '@/lib/rate-limit'
import { AI_CONFIG } from '@/lib/ai/config'
import { streamObject, generateObject, NoObjectGeneratedError, type ModelMessage } from 'ai'
import { z } from 'zod'
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

// Plans allowed to use the landing-page builder + its AI assistant. Mirrors the UI gate in
// components/admin/landing-page/landing-pages-client.tsx (PAID_PLANS / canUseBuilder) so the
// endpoint can't be called directly on the free plan to burn OpenAI tokens.
const PAID_PLANS = ['starter', 'pro', 'business', 'enterprise']

// AI generation is expensive (OpenAI tokens + ~10s of compute), so cap how often a single user
// can trigger it. In-memory per-instance limiter — good enough as a first line of defence; move
// to a shared store (Redis) if/when this runs multi-instance. See lib/rate-limit.ts.
const LANDING_AI_RATE_LIMIT = 20 // requests per window, per user
const landingAiLimiter = rateLimit({
  interval: 5 * 60 * 1000, // 5 minutes
  uniqueTokenPerInterval: 500, // track up to 500 users
})

// ── Schemas ────────────────────────────────────────────────────────────────────────────────
// `elements` is an ARRAY (not z.record) and props are a JSON string because OpenAI's
// structured-output mode rejects `propertyNames` (z.record) and `.optional()` (strict mode
// requires every key in `required`). See lib/json-render/to-puck.ts and the ADR.
const pageSpecShape = z.object({
  root: z.string(),
  elements: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      propsJson: z
        .string()
        .describe('A JSON object string of this block\'s props, e.g. {"title":"...","subtitle":"..."}'),
      children: z.array(z.string()).describe('Child element ids in order; [] for leaf sections.'),
    })
  ),
})

const blockEditShape = z.object({
  propsJson: z
    .string()
    .describe(
      'A JSON object string with the FULL updated props for this block (all props it should ' +
        'have after the edit, not just the changed ones), e.g. {"title":"...","subtitle":"..."}'
    ),
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
  | { type: 'error'; status: number; error: string; issues?: unknown }

export async function POST(req: Request) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!tenantId) return new Response('No tenant context', { status: 400 })

  // Rate limit per user — AI generation is expensive, so throttle before doing any work.
  try {
    await landingAiLimiter.check(LANDING_AI_RATE_LIMIT, user.id)
  } catch {
    return new Response('Too many requests. Please wait a moment and try again.', { status: 429 })
  }

  // Plan gate — the landing-page AI assistant is a paid feature. Enforce server-side (the UI
  // already hides it on the free plan) so the endpoint can't be hit directly to spend tokens.
  const admin = createAdminClient()
  const { data: planResult } = await admin.rpc('get_plan_features', { _tenant_id: tenantId })
  const plan = (planResult as { plan?: string } | null)?.plan ?? 'free'
  if (!PAID_PLANS.includes(plan)) {
    return new Response('The landing-page AI assistant requires a paid plan.', { status: 403 })
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
          await handleBlockEdit({ send, messages, selectedBlock, tenantId, userId: user.id, signal: req.signal })
        } else {
          await handlePageEdit({ send, messages, tenantId, userId: user.id, signal: req.signal })
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          controller.close()
          return
        }
        if (NoObjectGeneratedError.isInstance(err)) {
          console.error('[landing/generate] no object generated', { cause: err.cause, text: err.text, usage: err.usage })
        } else {
          console.error('[landing/generate] model error', err)
        }
        send({ type: 'error', status: 502, error: 'Generation failed. Please try again.' })
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
}

// ── PAGE intent: stream a full page ──────────────────────────────────────────────────────────
async function handlePageEdit(opts: {
  send: (e: StreamEvent) => void
  messages: ModelMessage[]
  tenantId: string
  userId: string
  signal: AbortSignal
}) {
  const { send, messages, tenantId, userId, signal } = opts

  const system =
    landingCatalog.prompt() +
    '\n\n' +
    LANDING_AUTHORING_GUIDE +
    '\n\nYou are in a CHAT with a creator building their landing page. The conversation may ask ' +
    'you to build a new page or to revise the page you previously proposed. Each time, return the ' +
    'COMPLETE page (all sections), incorporating the requested changes while preserving the parts ' +
    'the user liked. Output only the JSON object.'

  const result = streamObject({
    model: AI_CONFIG.defaultModel,
    schema: pageSpecShape,
    system,
    messages,
    abortSignal: signal,
  })

  let lastCount = 0
  for await (const partial of result.partialObjectStream) {
    const els = partial?.elements
    if (!Array.isArray(els)) continue
    if (els.length > lastCount) {
      lastCount = els.length
      send({ type: 'progress', count: els.length, lastType: els[els.length - 1]?.type ?? undefined })
    }
  }

  const object = await result.object
  const usage = await result.usage
  console.log('[landing/generate] page usage', { tenantId, userId, ...usage })

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
  messages: ModelMessage[]
  selectedBlock: SelectedBlock
  tenantId: string
  userId: string
  signal: AbortSignal
}) {
  const { send, messages, selectedBlock, tenantId, userId, signal } = opts
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

  const { object, usage } = await generateObject({
    model: AI_CONFIG.defaultModel,
    schema: blockEditShape,
    system,
    messages,
    abortSignal: signal,
  })
  console.log('[landing/generate] block usage', { tenantId, userId, type, ...usage })

  const newProps = parseJson(object.propsJson)

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
