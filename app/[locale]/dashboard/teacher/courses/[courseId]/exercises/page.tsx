import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconPlus,
  IconArrowLeft,
  IconChevronRight,
  IconCode,
  IconBrain,
  IconMessageCircle,
  IconFileText,
  IconBooks,
  IconClock,
  IconTarget,
} from '@tabler/icons-react'
import * as motion from 'motion/react-client'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

export default async function ExercisesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
  const tenantId = await getCurrentTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return notFound()

  const { courseId } = await params

  // Verify course ownership
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', courseId)
    .eq('author_id', user.id)
    .eq('tenant_id', tenantId)
    .single()

  if (!course) return notFound()

  // Fetch exercises
  const { data: exercises } = await supabase
    .from('exercises')
    .select('*, lesson:lessons(title)')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  const getExerciseIcon = (type: string) => {
    switch (type) {
      case 'coding_challenge': return <IconCode className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
      case 'quiz': return <IconBrain className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
      case 'discussion': return <IconMessageCircle className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
      case 'essay':
      default: return <IconFileText className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
    }
  }

  return (
    <div className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2">
        <Link href={`/dashboard/teacher/courses/${courseId}`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('backToCourses')}>
            <IconArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="truncate max-w-[200px]">{course.title}</span>
          <IconChevronRight className="h-3 w-3 shrink-0" />
          <span className="font-medium text-foreground">{t('practice.title')}</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('practice.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('practice.description')}</p>
        </div>
        <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`}>
          <Button size="sm" className="gap-2">
            <IconPlus className="h-3.5 w-3.5" />
            {t('practice.addExercise')}
          </Button>
        </Link>
      </div>

      {exercises && exercises.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <IconTarget size={28} className="text-muted-foreground/40" />
            </div>
            <h3 className="text-xl font-bold mb-1.5">{t('practice.noExercises')}</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              {t('practice.emptyStateDescription')}
            </p>
            <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`}>
              <Button className="gap-2">
                <IconPlus className="h-4 w-4" />
                {t('practice.getStarted')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {exercises?.map((exercise, idx) => (
            <motion.div
              key={exercise.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.25 }}
            >
              <Link href={`/dashboard/teacher/courses/${courseId}/exercises/${exercise.id}`} className="block">
                <Card className="group transition-all duration-200 hover:shadow-md hover:border-emerald-500/50 cursor-pointer">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 shrink-0">
                        {getExerciseIcon(exercise.exercise_type)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium group-hover:text-primary transition-colors truncate">
                          {exercise.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground capitalize">
                            {exercise.exercise_type.replace('_', ' ')}
                          </span>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {t(`difficulty.${exercise.difficulty_level}`)}
                          </span>
                          {exercise.status !== 'published' && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <Badge variant="secondary" className="text-[10px] h-4">
                                {t(`status.${exercise.status}`)}
                              </Badge>
                            </>
                          )}
                          {exercise.lesson && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <IconBooks className="h-3 w-3" />
                                <span className="truncate max-w-[120px]">{exercise.lesson.title}</span>
                              </span>
                            </>
                          )}
                          {exercise.time_limit && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <IconClock className="h-3 w-3" />
                                {exercise.time_limit}m
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <IconChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0 ml-4" />
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
