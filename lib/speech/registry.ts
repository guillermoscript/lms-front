import type { TenantAi } from '@/lib/ai/tenant-ai'
import { ModelCoachProvider } from './coaches/model-coach'
import { TenantSttProvider } from './providers/tenant-stt'
import type { STTProvider, SpeechCoach } from './types'

export interface SpeechPipelineProviders {
  stt: STTProvider
  coach: SpeechCoach
}

/**
 * The school's own speech pipeline: STT from `ai.getTranscriber()` (feature
 * `speech_stt`) and the coach from `ai.getModelForFeature('speech_coach')`.
 * There is no per-exercise provider choice any more (`stt_provider` /
 * `ai_coach` in old exercise configs are ignored) and no platform fallback.
 *
 * Both are resolved here, up front, so a missing key or an unsupported model
 * throws a typed Ai*Error before the caller claims a submission or spends
 * anything. Wrap the caller in `withTenantAi` to turn that into the 402/424/422.
 */
export async function getPipeline(ai: Pick<TenantAi, 'getTranscriber' | 'getModelForFeature'>): Promise<SpeechPipelineProviders> {
  const transcriber = await ai.getTranscriber()
  const coach = await ai.getModelForFeature('speech_coach', { require: ['structured'] })
  return {
    stt: new TenantSttProvider(transcriber),
    coach: new ModelCoachProvider(coach.model, coach.providerId),
  }
}
