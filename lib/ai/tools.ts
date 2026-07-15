import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { getEngineType } from '@/lib/exercises/engine';

export const createExerciseTools = (
    supabase: SupabaseClient,
    context: { exerciseId?: string; userId: string; tenantId: string; exerciseType?: string }
) => ({
    markExerciseCompleted: tool({
        description: 'Mark the exercise as completed when the student succeeds.',
        inputSchema: z.object({
            feedback: z.string().describe('Positive feedback for the student.'),
            score: z.number().min(0).max(100).describe('Score for the exercise.'),
        }),
        execute: async ({ feedback, score }) => {
            if (!context.exerciseId) throw new Error('Exercise ID is required');

            // exercise_completions has NO tenant_id column — sending it 400s the insert.
            // There is no unique constraint, so a duplicate (23505) is treated as success.
            const { error: completionError } = await supabase.from('exercise_completions').insert({
                exercise_id: context.exerciseId,
                user_id: context.userId,
                completed_by: context.userId,
                score: score,
            });

            if (completionError && completionError.code !== '23505') {
                console.error('Failed to insert exercise completion:', completionError);
                return { success: false, error: 'Failed to mark exercise as completed.' };
            }

            // Insert unified evaluation for text-based exercises
            const engineType = getEngineType(context.exerciseType ?? 'essay');
            if (engineType === 'text' || engineType === 'simulation') {
                const { error: evaluationError } = await supabase.from('exercise_evaluations').insert({
                    exercise_id: context.exerciseId,
                    user_id: context.userId,
                    tenant_id: context.tenantId,
                    engine_type: engineType,
                    score,
                    passed: true,
                    ai_result: { feedback },
                });

                if (evaluationError) {
                    console.error('Failed to insert exercise evaluation:', evaluationError);
                    return { success: false, error: 'Failed to record exercise evaluation.' };
                }
            }

            return { success: true, feedback };
        },
    }),
});

export const createLessonTools = (
    supabase: SupabaseClient,
    context: { lessonId?: string; userId: string }
) => ({
    markLessonCompleted: tool({
        description: 'Mark the lesson as completed when the student successfully finishes the task or demonstrates understanding.',
        inputSchema: z.object({
            feedback: z.string().describe('Brief positive feedback about the completion.'),
        }),
        execute: async ({ feedback }) => {
            if (!context.lessonId) throw new Error('Lesson ID is required');

            // Required checkpoints must be completed before the lesson can be marked done.
            const { data: requiredCheckpoints } = await supabase
                .from('lesson_checkpoints')
                .select('id, label')
                .eq('lesson_id', context.lessonId)
                .eq('is_required', true)
                .eq('is_enabled', true);

            if (requiredCheckpoints && requiredCheckpoints.length > 0) {
                const { data: completedAttempts } = await supabase
                    .from('lesson_checkpoint_attempts')
                    .select('checkpoint_id')
                    .eq('user_id', context.userId)
                    .eq('lesson_id', context.lessonId)
                    .eq('completed', true);

                const completedIds = new Set((completedAttempts ?? []).map((a) => a.checkpoint_id));
                const missing = requiredCheckpoints.filter((c) => !completedIds.has(c.id));

                if (missing.length > 0) {
                    return {
                        success: false,
                        error: `The student must complete ${missing.length} required checkpoint(s) in this lesson before it can be marked complete.`,
                        missingCheckpointIds: missing.map((c) => c.id),
                    };
                }
            }

            const { data: existing } = await supabase
                .from('lesson_completions')
                .select('id')
                .eq('user_id', context.userId)
                .eq('lesson_id', context.lessonId)
                .maybeSingle();

            if (!existing) {
                // lesson_completions has NO tenant_id column — sending it fails the insert.
                // There is no unique constraint, so a duplicate (23505) is treated as success.
                const { error: insertError } = await supabase.from('lesson_completions').insert({
                    user_id: context.userId,
                    lesson_id: context.lessonId,
                });

                if (insertError && insertError.code !== '23505') {
                    console.error('Failed to insert lesson completion:', insertError);
                    return { success: false, error: 'Failed to mark lesson as completed.' };
                }
            }

            return { success: true, message: 'Lesson marked as completed!', feedback };
        },
    }),
});
