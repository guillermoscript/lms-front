'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconBarbell } from '@tabler/icons-react'
import ExerciseCard from '@/components/exercises/exercise-card'
import ExerciseTypeFilter, { ALL_TYPES } from '@/components/exercises/exercise-type-filter'
import { exerciseTypeCounts } from '@/components/exercises/exercise-type-meta'

interface BrowseExercise {
    id: number
    title: string
    description?: string | null
    exercise_type: string
    difficulty_level?: string | null
    time_limit?: number | null
    exercise_completions?: unknown[] | null
}

/**
 * The course's practice, browsable by kind. A course with a dozen activities
 * used to be one undifferentiated grid you scrolled: the chips let a student
 * ask for the speaking practice, or the code, and get only that.
 */
export default function ExerciseBrowseList({
    exercises,
    courseId,
}: {
    exercises: BrowseExercise[]
    courseId: string
}) {
    const t = useTranslations('exercises.filter')
    const [type, setType] = useState<string>(ALL_TYPES)

    const types = useMemo(() => exerciseTypeCounts(exercises), [exercises])
    const visible = type === ALL_TYPES ? exercises : exercises.filter((e) => e.exercise_type === type)

    return (
        <div className="space-y-5 sm:space-y-6">
            <ExerciseTypeFilter
                types={types}
                total={exercises.length}
                value={type}
                onChange={setType}
            />

            {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/20 py-16">
                    <IconBarbell className="mb-4 h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
                    <p className="text-muted-foreground">{t('emptyForType')}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {visible.map((exercise) => (
                        <ExerciseCard key={exercise.id} exercise={exercise} courseId={courseId} />
                    ))}
                </div>
            )}
        </div>
    )
}
