import { inferModelCaps, mergeCaps, type ModelCaps } from '@/lib/ai/capabilities'
import { providersForFeature } from '@/lib/ai/features'
import { isProviderId, PROVIDER_LABELS, type ProviderId } from '@/lib/ai/provider-ids'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AristotleModelOption, AristotleProviderOptions } from '@/app/actions/teacher/aristotle-model'

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

/**
 * Providers (allowed for Aristotle) the school has an ACTIVE key for, with their cached
 * non-secret models. Plain function (not a server action) so a page that already loaded the
 * course and its tutor row can call it without re-authorizing or re-reading them.
 * The caller must already have established the user may see this course's settings.
 */
export async function buildAristotleProviders(tenantId: string): Promise<AristotleProviderOptions[]> {
  const allowed = providersForFeature('aristotle')
  const { data: creds } = await createAdminClient()
    .from('tenant_ai_credentials')
    // Never select key_ciphertext here.
    .select('tenant_id, provider, status, models_cache')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')

  const providers: AristotleProviderOptions[] = []
  for (const row of creds ?? []) {
    if (row.tenant_id !== tenantId || !isProviderId(row.provider) || !allowed.includes(row.provider)) continue
    providers.push({
      provider: row.provider,
      label: PROVIDER_LABELS[row.provider],
      models: listedModels(row.models_cache, row.provider as ProviderId),
    })
  }
  return providers.sort((a, b) => a.label.localeCompare(b.label))
}
