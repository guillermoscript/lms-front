'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
    EXERCISE_TYPE_ICONS,
    FALLBACK_EXERCISE_ICON,
    isKnownExerciseType,
} from '@/components/exercises/exercise-type-meta'

export const ALL_TYPES = 'all'

/**
 * The types in a list, as chips you can switch between, so a long course is
 * read by kind instead of scrolled end to end. One chip per type actually
 * present — a course with only essays gets no chrome it cannot use.
 */
export default function ExerciseTypeFilter({
    types,
    total,
    value,
    onChange,
    className,
}: {
    types: { type: string; count: number }[]
    total: number
    value: string
    onChange: (value: string) => void
    className?: string
}) {
    const t = useTranslations('exercises.filter')
    const tTypes = useTranslations('exercises.types')

    if (types.length < 2) return null

    const chip = (key: string, label: string, count: number, Icon?: (typeof EXERCISE_TYPE_ICONS)[string]) => {
        const active = value === key
        return (
            <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                aria-pressed={active}
                className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    active
                        ? 'border-primary bg-brand-tint font-semibold text-brand-text'
                        : 'border-border bg-muted/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                )}
            >
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                {label}
                <span className="text-xs tabular-nums opacity-80">{count}</span>
            </button>
        )
    }

    return (
        <div className={cn('flex flex-wrap gap-2', className)} role="group" aria-label={t('label')}>
            {chip(ALL_TYPES, t('all'), total)}
            {types.map(({ type, count }) =>
                chip(
                    type,
                    isKnownExerciseType(type) ? tTypes(type) : type,
                    count,
                    EXERCISE_TYPE_ICONS[type] ?? FALLBACK_EXERCISE_ICON
                )
            )}
        </div>
    )
}
