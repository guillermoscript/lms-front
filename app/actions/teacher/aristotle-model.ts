'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { checkFeatureModel, inferModelCaps, mergeCaps, type ModelCaps } from '@/lib/ai/capabilities'
import { providersForFeature } from '@/lib/ai/features'
import { isProviderId, PROVIDER_LABELS, type ProviderId } from '@/lib/ai/provider-ids'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

/**
 * Per-course Aristotle model override (`course_ai_tutors.provider/model`).
 *
 * Callable by the course author or a school admin. Never touches key material:
 * it reads only provider / status / models_cache (non-secret) and a model can
 * be picked only from a provider the school has an ACTIVE key for.
 */

export interface AristotleModelOption {
  id: string
  label: string
  vision: boolean
}

export interface AristotleProviderOptions {
  provider: ProviderId
  label: string
  models: AristotleModelOption[]
}

export interface AristotleModelState {
  /** Providers (allowed for Aristotle) the school has an active key for, with their cached models. */
  providers: AristotleProviderOptions[]
  current: { provider: string; model: string } | null
}

export type AristotleModelResult<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string }

const courseIdSchema = z.coerce.number().int().positive()

const setSchema = z.object({
  courseId: courseIdSchema,
  provider: z.string().max(40).nullable().optional(),
  model: z.string().trim().min(1).max(200).regex(/^[\w./:@+-]+$/).nullable().optional(),
})

async function authorize(courseId: number) {
  const [role, userId, tenantId] = await Promise.all([getUserRole(), getCurrentUserId(), getCurrentTenantId()])
  if (!userId || (role !== 'admin' && role !== 'teacher')) return null

  const supabase = await createClient()
  const { data: course } = await supabase
    .from('courses')
    .select('author_id')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!course) return null
  if (role !== 'admin' && course.author_id !== userId) return null
  return { supabase, userId, tenantId }
}

function listedModels(raw: unknown, provider: ProviderId): AristotleModelOption[] {
  if (!Array.isArray(raw)) return []
  const out: AristotleModelOption[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || typeof (entry as { id?: unknown }).id !== 'string') continue
    const { id, label, caps } = entry as { id: string; label?: unknown; caps?: ModelCaps }
    const merged = mergeCaps(inferModelCaps(provider, id), caps)
    // Skip models that are provably not text models (speech, realtime, image); unknown ids stay selectable.
    if (merged.language === false) continue
    if (!merged.language && (merged.stt || merged.realtime || merged.image)) continue
    out.push({ id, label: typeof label === 'string' && label ? label : id, vision: merged.vision === true })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** Picker data for the tutor config form: configured providers + their models, and the current override. */
export async function getAristotleModelOptions(courseId: number): Promise<AristotleModelResult<{ state: AristotleModelState }>> {
  const parsed = courseIdSchema.safeParse(courseId)
  if (!parsed.success) return { ok: false, error: 'invalid_request' }
  const ctx = await authorize(parsed.data)
  if (!ctx) return { ok: false, error: 'forbidden' }

  const allowed = providersForFeature('aristotle')
  const admin = createAdminClient()
  const [{ data: creds }, { data: tutor }] = await Promise.all([
    // Never select key_ciphertext here.
    admin
      .from('tenant_ai_credentials')
      .select('tenant_id, provider, status, models_cache')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'active'),
    ctx.supabase
      .from('course_ai_tutors')
      .select('provider, model')
      .eq('course_id', parsed.data)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle(),
  ])

  const providers: AristotleProviderOptions[] = []
  for (const row of creds ?? []) {
    if (row.tenant_id !== ctx.tenantId || !isProviderId(row.provider) || !allowed.includes(row.provider)) continue
    providers.push({
      provider: row.provider,
      label: PROVIDER_LABELS[row.provider],
      models: listedModels(row.models_cache, row.provider),
    })
  }
  providers.sort((a, b) => a.label.localeCompare(b.label))

  return {
    ok: true,
    state: {
      providers,
      current: tutor?.provider && tutor.model ? { provider: tutor.provider, model: tutor.model } : null,
    },
  }
}

/**
 * Sets (or, with no provider/model, clears) the course's Aristotle model.
 * The tutor row must already exist (the form saves the config first).
 */
export async function setAristotleCourseModel(input: {
  courseId: number
  provider?: string | null
  model?: string | null
}): Promise<AristotleModelResult<{ warning?: 'vision_unknown' }>> {
  const parsed = setSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_request' }
  const { courseId } = parsed.data
  const provider = parsed.data.provider ?? null
  const model = parsed.data.model ?? null
  if ((provider === null) !== (model === null)) return { ok: false, error: 'invalid_request' }

  const ctx = await authorize(courseId)
  if (!ctx) return { ok: false, error: 'forbidden' }

  let warning: 'vision_unknown' | undefined
  if (provider !== null && model !== null) {
    if (!isProviderId(provider)) return { ok: false, error: 'invalid_provider' }

    const admin = createAdminClient()
    const { data: cred } = await admin
      .from('tenant_ai_credentials')
      .select('tenant_id, status, models_cache')
      .eq('tenant_id', ctx.tenantId)
      .eq('provider', provider)
      .maybeSingle()
    if (!cred || cred.tenant_id !== ctx.tenantId || cred.status !== 'active') {
      return { ok: false, error: 'provider_not_configured' }
    }

    const cached = Array.isArray(cred.models_cache) ? (cred.models_cache as { id?: unknown }[]) : []
    if (cached.length > 0 && !cached.some((m) => m?.id === model)) return { ok: false, error: 'unknown_model' }

    const check = checkFeatureModel('aristotle', provider, model)
    if (check.blocked) return { ok: false, error: check.reason ?? 'model_not_supported' }
    if (check.missing.includes('vision')) warning = 'vision_unknown'
  }

  const { data: updated, error } = await ctx.supabase
    .from('course_ai_tutors')
    .update({ provider, model })
    .eq('course_id', courseId)
    .eq('tenant_id', ctx.tenantId)
    .select('tutor_id')
  if (error) return { ok: false, error: 'save_failed' }
  if (!updated?.length) return { ok: false, error: 'tutor_not_found' }

  await createAdminClient()
    .from('tenant_ai_audit')
    .insert({ tenant_id: ctx.tenantId, actor: ctx.userId, action: 'model_change', provider, feature: 'aristotle' })

  revalidatePath(`/dashboard/teacher/courses/${courseId}/settings`)
  return warning ? { ok: true, warning } : { ok: true }
}
