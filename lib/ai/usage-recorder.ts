import 'server-only'

import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from 'ai'

import { createAdminClient } from '@/lib/supabase/admin'

import type { AiFeature } from './features'
import type { ProviderId } from './provider-ids'

/**
 * Token accounting for every language-model call made on a school's key.
 *
 * Attached once, in `createTenantAi().getModelForFeature`, as AI SDK middleware,
 * so no call site has to remember to record anything. The middleware sits at the
 * model layer, so a multi-step tutor turn (tool loop) writes one row per step
 * with that step's exact usage. Recording is best effort: it never throws and
 * never delays or fails the user's response beyond one insert.
 *
 * Only language models are covered. Speech-to-text, realtime voice and image
 * generation are billed per second / per image and are not in this table.
 */
export interface UsageContext {
  tenantId: string
  userId: string | null
  feature: AiFeature
  providerId: ProviderId
  modelId: string
}

type RawUsage = {
  inputTokens?: { total?: number; cacheRead?: number } | number
  outputTokens?: { total?: number; reasoning?: number } | number
} | null | undefined

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0)

/** Normalizes the spec's nested usage object (and tolerates a flat one). */
export function readUsage(usage: RawUsage) {
  const input = usage?.inputTokens
  const output = usage?.outputTokens
  return {
    input_tokens: typeof input === 'number' ? n(input) : n(input?.total),
    output_tokens: typeof output === 'number' ? n(output) : n(output?.total),
    cached_input_tokens: typeof input === 'object' && input ? n(input.cacheRead) : 0,
    reasoning_tokens: typeof output === 'object' && output ? n(output.reasoning) : 0,
  }
}

export async function recordAiUsage(ctx: UsageContext, usage: RawUsage): Promise<void> {
  const counts = readUsage(usage)
  if (counts.input_tokens === 0 && counts.output_tokens === 0) return
  try {
    const { error } = await createAdminClient().from('ai_usage_events').insert({
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
      feature: ctx.feature,
      provider: ctx.providerId,
      model: ctx.modelId,
      ...counts,
    })
    // Name/code only: never log the row or any error text that could echo context.
    if (error) console.error('[ai-usage] insert failed', error.code ?? 'unknown')
  } catch (e) {
    console.error('[ai-usage] insert failed', e instanceof Error ? e.name : typeof e)
  }
}

export function usageMiddleware(ctx: UsageContext): LanguageModelMiddleware {
  return {
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate()
      await recordAiUsage(ctx, result.usage as RawUsage)
      return result
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream()
      const tracked = stream.pipeThrough(
        new TransformStream({
          async transform(chunk, controller) {
            if (chunk.type === 'finish') await recordAiUsage(ctx, chunk.usage as RawUsage)
            controller.enqueue(chunk)
          },
        }),
      )
      return { stream: tracked, ...rest }
    },
  }
}

export function withUsageTracking(model: LanguageModel, ctx: UsageContext): LanguageModel {
  // A string id means a gateway model; BYOK always hands us a model object.
  if (typeof model === 'string') return model
  return wrapLanguageModel({ model, middleware: usageMiddleware(ctx) })
}
