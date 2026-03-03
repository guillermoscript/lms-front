import { generateText, Output } from 'ai'
import { z } from 'zod'
import { AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import type { SpeechCoach, TranscriptionResult, ExerciseContext, SpeechEvaluation, SpeechMetrics, AnnotatedSegment, SpeechCoachOptions } from '../types'

const SpeechEvaluationSchema = z.object({
  score: z.number().min(0).max(100).describe('Overall score 0-100'),
  strengths: z.array(z.string()).min(1).max(5).describe('What the speaker did well'),
  improvements: z.array(z.string()).min(1).max(5).describe('Specific areas to improve'),
  focus_next: z.string().describe('Single most important thing to focus on in the next attempt'),
})

export class OpenAICoachProvider implements SpeechCoach {
  name = 'openai'

  async evaluate(transcription: TranscriptionResult, context: ExerciseContext, options?: SpeechCoachOptions): Promise<SpeechEvaluation> {
    const metrics: SpeechMetrics = {
      wpm: transcription.wpm,
      filler_count: transcription.filler_words.reduce((sum, f) => sum + f.count, 0),
      pause_count: transcription.pauses.length,
      long_pause_count: transcription.pauses.filter((p) => p.duration_ms > 1500).length,
      avg_pause_duration_ms:
        transcription.pauses.length > 0
          ? Math.round(transcription.pauses.reduce((s, p) => s + p.duration_ms, 0) / transcription.pauses.length)
          : 0,
      duration_seconds: transcription.duration_seconds,
    }

    // Output.object() and tools can't be combined in generateText (causes AI_NoOutputGeneratedError).
    // So we get the structured evaluation first, then call markExerciseCompleted programmatically.
    const { output } = await generateText({
      model: AI_MODELS.coach,
      output: Output.object({ schema: SpeechEvaluationSchema }),
      system: PROMPTS.speechCoach({ ...context, passingScore: context.passingScore }, metrics),
      prompt: `Student transcript:\n\n"${transcription.transcript}"`,
    })

    if (!output) throw new Error('AI coach did not return structured output')

    // MUST call markExerciseCompleted if score meets passing threshold
    const passingScore = context.passingScore ?? 70
    const shouldComplete = output.score >= passingScore
    console.log('[SpeechCoach] Score:', output.score, '| Passing:', passingScore, '| Should complete:', shouldComplete, '| Has supabase:', !!options?.supabase, '| exerciseId:', context.exerciseId, '| userId:', context.userId)

    if (shouldComplete) {
      if (!options?.supabase) throw new Error('Supabase client is required to mark exercise as completed')
      if (!context.exerciseId) throw new Error('Exercise ID is required to mark exercise as completed')
      if (!context.userId) throw new Error('User ID is required to mark exercise as completed')

      const { data: existing, error: checkError } = await options.supabase
        .from('exercise_completions')
        .select('id')
        .eq('exercise_id', context.exerciseId)
        .eq('user_id', context.userId)
        .limit(1)
        .single()

      console.log('[SpeechCoach] Existing completion check:', { existing, checkError: checkError?.message })

      if (!existing) {
        const { data: inserted, error: insertError } = await options.supabase
          .from('exercise_completions')
          .insert({
            exercise_id: context.exerciseId,
            user_id: context.userId,
            completed_by: context.userId,
            score: output.score,
          })
          .select('id')
          .single()

        if (insertError) {
          console.error('[SpeechCoach] Failed to mark exercise completed:', insertError)
          throw new Error('Failed to mark exercise as completed: ' + insertError.message)
        }
        console.log('[SpeechCoach] Exercise marked as completed:', inserted)
      } else {
        console.log('[SpeechCoach] Exercise already completed, skipping')
      }
    }

    const annotated_transcript = this.buildAnnotatedTranscript(transcription)

    return {
      score: output.score,
      strengths: output.strengths,
      improvements: output.improvements,
      focus_next: output.focus_next,
      annotated_transcript,
      metrics,
    }
  }

  private buildAnnotatedTranscript(transcription: TranscriptionResult): AnnotatedSegment[] {
    if (!transcription.words.length) {
      return [{ text: transcription.transcript, type: 'normal' }]
    }

    const fillerTimestamps = new Set(transcription.filler_words.map((f) => f.timestamp_ms))
    const longPauseStarts = new Set(
      transcription.pauses.filter((p) => p.duration_ms > 1500).map((p) => p.start_ms)
    )

    const segments: AnnotatedSegment[] = []

    for (const word of transcription.words) {
      const isFiller = fillerTimestamps.has(word.start_ms)
      const isAfterLongPause = longPauseStarts.has(word.end_ms)

      if (isAfterLongPause) {
        segments.push({ text: '[pause] ', type: 'long_pause', timestamp_ms: word.end_ms })
      }

      segments.push({
        text: word.word + ' ',
        type: isFiller ? 'filler' : 'normal',
        timestamp_ms: word.start_ms,
      })
    }

    return segments
  }
}
