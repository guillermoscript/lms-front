import { PROVIDER_KINDS, type ProviderId, type ProviderKind } from './provider-ids'

/**
 * Every place the platform calls an AI model on a tenant's behalf. A school
 * maps each feature to a (provider, model) pair; unmapped features resolve
 * through `inherits`, then the tenant default (see lib/ai/tenant-ai.ts).
 *
 * Pure data, no SDK imports: safe in client components.
 */
export type AiFeature =
  | 'aristotle'
  | 'aristotle_summary'
  | 'lesson_tutor'
  | 'lesson_verifier'
  | 'checkpoint_grader'
  | 'exercise_coach'
  | 'exercise_grader'
  | 'speech_coach'
  | 'speech_stt'
  | 'voice_conversation'
  | 'exam_grader'
  | 'question_generator'
  | 'starter_course'
  | 'course_architect'
  | 'landing_builder'
  | 'image_generation'

export type AiFeatureKind = 'language' | 'object' | 'stt' | 'realtime' | 'image'

export interface AiFeatureDef {
  kind: AiFeatureKind
  /** Model capabilities the feature cannot work without (soft warning at save time). */
  needs?: { tools?: boolean; vision?: boolean; structured?: boolean }
  /** When the school sets no model for this feature, use the parent's. */
  inherits?: AiFeature
  /** Hard provider allowlist. Absent = any provider that serves the feature's kind. */
  providers?: ProviderId[]
  area: 'student' | 'teacher' | 'admin'
  /** Agent loops / big generations: callers raise maxDuration and the UI warns about cost. */
  longRunning?: boolean
}

export const AI_FEATURES: Record<AiFeature, AiFeatureDef> = {
  aristotle: { kind: 'language', needs: { tools: true }, area: 'student' },
  aristotle_summary: { kind: 'language', inherits: 'aristotle', area: 'student' },
  lesson_tutor: { kind: 'language', needs: { tools: true }, area: 'student' },
  lesson_verifier: { kind: 'object', needs: { structured: true }, inherits: 'lesson_tutor', area: 'student' },
  checkpoint_grader: { kind: 'object', needs: { structured: true }, inherits: 'exercise_grader', area: 'student' },
  exercise_coach: { kind: 'language', needs: { tools: true }, area: 'student' },
  exercise_grader: { kind: 'object', needs: { structured: true }, area: 'student' },
  speech_coach: { kind: 'object', needs: { structured: true }, inherits: 'exercise_grader', area: 'student' },
  speech_stt: { kind: 'stt', providers: ['assemblyai', 'openai', 'groq'], area: 'student' },
  voice_conversation: { kind: 'realtime', providers: ['openai', 'xai', 'google'], area: 'student' },
  exam_grader: { kind: 'object', needs: { structured: true }, area: 'teacher' },
  question_generator: { kind: 'object', needs: { structured: true }, area: 'teacher' },
  starter_course: { kind: 'object', needs: { structured: true }, area: 'admin', longRunning: true },
  course_architect: { kind: 'language', needs: { tools: true }, area: 'teacher', longRunning: true },
  landing_builder: { kind: 'object', needs: { structured: true }, area: 'admin', longRunning: true },
  image_generation: { kind: 'image', providers: ['openai', 'google'], area: 'teacher' },
}

export const AI_FEATURE_IDS = Object.keys(AI_FEATURES) as AiFeature[]

export function isAiFeature(value: unknown): value is AiFeature {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AI_FEATURES, value)
}

/** `language` and `object` features both run on a language model. */
export function featureProviderKind(feature: AiFeature): ProviderKind {
  const kind = AI_FEATURES[feature].kind
  return kind === 'object' ? 'language' : kind
}

/**
 * The feature itself followed by its `inherits` ancestors, nearest first.
 * Guards against a cycle in the table (a bad edit must not hang a request).
 */
export function featureChain(feature: AiFeature): AiFeature[] {
  const chain: AiFeature[] = []
  let cursor: AiFeature | undefined = feature
  while (cursor && !chain.includes(cursor)) {
    chain.push(cursor)
    cursor = AI_FEATURES[cursor].inherits
  }
  return chain
}

/** Can this provider serve this feature at all? Used for pickers and server validation. */
export function featureAllowsProvider(feature: AiFeature, providerId: ProviderId): boolean {
  const def = AI_FEATURES[feature]
  if (def.providers) return def.providers.includes(providerId)
  return PROVIDER_KINDS[providerId].includes(featureProviderKind(feature))
}

export function providersForFeature(feature: AiFeature): ProviderId[] {
  return (Object.keys(PROVIDER_KINDS) as ProviderId[]).filter((p) => featureAllowsProvider(feature, p))
}
