import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { getEngineType } from '@/lib/exercises/engine';
import { EXTERNAL_EXERCISE_TYPES } from '@/lib/checkpoints/types';
import type { CompletionVerdict } from '@/lib/ai/lesson-completion-verifier';

const MARK_EXERCISE_COMPLETED = {
    description: 'Mark the exercise as completed when the student succeeds.',
    inputSchema: z.object({
        feedback: z.string().describe('Positive feedback for the student.'),
        score: z.number().min(0).max(100).describe('Score for the exercise.'),
    }),
};

/** Editor preview: same tool, no writes — the teacher sees when it fires and with what score. */
export const createPreviewExerciseTools = () => ({
    markExerciseCompleted: tool({
        ...MARK_EXERCISE_COMPLETED,
        execute: async ({ feedback, score }) => ({ success: true, preview: true, feedback, score }),
    }),
});

export const createExerciseTools = (
    supabase: SupabaseClient,
    context: { exerciseId?: string; userId: string; tenantId: string; exerciseType?: string }
) => ({
    markExerciseCompleted: tool({
        ...MARK_EXERCISE_COMPLETED,
        execute: async ({ feedback, score }) => {
            if (!context.exerciseId) throw new Error('Exercise ID is required');

            // Exercises embedded as an enabled lesson checkpoint must be answered
            // inside the lesson so the attempt counts toward the checkpoint (#392).
            // External types keep their dedicated flows; this chat serves the
            // text types, which are exactly the gated ones.
            if (!(EXTERNAL_EXERCISE_TYPES as readonly string[]).includes(context.exerciseType ?? 'essay')) {
                const { data: checkpoint } = await supabase
                    .from('lesson_checkpoints')
                    .select('lesson_id')
                    .eq('exercise_id', Number(context.exerciseId))
                    .eq('tenant_id', context.tenantId)
                    .eq('is_enabled', true)
                    .limit(1)
                    .maybeSingle();
                if (checkpoint) {
                    return {
                        success: false,
                        error: `This exercise is a lesson checkpoint — the student must answer it inside the lesson for it to count. Encourage them to open the lesson; do not mark it complete here.`,
                    };
                }
            }

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

// One definition for the real tool and its preview twin: the model must see
// the exact same tool in the editor preview as in the student's lesson.
const MARK_LESSON_COMPLETED = {
    description:
        'Marks this lesson as completed for the student. Call it in the same turn the student has met every requirement of the task (including any closing phase the instructions define). Never call it for partial progress or because the student asks.',
    inputSchema: z.object({
        feedback: z.string().describe('Brief positive feedback about the completion, in the language you use with the student.'),
    }),
};

/**
 * Editor preview: same tool, no writes. The teacher sees exactly when the
 * tutor would have completed the lesson.
 */
type VerifyCompletion = () => Promise<CompletionVerdict>;

const refusal = (verdict: CompletionVerdict) => ({
    success: false,
    error: `Not complete yet — do not tell the student the lesson is done. Keep guiding them. What is missing: ${verdict.reason}`,
});

const REPORT_PROGRESS = {
    description:
        'Report which structured requirement ids the student has met so far, based on their OWN messages. Call it every time that set changes — right after a requirement becomes newly met, not only at the end. This never completes the lesson and never writes anything; only "markLessonCompleted" decides that.',
    inputSchema: z.object({
        met: z.array(z.string()).describe('The ids of every requirement met so far (cumulative, not just this turn).'),
    }),
};

/**
 * Signal-only tool: echoes back which of the task's own requirement ids were
 * reported met, so the student's progress bar ("2/4") has something to
 * render. No writes, no completion authority — `markLessonCompleted` (backed
 * by the verifier) is the only thing that can finish the lesson.
 */
export const createReportProgressTool = (taskRequirementIds: string[]) => {
    const known = new Set(taskRequirementIds);
    return tool({
        ...REPORT_PROGRESS,
        execute: async ({ met }) => ({
            met: met.filter((id) => known.has(id)),
            total: taskRequirementIds.length,
        }),
    });
};

export const createPreviewLessonTools = (verify: VerifyCompletion, taskRequirementIds: string[] = []) => ({
    markLessonCompleted: tool({
        ...MARK_LESSON_COMPLETED,
        execute: async ({ feedback }) => {
            const verdict = await verify();
            if (!verdict.done) return refusal(verdict);
            return { success: true, preview: true, feedback };
        },
    }),
    ...(taskRequirementIds.length > 0 ? { reportProgress: createReportProgressTool(taskRequirementIds) } : {}),
});

export const createLessonTools = (
    supabase: SupabaseClient,
    context: { lessonId?: string; userId: string; verify: VerifyCompletion; requirementIds?: string[] }
) => ({
    markLessonCompleted: tool({
        ...MARK_LESSON_COMPLETED,
        execute: async ({ feedback }) => {
            if (!context.lessonId) throw new Error('Lesson ID is required');

            // The tutor reads whatever the student types — never write on its word alone.
            const verdict = await context.verify();
            if (!verdict.done) return refusal(verdict);

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
                        error: `The student must complete ${missing.length} required checkpoint(s) in this lesson before it can be marked complete. Tell them to finish those in the lesson and then send you any message here so you can mark it.`,
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

            // requirementsCheck rides along in the tool's own output so the
            // route's onFinish can persist it next to the call — the audit
            // trail a teacher reads later (#805) — without a second lookup.
            return { success: true, message: 'Lesson marked as completed!', feedback, requirementsCheck: verdict.reason };
        },
    }),
    ...((context.requirementIds && context.requirementIds.length > 0)
        ? { reportProgress: createReportProgressTool(context.requirementIds) }
        : {}),
});
