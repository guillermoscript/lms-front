import 'server-only'

/**
 * Page Architect agent assembly (design §3.5, critique B1/B4/B6/C7/C8).
 *
 * `createPageAgent` builds the shadow page, the edit + data tools, the approval policy and
 * the system prompt BEFORE the stream opens, so the route can convert the chat history with
 * `{ tools }` (B1) and refuse a malformed request before any usage is counted. `stream()`
 * then attaches the UI-message writer (ops are written as transient `data-page-op` parts)
 * and runs `streamText`.
 */
import { stepCountIs, streamText, type LanguageModel, type ModelMessage, type UIMessage, type UIMessageStreamWriter } from 'ai'
import { propagateAttributes } from '@langfuse/tracing'
import { newBlockId, pageCatalog, type IdFactory, type PageBuilderDataParts, type PageCatalog, type PageData, type PageOp } from '@lms/core'
import type { ProviderId } from '@/lib/ai/provider-ids'
import { reportStreamError } from '@/lib/ai/errors'
import { createDataTools } from './data-tools'
import { createEditTools, OpSink, ShadowPage } from './edit-tools'
import type { PageBuilderContext } from './context'
import { buildInstructions } from './system-prompt'

/** The AI feature this agent runs on (reused id, see lib/ai/features.ts). */
export const PAGE_AGENT_FEATURE = 'landing_builder' as const
/** design §6: stopWhen stepCountIs(25). */
export const PAGE_AGENT_MAX_STEPS = 25
/** design §6: at most 20 messages of history. */
export const PAGE_AGENT_MAX_HISTORY = 20

/** The Page Architect UI message: data parts `page-op`, `turn-status`, `theme-preview` (all transient). */
export type PageArchitectUIMessage = UIMessage<unknown, PageBuilderDataParts>

/**
 * Providers whose tool-schema translation drops an open `props` object get `propsJson: string`
 * instead (critique B7). Empty until the provider matrix test shows one needs it: OpenAI runs
 * with `strict` off, and Anthropic/Google take the raw JSON schema.
 */
export const PROPS_JSON_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>([])

/**
 * One tool call at a time (critique B4): parallel adds would race for the shadow's indexes.
 * Keys are provider names, so passing them all is harmless for the others. Google, DeepSeek
 * and OpenRouter have no such option; the edit tools stay correct under parallel calls
 * (approval tallies at approval time, ops apply in execute order).
 */
export function pageAgentProviderOptions() {
  return {
    openai: { parallelToolCalls: false },
    anthropic: { disableParallelToolUse: true },
    groq: { parallelToolCalls: false },
    mistral: { parallelToolCalls: false },
    xai: { parallelToolCalls: false },
  }
}

export interface CreatePageAgentInput {
  tenantId: string
  userId: string
  providerId: ProviderId
  modelId: string
  context: PageBuilderContext
  /** The editor's current (possibly unsaved) page. */
  pageData: PageData | null
  selectedId?: string | null
  catalog?: PageCatalog
  idFactory?: IdFactory
  coalesceMs?: number
  now?: () => number
}

export interface PageAgentStreamInput {
  model: LanguageModel
  messages: ModelMessage[]
  writer: UIMessageStreamWriter<PageArchitectUIMessage>
  abortSignal?: AbortSignal
}

export function createPageAgent(input: CreatePageAgentInput) {
  const catalog = input.catalog ?? pageCatalog
  const shadow = new ShadowPage(input.pageData, catalog)
  // Captured before any op so the prompt shows the page as the admin sent it.
  const instructions = buildInstructions({ context: input.context, page: shadow.data, selectedId: input.selectedId, catalog })

  let writer: UIMessageStreamWriter<PageArchitectUIMessage> | null = null
  const writeOp = (op: PageOp) => writer?.write({ type: 'data-page-op', data: op, transient: true })
  const sink = new OpSink(shadow, writeOp)

  const productCourses = new Map(input.context.products.map((p) => [p.id, p.courseIds]))
  const edit = createEditTools({
    shadow,
    sink,
    refs: input.context.refs,
    bindings: {
      schoolName: input.context.school.name,
      logoUrl: input.context.school.logoUrl ?? undefined,
      // Templates and presets land in the page's language.
      locale: input.context.locale,
    },
    productCourseIds: (id) => productCourses.get(id),
    selectedId: input.selectedId,
    emitThemePreview: (preview) => writer?.write({ type: 'data-theme-preview', data: preview, transient: true }),
    idFactory: input.idFactory ?? newBlockId,
    propsMode: PROPS_JSON_PROVIDERS.has(input.providerId) ? 'json' : 'object',
    coalesceMs: input.coalesceMs,
    now: input.now,
  })
  const tools = { ...edit.tools, ...createDataTools(input.context) }

  return {
    shadow,
    sink,
    tools,
    toolApproval: edit.toolApproval,
    instructions,

    /** Attach the writer and run the agent loop. Returns the `streamText` result. */
    stream({ model, messages, writer: w, abortSignal }: PageAgentStreamInput) {
      writer = w
      return propagateAttributes(
        {
          userId: input.userId,
          metadata: {
            tenantId: input.tenantId,
            feature: PAGE_AGENT_FEATURE,
            provider: input.providerId,
            modelId: input.modelId,
          },
        },
        () =>
          streamText({
            model,
            instructions,
            messages,
            tools,
            toolApproval: edit.toolApproval,
            // Signs approval requests so a client cannot forge an approval for a destructive call.
            experimental_toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY,
            providerOptions: pageAgentProviderOptions(),
            experimental_telemetry: { functionId: 'page-architect' },
            stopWhen: stepCountIs(PAGE_AGENT_MAX_STEPS),
            abortSignal,
            // Every execute of a step has run by now: a stream still open is an orphan.
            onStepEnd: () => {
              edit.sweepOrphans()
            },
            onEnd: () => {
              edit.sweepOrphans()
            },
            onAbort: () => {
              edit.sweepOrphans()
            },
            onError: async ({ error }) => {
              // Name/code only; a rejected key flips the school's credential to invalid.
              await reportStreamError(error, {
                feature: PAGE_AGENT_FEATURE,
                tenantId: input.tenantId,
                userId: input.userId,
                providerId: input.providerId,
              })
            },
          })
      )
    },
  }
}

export type PageAgent = ReturnType<typeof createPageAgent>
