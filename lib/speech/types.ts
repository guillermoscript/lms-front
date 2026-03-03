export interface WordTimestamp {
  word: string
  start_ms: number
  end_ms: number
  confidence: number
}

export interface FillerEvent {
  word: string
  timestamp_ms: number
  count: number
}

export interface PauseEvent {
  start_ms: number
  end_ms: number
  duration_ms: number
  type: 'good' | 'hesitation'
}

export interface TranscriptionResult {
  transcript: string
  words: WordTimestamp[]
  filler_words: FillerEvent[]
  wpm: number
  pauses: PauseEvent[]
  duration_seconds: number
}

export interface SpeechMetrics {
  wpm: number
  filler_count: number
  pause_count: number
  long_pause_count: number
  avg_pause_duration_ms: number
  duration_seconds: number
}

export interface AnnotatedSegment {
  text: string
  type: 'normal' | 'filler' | 'long_pause'
  timestamp_ms?: number
}

export interface SpeechEvaluation {
  score: number
  strengths: string[]
  improvements: string[]
  focus_next: string
  annotated_transcript: AnnotatedSegment[]
  metrics: SpeechMetrics
}

export interface STTConfig {
  language?: string
  [key: string]: unknown
}

export interface ExerciseContext {
  title: string
  instructions: string
  topic_prompt?: string
  rubric?: {
    filler_words?: boolean
    pace?: boolean
    structure?: boolean
    confidence?: boolean
  }
  // Used by AI tools (e.g. markExerciseCompleted)
  exerciseId?: number
  userId?: string
  passingScore?: number
}

export interface STTProvider {
  name: string
  transcribe(audioUrl: string, config?: STTConfig): Promise<TranscriptionResult>
}

export interface SpeechCoachOptions {
  supabase?: import('@supabase/supabase-js').SupabaseClient
}

export interface SpeechCoach {
  name: string
  evaluate(transcription: TranscriptionResult, context: ExerciseContext, options?: SpeechCoachOptions): Promise<SpeechEvaluation>
}
