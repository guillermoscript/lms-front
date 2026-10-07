import { checkFeatureModel, inferModelCaps, mergeCaps, type Cap, type ModelCaps } from '@/lib/ai/capabilities'
import { featureProviderKind, type AiFeature } from '@/lib/ai/features'
import type { ProviderId, ProviderKind } from '@/lib/ai/provider-ids'
import type { AiActionFailure, AiModelOption, AiProviderDTO, AiSettingsWarning } from '@/app/actions/admin/ai-settings'

/** Client-safe helpers for the AI settings screen. No secrets and no SDK imports. */

export type Translator = (key: string, values?: Record<string, string | number>) => string

/** next-intl's `t` is typed to the message keys; the dynamic keys here are validated by the en/es catalogs. */
export const asTranslator = (t: unknown): Translator => t as Translator

/** Provider kind -> the capability a model must have to be offered in a picker. */
const KIND_CAP: Record<ProviderKind, Cap> = {
  language: 'language',
  stt: 'stt',
  realtime: 'realtime',
  image: 'image',
}

export function modelCaps(provider: ProviderId, model: AiModelOption): ModelCaps {
  return mergeCaps(inferModelCaps(provider, model.id), model.caps)
}

/**
 * Models from a provider's cached list that fit a kind. Models whose capabilities
 * are unknown are left out (embeddings, moderation, ...); the picker still lets
 * the admin type any id, so a brand-new model is never blocked by this filter.
 */
export function modelsForKind(provider: AiProviderDTO | undefined, kind: ProviderKind): AiModelOption[] {
  if (!provider?.models) return []
  const cap = KIND_CAP[kind]
  return provider.models.filter((m) => modelCaps(provider.provider, m)[cap] === true)
}

/** Live (pre-save) check of a feature/model pair, mirroring what the server will say. */
export function liveFeatureCheck(
  feature: AiFeature,
  provider: AiProviderDTO | undefined,
  model: string,
): { blocked: string | null; missing: Cap[] } {
  const id = model.trim()
  if (!provider || !id) return { blocked: null, missing: [] }
  const listed = provider.models?.find((m) => m.id === id)
  const caps = listed ? modelCaps(provider.provider, listed) : inferModelCaps(provider.provider, id)
  const result = checkFeatureModel(feature, provider.provider, id, caps)
  return { blocked: result.blocked ? (result.reason ?? 'provider_not_allowed') : null, missing: result.missing }
}

export function featureKind(feature: AiFeature): ProviderKind {
  return featureProviderKind(feature)
}

/** Translates a save-time warning from the server. */
export function warningText(t: Translator, warning: AiSettingsWarning): string {
  if (warning.startsWith('missing_cap:')) return t(`warnings.missing_cap.${warning.slice('missing_cap:'.length)}`)
  return t(`warnings.${warning}`)
}

export function capWarningText(t: Translator, cap: Cap): string {
  return t(`warnings.missing_cap.${cap}`)
}

export function failureText(t: Translator, failure: AiActionFailure): string {
  if (failure.error === 'ai_failed' && failure.code) return t(`codes.${failure.code}`)
  if (failure.error === 'model_blocked' && failure.reason) return t(`blocked.${failure.reason}`)
  return t(`errors.${failure.error}`)
}

export function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d)
}
