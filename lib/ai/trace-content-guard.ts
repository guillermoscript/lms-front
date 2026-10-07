import type { Context } from '@opentelemetry/api'
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-node'

/**
 * Per-tenant opt-out of prompt/completion capture in Langfuse (BYOK telemetry).
 *
 * Every AI call site wraps its call in `propagateAttributes({metadata:{tenantId,
 * feature, provider, modelId}})`, so each span an AI call produces (including the
 * AI SDK's own child spans and tool-call spans) carries the tenant id as
 * `langfuse.trace.metadata.tenantId`. A school that turned `ai_trace_content`
 * off (tenant_ai_settings) still gets its traces (tokens, latency, model,
 * errors) but the text of the prompts, completions and tool I/O is removed from
 * the span before it reaches the Langfuse exporter.
 *
 * Wraps the Langfuse processor instead of adding `recordInputs: false` to every
 * call, so a new call site cannot forget it and no tenant lookup leaks into
 * route code. Fails PRIVATE twice over: if the preference cannot be read, content is
 * dropped; and a span that carries prompt/completion text but NO tenant id (a call
 * site that forgot `propagateAttributes`) is stripped too, since its school's choice
 * is unknowable. Spans with neither tenant nor content pass through untouched.
 *
 * Relies on the same trick Langfuse's own processor uses: `span.attributes` of
 * an ended span is a plain object we may edit before the exporter reads it.
 */

/** Where the Langfuse metadata propagation puts the tenant id on a span. */
export const TENANT_ATTRIBUTE_KEYS = [
  'langfuse.trace.metadata.tenantId',
  'langfuse.observation.metadata.tenantId',
] as const

/**
 * Attributes that hold prompt / completion / tool text. Covers the AI SDK's
 * legacy `ai.*` span shape (what `LegacyOpenTelemetry` emits), the OTel GenAI
 * `gen_ai.*` shape, and the Langfuse input/output fields the processor derives.
 * Token counts, model ids, finish reasons and timings are NOT in this list.
 */
const CONTENT_ATTRIBUTE =
  /^(?:ai\.prompt(?:\.|$)|ai\.response\.(?:text|object|toolCalls|reasoning|reasoningText|files)$|ai\.result\.(?:text|object|toolCalls)$|ai\.toolCall\.(?:args|result)$|ai\.(?:value|values|embedding|embeddings)$|gen_ai\.(?:input\.messages|output\.messages|system_instructions|tool\.call\.arguments|tool\.call\.result|prompt|completion)$|langfuse\.(?:observation|trace)\.(?:input|output)$|input\.value$|output\.value$)/

export function isContentAttribute(key: string): boolean {
  return CONTENT_ATTRIBUTE.test(key)
}

function hasContent(span: Pick<ReadableSpan, 'attributes'>): boolean {
  return Object.keys(span.attributes).some(isContentAttribute)
}

export function tenantIdOfSpan(span: Pick<ReadableSpan, 'attributes'>): string | undefined {
  for (const key of TENANT_ATTRIBUTE_KEYS) {
    const v = span.attributes[key]
    if (typeof v === 'string' && v) return v
  }
  return undefined
}

/** Removes content attributes from a span in place; returns how many were dropped. */
export function stripSpanContent(span: Pick<ReadableSpan, 'attributes' | 'events'>): number {
  const attrs = span.attributes as Record<string, unknown>
  let dropped = 0
  for (const key of Object.keys(attrs)) {
    if (isContentAttribute(key)) {
      delete attrs[key]
      dropped++
    }
  }
  // Provider error text can echo the prompt; keep the fact of the exception, not its text.
  for (const event of span.events ?? []) {
    const evAttrs = event.attributes as Record<string, unknown> | undefined
    if (!evAttrs) continue
    for (const key of Object.keys(evAttrs)) {
      if (isContentAttribute(key) || key === 'exception.message' || key === 'exception.stacktrace') {
        delete evAttrs[key]
        dropped++
      }
    }
  }
  return dropped
}

export type TraceContentLookup = (tenantId: string) => Promise<boolean>

export interface TraceContentGuardOptions {
  /** Resolves whether the tenant allows content in traces. Rejecting counts as "no". */
  lookup: TraceContentLookup
  /** How long a tenant's answer is reused. Default 60s: an opt-out takes effect within a minute. */
  ttlMs?: number
  /** Bound on remembered tenants. Default 2000. */
  maxEntries?: number
  now?: () => number
}

export class TraceContentGuardProcessor implements SpanProcessor {
  private readonly inner: SpanProcessor
  private readonly lookup: TraceContentLookup
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly now: () => number
  private readonly cache = new Map<string, { allow: boolean; at: number }>()
  private readonly inflight = new Map<string, Promise<boolean>>()
  private readonly pending = new Set<Promise<void>>()

  constructor(inner: SpanProcessor, options: TraceContentGuardOptions) {
    this.inner = inner
    this.lookup = options.lookup
    this.ttlMs = options.ttlMs ?? 60_000
    this.maxEntries = options.maxEntries ?? 2000
    this.now = options.now ?? Date.now
  }

  onStart(span: Span, parentContext: Context): void {
    this.inner.onStart(span, parentContext)
  }

  onEnd(span: ReadableSpan): void {
    const tenantId = tenantIdOfSpan(span)
    if (!tenantId) {
      this.finish(span, !hasContent(span))
      return
    }

    const cached = this.cache.get(tenantId)
    if (cached && this.now() - cached.at < this.ttlMs) {
      this.finish(span, cached.allow)
      return
    }

    const task = this.resolve(tenantId).then((allow) => this.finish(span, allow))
    this.pending.add(task)
    void task.finally(() => this.pending.delete(task))
  }

  async forceFlush(): Promise<void> {
    await Promise.allSettled([...this.pending])
    await this.inner.forceFlush()
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled([...this.pending])
    await this.inner.shutdown()
  }

  private finish(span: ReadableSpan, allow: boolean) {
    try {
      if (!allow) stripSpanContent(span)
      this.inner.onEnd(span)
    } catch {
      // Telemetry must never break the request that produced it.
    }
  }

  private resolve(tenantId: string): Promise<boolean> {
    let p = this.inflight.get(tenantId)
    if (!p) {
      p = this.lookup(tenantId)
        .catch(() => false) // fail private
        .then((allow) => {
          if (this.cache.size >= this.maxEntries) this.cache.clear()
          this.cache.set(tenantId, { allow, at: this.now() })
          return allow
        })
        .finally(() => this.inflight.delete(tenantId))
      this.inflight.set(tenantId, p)
    }
    return p
  }
}
