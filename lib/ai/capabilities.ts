import { AI_FEATURES, featureAllowsProvider, featureProviderKind, type AiFeature } from './features'
import type { ProviderId } from './provider-ids'

/**
 * What a model can do, inferred from its id. A static pattern table: provider
 * `/models` endpoints rarely report capabilities (Anthropic, Mistral,
 * OpenRouter and DeepSeek do; `providers.ts` merges those over this guess).
 *
 * It is advisory. A wrong guess costs a warning at save time, never a broken
 * call, EXCEPT for `stt` and `realtime` features, where a model of the wrong
 * shape cannot work at all, so `checkFeatureModel` blocks those.
 */
export type Cap = 'language' | 'tools' | 'vision' | 'structured' | 'stt' | 'realtime' | 'image'

export type ModelCaps = Partial<Record<Cap, boolean>>

const TEXT_MODEL: ModelCaps = { language: true, tools: true, structured: true }

type Rule = [pattern: RegExp, caps: ModelCaps | ((id: string) => ModelCaps)]

/** First matching rule wins; no match = unknown model = no caps. */
const RULES: Record<ProviderId, Rule[]> = {
  openai: [
    [/realtime/, { realtime: true }],
    [/whisper|transcribe/, { stt: true }],
    [/^(gpt-image|dall-e|chatgpt-image)/, { image: true }],
    [/embedding|moderation|tts|audio|search-preview|davinci|babbage|instruct|sora|computer-use/, {}],
    [
      /^(gpt-|o\d|chatgpt-|codex)/,
      (id) => ({
        ...TEXT_MODEL,
        structured: !/^gpt-3\.5/.test(id),
        vision:
          /gpt-(4o|4\.1|4\.5|5|4-turbo|4-vision)/.test(id) || /^o(1|3|4)(?!.*mini)/.test(id) || /^o4-mini/.test(id),
      }),
    ],
  ],
  anthropic: [[/^claude-/, (id) => ({ ...TEXT_MODEL, vision: !/^claude-(2|instant)/.test(id) })]],
  google: [
    [/embedding|aqa|tts|veo|learnlm/, {}],
    [/imagen|-image/, { image: true }],
    [/live|realtime|native-audio/, { realtime: true }],
    [/^gemini-/, { ...TEXT_MODEL, vision: true }],
    [/^gemma-/, (id) => ({ language: true, vision: /gemma-3/.test(id) })],
  ],
  openrouter: [
    // ids are `vendor/model[:variant]`; vision is a guess, listModels overrides it from the catalog
    [
      /./,
      (id) => ({
        ...TEXT_MODEL,
        vision: /gpt-4o|gpt-4\.1|gpt-5|claude|gemini|pixtral|qwen.*vl|llama-4|grok-4|vision/.test(id),
      }),
    ],
  ],
  groq: [
    [/whisper/, { stt: true }],
    [/tts|orpheus|playai|guard/, {}],
    [
      /llama|mixtral|gemma|qwen|deepseek|gpt-oss|kimi|moonshot|compound/,
      (id) => ({
        ...TEXT_MODEL,
        vision: /llama-4|vision/.test(id),
        structured: /gpt-oss|llama-4|kimi/.test(id),
      }),
    ],
  ],
  mistral: [
    [/transcribe/, { stt: true }],
    [/embed|moderation|ocr/, {}],
    [
      /^(mistral|ministral|magistral|codestral|devstral|pixtral|open-mistral|open-mixtral|voxtral)/,
      (id) => ({ ...TEXT_MODEL, vision: /pixtral|mistral-(medium|small)|ministral/.test(id) }),
    ],
  ],
  xai: [
    [/realtime|voice/, { realtime: true }],
    [/imagine|image/, { image: true }],
    [/^grok-/, (id) => ({ ...TEXT_MODEL, vision: /vision|grok-4/.test(id) })],
  ],
  deepseek: [[/^deepseek-/, { ...TEXT_MODEL, vision: false }]],
  assemblyai: [[/^universal/, { stt: true }]],
}

export function inferModelCaps(providerId: ProviderId, modelId: string): ModelCaps {
  const id = modelId.toLowerCase()
  for (const [pattern, caps] of RULES[providerId]) {
    if (pattern.test(id)) return typeof caps === 'function' ? caps(id) : { ...caps }
  }
  return {}
}

/** Provider-reported capabilities win over the id-pattern guess. */
export function mergeCaps(inferred: ModelCaps, reported?: ModelCaps | null): ModelCaps {
  if (!reported) return inferred
  const out: ModelCaps = { ...inferred }
  for (const [key, value] of Object.entries(reported) as [Cap, boolean | undefined][]) {
    if (typeof value === 'boolean') out[key] = value
  }
  return out
}

/** Which of `required` the model does not (provably) have. Unknown = missing. */
export function missingCaps(caps: ModelCaps, required: readonly Cap[]): Cap[] {
  return required.filter((cap) => caps[cap] !== true)
}

export interface FeatureModelCheck {
  /** Safe to save without confirmation: nothing blocked, nothing to warn about. */
  ok: boolean
  /** Cannot work at all: refuse to save. Only provider mismatches and stt/realtime shape errors. */
  blocked: boolean
  reason?: 'provider_not_allowed' | 'not_a_speech_model' | 'not_a_realtime_model' | 'not_an_image_model'
  /** Capabilities the feature wants that the model does not appear to have (soft). */
  missing: Cap[]
}

/**
 * Save-time check for "use this model for this feature". `caps` is the
 * provider-reported set when known (models_cache); otherwise inferred from the id.
 */
export function checkFeatureModel(
  feature: AiFeature,
  providerId: ProviderId,
  modelId: string,
  caps: ModelCaps = inferModelCaps(providerId, modelId),
): FeatureModelCheck {
  if (!featureAllowsProvider(feature, providerId)) {
    return { ok: false, blocked: true, reason: 'provider_not_allowed', missing: [] }
  }

  const def = AI_FEATURES[feature]
  const kind = featureProviderKind(feature)

  if (kind === 'stt') {
    return caps.stt === true
      ? { ok: true, blocked: false, missing: [] }
      : { ok: false, blocked: true, reason: 'not_a_speech_model', missing: ['stt'] }
  }
  if (kind === 'realtime') {
    return caps.realtime === true
      ? { ok: true, blocked: false, missing: [] }
      : { ok: false, blocked: true, reason: 'not_a_realtime_model', missing: ['realtime'] }
  }
  if (kind === 'image') {
    // Soft: image model ids drift faster than the table.
    return caps.image === true
      ? { ok: true, blocked: false, missing: [] }
      : { ok: false, blocked: false, reason: 'not_an_image_model', missing: ['image'] }
  }

  const wanted: Cap[] = ['language']
  if (def.needs?.tools) wanted.push('tools')
  if (def.needs?.vision) wanted.push('vision')
  if (def.needs?.structured) wanted.push('structured')
  const missing = missingCaps(caps, wanted)
  return { ok: missing.length === 0, blocked: false, missing }
}
