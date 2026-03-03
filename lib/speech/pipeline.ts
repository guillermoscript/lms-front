import type { STTProvider, SpeechCoach, SpeechEvaluation, ExerciseContext, SpeechCoachOptions } from './types'

export async function runSpeechPipeline(
  audioUrl: string,
  exerciseContext: ExerciseContext,
  providers: { stt: STTProvider; coach: SpeechCoach },
  options?: SpeechCoachOptions
): Promise<SpeechEvaluation> {
  const transcription = await providers.stt.transcribe(audioUrl)
  const evaluation = await providers.coach.evaluate(transcription, exerciseContext, options)
  return evaluation
}
