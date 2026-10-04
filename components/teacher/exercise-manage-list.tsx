'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { motion } from 'motion/react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { IconBooks, IconChecklist, IconChevronRight, IconClock, IconTarget } from '@tabler/icons-react'
import ExerciseTypeFilter, { ALL_TYPES } from '@/components/exercises/exercise-type-filter'
import {
    EXERCISE_TYPE_ICONS,
    FALLBACK_EXERCISE_ICON,
    exerciseTypeCounts,
    isKnownExerciseType,
} from '@/components/exercises/exercise-type-meta'

export interface ManagedExercise {
    id: number
    title: string
    exercise_type: string
    difficulty_level: string | null
    status: string | null
    time_limit: number | null
    lessonTitle: string | null
    checkpointLessons: string[]
}

/**
 * The course's exercises, filtered by kind. The rows moved out of the page so
 * the chips can switch them without a round trip, and the type reads from the
 * shared table instead of `replace('_', ' ')`, which left
 * "real time_conversation" on screen.
 */
export default function ExerciseManageList({
    exercises,
    courseId,
}: {
    exercises: ManagedExercise[]
    courseId: string
}) {
    const t = useTranslations('dashboard.teacher.manageCourse')
    const tTypes = useTranslations('exercises.types')
    const tFilter = useTranslations('exercises.filter')
    const [type, setType] = useState<string>(ALL_TYPES)

    const types = useMemo(() => exerciseTypeCounts(exercises), [exercises])
    const visible = type === ALL_TYPES ? exercises : exercises.filter((e) => e.exercise_type === type)

    return (
        <div className="space-y-4">
            <ExerciseTypeFilter types={types} total={exercises.length} value={type} onChange={setType} />

            {visible.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                        <IconTarget size={24} className="text-muted-foreground/40" aria-hidden="true" />
                        <p className="text-sm text-muted-foreground">{tFilter('emptyForType')}</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-2">
                    {visible.map((exercise, idx) => {
                        const TypeIcon = EXERCISE_TYPE_ICONS[exercise.exercise_type] ?? FALLBACK_EXERCISE_ICON
                        const typeLabel = isKnownExerciseType(exercise.exercise_type)
                            ? tTypes(exercise.exercise_type)
                            : exercise.exercise_type
                        return (
                            <motion.div
                                key={exercise.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(idx, 8) * 0.04, duration: 0.25 }}
                            >
                                <Link
                                    href={`/dashboard/teacher/courses/${courseId}/exercises/${exercise.id}`}
                                    className="block"
                                >
                                    <Card className="group cursor-pointer transition-all duration-200 hover:shadow-md">
                                        <CardContent className="flex items-center justify-between p-4">
                                            <div className="flex items-center gap-4">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
                                                    <TypeIcon className="h-4.5 w-4.5 text-brand-text" aria-hidden="true" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="truncate font-medium transition-colors group-hover:text-brand-text">
                                                        {exercise.title}
                                                    </h3>
                                                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">{typeLabel}</span>
                                                        {exercise.difficulty_level && (
                                                            <>
                                                                <span className="text-muted-foreground/30" aria-hidden="true">·</span>
                                                                <span className="text-xs capitalize text-muted-foreground">
                                                                    {t(`difficulty.${exercise.difficulty_level}`)}
                                                                </span>
                                                            </>
                                                        )}
                                                        {exercise.status && exercise.status !== 'published' && (
                                                            <>
                                                                <span className="text-muted-foreground/30" aria-hidden="true">·</span>
                                                                <Badge variant="secondary" className="h-4 text-[10px]">
                                                                    {t(`status.${exercise.status}`)}
                                                                </Badge>
                                                            </>
                                                        )}
                                                        {exercise.lessonTitle && (
                                                            <>
                                                                <span className="text-muted-foreground/30" aria-hidden="true">·</span>
                                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                                    <IconBooks className="h-3 w-3" aria-hidden="true" />
                                                                    <span className="max-w-[120px] truncate">{exercise.lessonTitle}</span>
                                                                </span>
                                                            </>
                                                        )}
                                                        {exercise.checkpointLessons.length > 0 && (
                                                            <>
                                                                <span className="text-muted-foreground/30" aria-hidden="true">·</span>
                                                                <Badge
                                                                    variant="outline"
                                                                    className="h-4 gap-1 border-primary/20 bg-brand-tint text-[10px] text-brand-text"
                                                                >
                                                                    <IconChecklist className="h-3 w-3" aria-hidden="true" />
                                                                    <span className="max-w-[140px] truncate">
                                                                        {t('practice.checkpointIn', {
                                                                            lesson: exercise.checkpointLessons[0],
                                                                        })}
                                                                    </span>
                                                                    {exercise.checkpointLessons.length > 1 &&
                                                                        ` +${exercise.checkpointLessons.length - 1}`}
                                                                </Badge>
                                                            </>
                                                        )}
                                                        {exercise.time_limit && (
                                                            <>
                                                                <span className="text-muted-foreground/30" aria-hidden="true">·</span>
                                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                                    <IconClock className="h-3 w-3" aria-hidden="true" />
                                                                    {exercise.time_limit}m
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <IconChevronRight className="ml-4 h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-brand-text" />
                                        </CardContent>
                                    </Card>
                                </Link>
                            </motion.div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
