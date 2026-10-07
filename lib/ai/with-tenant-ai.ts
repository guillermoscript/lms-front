import 'server-only'

import { handleAiError } from './errors'
import type { AiFeature } from './features'
import { createTenantAi, type TenantAi } from './tenant-ai'

export interface WithTenantAiOptions {
  /** From `getApiAuthContext` / `getCurrentTenantId` / `authorizeExercisePreview`, never the request body. */
  tenantId: string
  feature: AiFeature
  /** Is the caller a school admin (decides the error copy and the settings link)? */
  canConfigure: boolean
  actorId?: string | null
  locale?: string
}

/**
 * Route-handler wrapper: gives `fn` a per-request tenant AI handle and turns any
 * AI / provider failure into the typed JSON response (402/424/422/429/502 with
 * `{error:{code, feature, canConfigure, settingsUrl}}`), auto-invalidating a key
 * the provider rejected. Non-AI errors are rethrown, so bugs stay 500s.
 *
 *   return withTenantAi({ tenantId, feature: 'lesson_tutor', canConfigure }, async (ai) => {
 *     const { model } = await ai.getModelForFeature('lesson_tutor')
 *     ...
 *   })
 *
 * Check order stays the caller's job: auth, access and role gates run BEFORE
 * this, and model resolution runs before rate limits and side effects, so a
 * missing key leaves no pending rows and no usage increments.
 */
export async function withTenantAi(
  opts: WithTenantAiOptions,
  fn: (ai: TenantAi) => Promise<Response>,
): Promise<Response> {
  const ai = createTenantAi(opts.tenantId, { actorId: opts.actorId })
  try {
    return await fn(ai)
  } catch (e) {
    return handleAiError(e, {
      feature: opts.feature,
      canConfigure: opts.canConfigure,
      locale: opts.locale,
      tenantId: opts.tenantId,
      providerId: ai.lastProviderId(),
      actorId: opts.actorId,
    })
  }
}
