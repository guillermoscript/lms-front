import {
    IconCode,
    IconFileText,
    IconMessageCircle,
    IconBrain,
    IconCircleCheck,
    IconTextSize,
    IconMicrophone,
    IconVideo,
    IconSparkles,
    type Icon,
} from '@tabler/icons-react'

/**
 * One table for what an exercise type looks like and what it is called, shared
 * by the student's browse grid and the teacher's management list. Both screens
 * used to keep their own half-complete map — the student card labelled types in
 * hardcoded English, the teacher row printed the raw column through
 * `replace('_', ' ')`, which only swaps the FIRST underscore
 * ("real time_conversation").
 *
 * The order is the order the filter chips appear in.
 */
export const EXERCISE_TYPE_ORDER = [
    'coding_challenge',
    'essay',
    'discussion',
    'quiz',
    'multiple_choice',
    'fill_in_the_blank',
    'audio_evaluation',
    'video_evaluation',
    'real_time_conversation',
    'artifact',
] as const

export type ExerciseTypeKey = (typeof EXERCISE_TYPE_ORDER)[number]

export const FALLBACK_EXERCISE_ICON: Icon = IconFileText

/**
 * Indexed, never called through a helper: a `const Icon = fn(type)` inside a
 * component trips `react-hooks/static-components`.
 */
export const EXERCISE_TYPE_ICONS: Record<string, Icon> = {
    coding_challenge: IconCode,
    essay: IconFileText,
    discussion: IconMessageCircle,
    quiz: IconBrain,
    multiple_choice: IconCircleCheck,
    fill_in_the_blank: IconTextSize,
    audio_evaluation: IconMicrophone,
    video_evaluation: IconVideo,
    real_time_conversation: IconMessageCircle,
    artifact: IconSparkles,
}

export function isKnownExerciseType(type: string): type is ExerciseTypeKey {
    return (EXERCISE_TYPE_ORDER as readonly string[]).includes(type)
}

/** Types present in a set of exercises, with how many of each, in table order. */
export function exerciseTypeCounts(
    exercises: { exercise_type: string }[]
): { type: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const exercise of exercises) {
        counts.set(exercise.exercise_type, (counts.get(exercise.exercise_type) ?? 0) + 1)
    }
    return [...counts.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => {
            const order = (type: string) => {
                const index = (EXERCISE_TYPE_ORDER as readonly string[]).indexOf(type)
                return index === -1 ? EXERCISE_TYPE_ORDER.length : index
            }
            return order(a.type) - order(b.type) || a.type.localeCompare(b.type)
        })
}
