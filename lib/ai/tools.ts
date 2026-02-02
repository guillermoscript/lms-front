import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';

export const createAITools = (supabase: SupabaseClient, context: { exerciseId?: string; lessonId?: string; userId: string; courseId?: string }) => ({
    markExerciseCompleted: tool({
        description: 'Mark the exercise as completed when the student succeeds.',
        inputSchema: z.object({
            feedback: z.string().describe('Positive feedback for the student.'),
            score: z.number().min(0).max(100).describe('Score for the exercise.'),
        }),
        execute: async ({ feedback, score }) => {
            if (!context.exerciseId) throw new Error('Exercise ID is required');

            await supabase.from('exercise_completions').insert({
                exercise_id: context.exerciseId,
                user_id: context.userId,
                completed_by: context.userId,
                score: score
            });

            return { success: true, feedback };
        },
    }),

    markLessonCompleted: tool({
        description: 'Mark the lesson as completed when the student successfully finishes the task or demonstrates understanding.',
        inputSchema: z.object({
            feedback: z.string().describe('Brief positive feedback about the completion.'),
        }),
        execute: async ({ feedback }) => {
            if (!context.lessonId) throw new Error('Lesson ID is required');

            const { data: existing } = await supabase
                .from('lesson_completions')
                .select('*')
                .eq('user_id', context.userId)
                .eq('lesson_id', context.lessonId)
                .single();

            if (!existing) {
                await supabase.from('lesson_completions').insert({
                    user_id: context.userId,
                    lesson_id: context.lessonId,
                    course_id: context.courseId,
                });
            }

            return { success: true, message: 'Lesson marked as completed!', feedback };
        },
    }),
});
