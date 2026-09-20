import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconCheck, IconChevronRight } from '@tabler/icons-react'

interface RelatedExercise {
  id: number
  title: string
  exercise_type: string
  difficulty_level?: string | null
  time_limit?: number | null
  exercise_completions?: unknown[] | null
}

const TYPE_KEYS = new Set([
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
])

/**
 * The way out of an exercise, as a list. It used to be the browse page's full
 * cards stacked in the rail — icon tile, badge, description, footer — which
 * made a secondary exit the heaviest thing beside the instructions.
 */
export default async function RelatedExercises({
  exercises,
  courseId,
}: {
  exercises: RelatedExercise[]
  courseId: string
}) {
  const t = await getTranslations('exercises.audio')
  const tTypes = await getTranslations('exercises.types')

  if (exercises.length === 0) return null

  return (
    <nav aria-label={t('moreExercises')} className="border-t pt-5">
      <h2 className="mb-1 text-sm font-semibold">{t('moreExercises')}</h2>
      <ul className="divide-y">
        {exercises.map((ex) => {
          const done = (ex.exercise_completions?.length ?? 0) > 0
          const level =
            ex.difficulty_level === 'hard'
              ? t('advanced')
              : ex.difficulty_level === 'medium'
                ? t('intermediate')
                : ex.difficulty_level === 'easy'
                  ? t('beginner')
                  : null
          const meta = [
            TYPE_KEYS.has(ex.exercise_type) ? tTypes(ex.exercise_type) : null,
            level,
            ex.time_limit ? `${ex.time_limit} min` : null,
          ].filter(Boolean)

          return (
            <li key={ex.id}>
              <Link
                href={`/dashboard/student/courses/${courseId}/exercises/${ex.id}`}
                className="group -mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 py-3 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{ex.title}</span>
                  <span className="block text-sm text-muted-foreground">{meta.join(' · ')}</span>
                </span>
                {done ? (
                  <span className="flex shrink-0 items-center gap-1 text-sm text-success">
                    <IconCheck size={14} aria-hidden="true" />
                    {t('completed')}
                  </span>
                ) : (
                  <IconChevronRight
                    size={16}
                    className="shrink-0 text-muted-foreground group-hover:text-foreground"
                    aria-hidden="true"
                  />
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
