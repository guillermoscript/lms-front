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
  /** Learner rubric only. */
  corrections?: import('./learner-rubric').SpeechCorrection[]
  annotated_transcript: AnnotatedSegment[]
  metrics: SpeechMetrics
}

export interface STTConfig {
  language?: string
  /** Keep the speaker's own wording: no casing/numeral clean-up before grading. */
  verbatim?: boolean
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
  /** How to grade and in what language to answer. Absent = public speaking. */
  speechRubric?: import('./learner-rubric').SpeechRubricConfig
  exerciseId?: number
  userId?: string
  passingScore?: number
}

export interface STTProvider {
  name: string
  /** Raw audio bytes. Fetching a storage URL is the pipeline's job, not the provider's. */
  transcribe(audio: Buffer | Uint8Array | URL, config?: STTConfig): Promise<TranscriptionResult>
}

export interface SpeechCoachOptions {
  /** Aborts the provider calls (route deadline), so a timed-out run stops spending the school's key. */
  abortSignal?: AbortSignal
  supabase?: import('@supabase/supabase-js').SupabaseClient
}

export interface SpeechCoach {
  name: string
  evaluate(transcription: TranscriptionResult, context: ExerciseContext, options?: SpeechCoachOptions): Promise<SpeechEvaluation>
}
