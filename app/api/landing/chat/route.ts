/**
 * POST /api/landing/chat — Page Architect, the chat agent that edits a landing page live.
 *
 * The agent works on the page the admin has open: the editor sends its current (unsaved)
 * `pageData`, the server keeps a shadow copy, and every tool call is validated, applied to
 * the shadow and streamed to the editor as a transient `data-page-op` part (see
 * lib/page-builder/*). The editor applies the ops with one undo step per turn; Save stays
 * explicit and is the security boundary (updateLandingPage re-validates the whole page).
 *
 * Check order (design §3.5, critique B5/C3): auth → admin role (tenant_users) → plan gate →
 * resolve the school's model (402/424/422 before anything else is spent) → burst limiter →
 * body → page size/shape (413/400) → JWT tenant (409) → page row (404) → history conversion
 * (400) → `checkAiChatUsage`, which INCREMENTS the daily budget, so every refusal comes
 * before it → stream. BYOK only (feature `landing_builder`), no platform key.
 */
import { createUIMessageStream, createUIMessageStreamResponse, convertToModelMessages, toUIMessageStream } from 'ai'
import { z } from 'zod'
import { PAGE_LIMITS, jsonBytes, pageCatalog, type PageData } from '@lms/core'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { aiErrorBody, classifyProviderError } from '@/lib/ai/errors'
import { jwtTenantId } from '@/lib/ai/course-architect-tools'
import { capChatHistory } from '@/lib/ai/chat-helpers'
import { AI_CHAT_TURNS_PER_MINUTE, aiChatLimiter } from '@/lib/rate-limit'
import { aiChatRateLimitedResponse, aiChatUsageLimitResponse, checkAiChatUsage } from '@/lib/ai/chat-usage'
import { getTenantPlan } from '@/lib/plans/server'
import { loadLandingPage, loadPageBuilderContext } from '@/lib/page-builder/context'
import {
  PAGE_AGENT_FEATURE,
  PAGE_AGENT_MAX_HISTORY,
  createPageAgent,
  type PageArchitectUIMessage,
} from '@/lib/page-builder/agent'

export const maxDuration = 300

// The landing-page AI stays paid-only (owner decision: unchanged behaviour). The school's own
// key pays for the tokens; this gate is a product decision, not a cost guard.
const PAID_PLANS = ['starter', 'pro', 'business', 'enterprise']

const bodySchema = z.object({
  chatId: z.string().max(200).optional(),
  messages: z.array(z.any()).min(1).max(400),
  pageId: z.string().min(1).max(100),
  pageData: z.unknown().optional(),
  selectedId: z.string().max(200).nullish(),
  locale: z.enum(['en', 'es']).default('en'),
})

/**
 * The last `PAGE_AGENT_MAX_HISTORY` messages, starting at a user message: a cut that lands on
 * an assistant message (odd history length) is refused by providers that require the
 * conversation to open with the user (Anthropic).
 */
function trimHistory<T>(messages: T[]): T[] {
  const capped = capChatHistory(messages, PAGE_AGENT_MAX_HISTORY)
  const first = capped.findIndex((m) => (m as { role?: unknown } | null)?.role === 'user')
  return first > 0 ? capped.slice(first) : capped
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function POST(req: Request) {
  // 1. auth
  const auth = await getApiAuthContext(req)
  if (!auth) return new Response('Unauthorized', { status: 401 })
  const { supabase, user, tenantId } = auth
  if (!tenantId) return json(400, { code: 'no_tenant' })

  // 2. admin only (every landing save goes through verifyAdminAccess). tenant_users is
  // authoritative; read with the verified user id on the admin client (C3).
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('tenant_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
  if (membership?.role !== 'admin') return json(403, { code: 'admin_only' })

  return withTenantAi({ tenantId, feature: PAGE_AGENT_FEATURE, canConfigure: true, actorId: user.id }, async (ai) => {
    // 3. plan gate (unchanged: paid plans only).
    const plan = await getTenantPlan(tenantId)
    if (!PAID_PLANS.includes(plan.slug)) return json(403, { code: 'plan_required' })

    // 4. the school's model, tool-capable. No key → 402 here, before any side effect.
    const { model, providerId, modelId } = await ai.getModelForFeature(PAGE_AGENT_FEATURE, { require: ['tools'] })

    // 5. burst limiter
    try {
      await aiChatLimiter.check(AI_CHAT_TURNS_PER_MINUTE, user.id)
    } catch {
      return aiChatRateLimitedResponse()
    }

    // 6. body
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json(400, { code: 'invalid_body' })
    const { messages: rawMessages, pageId, pageData: rawPage, selectedId, locale } = parsed.data

    // 7. the editor's page: trusted as content only, validated leniently (C2) and capped.
    if (rawPage !== undefined && rawPage !== null) {
      if (jsonBytes(rawPage) > PAGE_LIMITS.maxPageBytes) return json(413, { code: 'page_too_large' })
      const v = pageCatalog.validatePage(rawPage)
      if (!v.ok) return json(400, { code: 'invalid_page', errors: v.errors.slice(0, 10) })
    }

    // 8. the session must belong to this school: the editor saves under RLS keyed on the JWT
    // tenant, so work done here would be unsaveable from another school's session.
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (token && jwtTenantId(token) !== tenantId) return json(409, { code: 'tenant_mismatch' })

    // 9. the page row (tenant-filtered) and the business context.
    const [page, context] = await Promise.all([loadLandingPage(tenantId, pageId), loadPageBuilderContext(tenantId, locale)])
    if (!page) return json(404, { code: 'page_not_found' })
    const pageData = (rawPage ?? page.puckData) as PageData | null

    const agent = createPageAgent({
      tenantId,
      userId: user.id,
      providerId,
      modelId,
      context,
      pageData,
      selectedId: selectedId ?? null,
    })

    // 10. history → model messages, with the tools (B1: async, and approvals need the tools).
    let modelMessages
    try {
      modelMessages = await convertToModelMessages(trimHistory(rawMessages), { tools: agent.tools })
    } catch {
      return json(400, { code: 'invalid_messages' })
    }

    // 11. the durable daily budget. It increments, so it is the last check (B5).
    const usage = await checkAiChatUsage(supabase, tenantId, user.id)
    if (!usage.allowed) return aiChatUsageLimitResponse(usage.reason)

    // A failure mid-stream cannot change the HTTP status: it travels as the stream's error
    // text, the same JSON body pre-stream errors use (parseAiChatError on the client).
    const onError = (error: unknown) =>
      JSON.stringify(
        aiErrorBody(classifyProviderError(error, { feature: PAGE_AGENT_FEATURE, providerId }), {
          feature: PAGE_AGENT_FEATURE,
          canConfigure: true,
        })
      )

    const stream = createUIMessageStream<PageArchitectUIMessage>({
      execute: ({ writer }) => {
        const result = agent.stream({ model, messages: modelMessages, writer, abortSignal: req.signal })
        writer.merge(toUIMessageStream<typeof agent.tools, PageArchitectUIMessage>({ stream: result.stream, tools: agent.tools, onError }))
      },
      onError,
    })
    return createUIMessageStreamResponse({ stream })
  })
}
