import type { STTProvider, SpeechCoach, SpeechEvaluation, ExerciseContext, SpeechCoachOptions } from './types'

export async function runSpeechPipeline(
  audioUrl: string,
  exerciseContext: ExerciseContext,
  providers: { stt: STTProvider; coach: SpeechCoach },
  options?: SpeechCoachOptions
): Promise<SpeechEvaluation> {
  const rubric = exerciseContext.speechRubric
  // A learner is graded on their own wording, in a language we already know.
  const transcription = await providers.stt.transcribe(
    audioUrl,
    rubric?.rubric_mode === 'language_learner' ? { language: rubric.target_language, verbatim: true } : undefined
  )
  const evaluation = await providers.coach.evaluate(transcription, exerciseContext, options)
  return evaluation
}
