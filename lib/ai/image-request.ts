import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'
import type { ProviderId } from './provider-ids'

/** Output limits shared with the `course-images` bucket (5MB, these mime types). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_PROMPT_CHARS = 1000
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
export const IMAGE_COOLDOWN_SECONDS = 5
const DEFAULT_DAILY_CAP = 20

/** Per-user daily image cap (`AI_IMAGE_DAILY_CAP`; `-1`/`0` = unlimited). Abuse brake only: the school pays its own provider. */
export function imageDailyCap(): number {
  const raw = process.env.AI_IMAGE_DAILY_CAP
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_CAP
  const n = Number(raw)
  return Number.isFinite(n) ? Math.floor(n) : DEFAULT_DAILY_CAP
}

/**
 * Constant-time check of the shared `MCP_PROXY_SECRET`. Fails closed: with no
 * secret configured on this side nobody can call the internal route.
 */
export function hasValidInternalSecret(req: Request): boolean {
  const expected = process.env.MCP_PROXY_SECRET
  if (!expected) return false
  const given = req.headers.get('x-mcp-secret')
  if (!given) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/**
 * Provider-shaped options for a 3:2-ish cover image. Image models differ in
 * which size knob they accept, so this is keyed by provider and (for OpenAI)
 * model family; an unknown model gets no size hint rather than a request the
 * provider would reject.
 */
export function imageGenerationOptions(providerId: ProviderId, modelId: string): {
  size?: `${number}x${number}`
  aspectRatio?: `${number}:${number}`
  providerOptions?: Record<string, Record<string, string>>
} {
  if (providerId === 'openai') {
    if (modelId.startsWith('gpt-image')) {
      return {
        size: '1536x1024',
        providerOptions: { openai: { quality: 'medium', outputFormat: 'webp' } },
      }
    }
    if (modelId === 'dall-e-3') return { size: '1792x1024' }
    return {}
  }
  if (providerId === 'google') return { aspectRatio: '16:9' }
  return {}
}

/** Pulls the verified `tenant_id` claim out of a token the caller has ALREADY verified with `getUser(token)`. */
export function tenantIdFromVerifiedToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    const id = payload?.tenant_id ?? payload?.app_metadata?.tenant_id
    return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null
  } catch {
    return null
  }
}
