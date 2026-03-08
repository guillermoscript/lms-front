import { AssemblyAIProvider } from './providers/assemblyai'
import { VapiProvider } from './providers/vapi'
import { OpenAICoachProvider } from './coaches/openai'
import { GeminiCoachProvider } from './coaches/gemini'
import type { STTProvider, SpeechCoach } from './types'

export const STT_PROVIDERS: Record<string, () => STTProvider> = {
  assemblyai: () => new AssemblyAIProvider(),
  vapi: () => new VapiProvider(),
}

export const SPEECH_COACHES: Record<string, () => SpeechCoach> = {
  openai: () => new OpenAICoachProvider(),
  gemini: () => new GeminiCoachProvider(),
}

export function getPipeline(sttName = 'assemblyai', coachName = 'openai') {
  const stt = STT_PROVIDERS[sttName]
  const coach = SPEECH_COACHES[coachName]

  if (!stt) throw new Error(`Unknown STT provider: "${sttName}". Available: ${Object.keys(STT_PROVIDERS).join(', ')}`)
  if (!coach) throw new Error(`Unknown speech coach: "${coachName}". Available: ${Object.keys(SPEECH_COACHES).join(', ')}`)

  return { stt: stt(), coach: coach() }
}
