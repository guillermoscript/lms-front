// Future stub: Gemini speech coach
// Implement when Google AI integration is ready

import type { SpeechCoach, TranscriptionResult, ExerciseContext, SpeechEvaluation, SpeechCoachOptions } from '../types'

export class GeminiCoachProvider implements SpeechCoach {
  name = 'gemini'

  async evaluate(_transcription: TranscriptionResult, _context: ExerciseContext, _options?: SpeechCoachOptions): Promise<SpeechEvaluation> {
    throw new Error('GeminiCoachProvider is not yet implemented.')
  }
}
