import { generateImage } from 'ai'
import { z } from 'zod'
import { getBearerUser } from '@/lib/supabase/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import {
  ALLOWED_IMAGE_TYPES,
  IMAGE_COOLDOWN_SECONDS,
  MAX_IMAGE_BYTES,
  MAX_PROMPT_CHARS,
  hasValidInternalSecret,
  imageDailyCap,
  imageGenerationOptions,
  tenantIdFromVerifiedToken,
} from '@/lib/ai/image-request'

/**
 * POST /api/internal/ai/image — server-to-server, called ONLY by the MCP server.
 *
 * The MCP server never holds a provider key or the master key (BYOK): it sends
 * the caller's own access token plus the shared `MCP_PROXY_SECRET`, and this
 * route resolves the school's image provider key, generates, and returns the
 * bytes. The MCP server then uploads them as the caller (RLS) and enforces
 * course/lesson ownership; this route owns auth, tenant, key and the daily cap.
 *
 * Auth: (1) `X-MCP-Secret` must match `MCP_PROXY_SECRET` (fail closed when
 * unset), (2) `Authorization: Bearer <caller JWT>` verified server-side
 * (cookies are ignored), (3) the tenant is the verified token's `tenant_id`
 * claim, never the body, and the caller must be an active teacher/admin of it.
 *
 * Errors: AI failures use the shared `{error:{code, feature, canConfigure,
 * settingsUrl}}` body (402 not configured, 424 key invalid, 422 unsupported
 * model, 429 quota, 502 provider). Provider bodies and keys are never echoed.
 */

export const maxDuration = 120

const FEATURE = 'image_generation' as const

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
})

const noStore = { 'Cache-Control': 'no-store' }

function fail(status: number, code: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: { code, ...extra } }, { status, headers: noStore })
}

type Caller = { tenantId: string; userId: string; role: 'teacher' | 'admin' }

/** Shared gate for POST and DELETE: secret, verified bearer, tenant claim, active teacher/admin. */
async function authenticate(req: Request): Promise<Caller | Response> {
  if (!process.env.MCP_PROXY_SECRET) return fail(503, 'internal_not_configured')
  if (!hasValidInternalSecret(req)) return fail(401, 'unauthorized')

  const token = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
  const user = token ? await getBearerUser(req) : null
  if (!token || !user) return fail(401, 'unauthorized')

  const tenantId = tenantIdFromVerifiedToken(token)
  if (!tenantId) return fail(400, 'tenant_missing')

  const { data: membership } = await createAdminClient()
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  const role = membership?.role as string | undefined
  if (role !== 'teacher' && role !== 'admin') return fail(403, 'forbidden')
  return { tenantId, userId: user.id, role }
}

/**
 * DELETE: gives back the caller's slot when the MCP server could not store an image it already
 * generated (upload failed), so a storage hiccup does not eat the daily cap.
 */
export async function DELETE(req: Request): Promise<Response> {
  const caller = await authenticate(req)
  if (caller instanceof Response) return caller
  try {
    await createAdminClient().rpc('release_ai_image_generation', { _tenant_id: caller.tenantId, _user_id: caller.userId })
  } catch {
    /* best effort */
  }
  return Response.json({ released: true }, { headers: noStore })
}

export async function POST(req: Request): Promise<Response> {
  const caller = await authenticate(req)
  if (caller instanceof Response) return caller
  const { tenantId, role } = caller
  const user = { id: caller.userId }

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return fail(400, 'invalid_request')
  }

  const admin = createAdminClient()

  return withTenantAi(
    { tenantId, feature: FEATURE, canConfigure: role === 'admin', actorId: user.id },
    async (ai) => {
      // Resolve the key and model BEFORE reserving quota: no key, no usage row.
      const { model, providerId, modelId } = await ai.getImageModel()

      const { data: reserved, error: reserveError } = await admin.rpc('reserve_ai_image_generation', {
        _tenant_id: tenantId,
        _user_id: user.id,
        _daily_cap: imageDailyCap(),
        _cooldown_seconds: IMAGE_COOLDOWN_SECONDS,
      })
      if (reserveError) {
        console.error('[ai] reserve_ai_image_generation failed', reserveError.code ?? 'unknown')
        return fail(503, 'usage_unavailable')
      }
      const quota = reserved as { allowed?: boolean; reason?: string; cap?: number } | null
      if (!quota?.allowed) {
        return fail(429, 'image_rate_limited', {
          reason: quota?.reason === 'cooldown' ? 'cooldown' : 'daily_limit',
          cap: quota?.cap ?? null,
        })
      }

      const giveSlotBack = async () => {
        try {
          await admin.rpc('release_ai_image_generation', { _tenant_id: tenantId, _user_id: user.id })
        } catch {
          /* best effort */
        }
      }

      try {
        const { image } = await generateImage({
          model,
          prompt: parsed.prompt,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(90_000),
          ...imageGenerationOptions(providerId, modelId),
        })

        const bytes = image.uint8Array
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
          return fail(413, 'image_too_large', { maxBytes: MAX_IMAGE_BYTES })
        }
        const mediaType = image.mediaType
        if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(mediaType)) {
          return fail(422, 'image_type_unsupported', { mediaType })
        }

        return Response.json(
          { image: image.base64, mediaType, provider: providerId, model: modelId },
          { headers: noStore },
        )
      } catch (e) {
        await giveSlotBack()
        throw e
      }
    },
  )
}
