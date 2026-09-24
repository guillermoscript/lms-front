import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Mark an exercise completed for a student. Server-only: `exercise_completions`
 * is write-protected from clients (#843), so `adminClient` must be the
 * service-role client, and the caller must already have graded the attempt.
 *
 * One row per (exercise_id, user_id): a repeat pass is a no-op, so the
 * AFTER INSERT XP trigger fires once. The table has NO tenant_id column —
 * sending one 400s the insert.
 *
 * Returns whether this call created the completion.
 */
export async function recordExerciseCompletion(
  adminClient: SupabaseClient,
  { exerciseId, userId, score }: { exerciseId: number; userId: string; score: number }
): Promise<{ created: boolean; error: string | null }> {
  const { data, error } = await adminClient
    .from('exercise_completions')
    .upsert(
      { exercise_id: exerciseId, user_id: userId, completed_by: userId, score },
      { onConflict: 'exercise_id,user_id', ignoreDuplicates: true }
    )
    .select('id')
  if (error) return { created: false, error: error.message }
  return { created: (data ?? []).length > 0, error: null }
}
