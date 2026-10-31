/**
 * Which exercise types can be a reto. No server imports: client components
 * (toggle, player) and the server pipeline share this one list.
 *
 * - `essay` / `discussion`: free text, playable by guests and members.
 * - `real_time_conversation`: a live voice call, MEMBERS ONLY. Every minted
 *   realtime session is billed by the minute to the school's BYOK key, while
 *   the guest caps only count graded attempts, so a guest could mint sessions
 *   without ever being counted. Guests see a "sign up to play" state.
 */
export const VOICE_CHALLENGE_TYPE = 'real_time_conversation'

export const CHALLENGEABLE_TYPES: readonly string[] = ['essay', 'discussion', VOICE_CHALLENGE_TYPE]

export function isChallengeableType(exerciseType: string | null | undefined): boolean {
  return typeof exerciseType === 'string' && CHALLENGEABLE_TYPES.includes(exerciseType)
}

export function isVoiceChallengeType(exerciseType: string | null | undefined): boolean {
  return exerciseType === VOICE_CHALLENGE_TYPE
}
