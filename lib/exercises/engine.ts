export type EngineType = 'text' | 'code' | 'audio' | 'video' | 'simulation'

const ENGINE_MAP: Record<string, EngineType> = {
  essay: 'text',
  discussion: 'text',
  quiz: 'text',
  multiple_choice: 'text',
  true_false: 'text',
  fill_in_the_blank: 'text',
  coding_challenge: 'code',
  audio_evaluation: 'audio',
  video_evaluation: 'video',
  real_time_conversation: 'simulation',
  artifact: 'simulation',
}

export function getEngineType(exerciseType: string): EngineType {
  return ENGINE_MAP[exerciseType] ?? 'text'
}
