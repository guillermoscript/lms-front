import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconPlus,
  IconEdit,
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
      case 'coding_challenge': return <IconCode className="h-5 w-5 text-primary" />
      case 'quiz': return <IconBrain className="h-5 w-5 text-primary" />
      case 'discussion': return <IconMessageCircle className="h-5 w-5 text-primary" />
      case 'essay':
      default: return <IconFileText className="h-5 w-5 text-primary" />
    }
  }

  return (
    <div className="mx-auto container px-4 py-8 sm:px-6 lg:px-8">
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
          <Button size="sm">
            <IconPlus className="mr-2 h-4 w-4" />
            {t('practice.addExercise')}
          </Button>
        </Link>
      </div>

      {exercises && exercises.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <IconTarget className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="font-medium mb-1">{t('practice.noExercises')}</p>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              {t('practice.emptyStateDescription')}
            </p>
            <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`}>
              <Button variant="outline" size="sm">
                {t('practice.getStarted')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {exercises?.map((exercise, idx) => (
            <motion.div
              key={exercise.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.25 }}
            >
              <Card className="group hover:border-primary/50 transition-colors">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                      {getExerciseIcon(exercise.exercise_type)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium group-hover:text-primary transition-colors truncate">
                        {exercise.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] h-4 capitalize">
                          {exercise.exercise_type.replace('_', ' ')}
                        </Badge>
                        <Badge
                          variant={
                            exercise.difficulty_level === 'hard' ? 'destructive' :
                              exercise.difficulty_level === 'medium' ? 'default' : 'secondary'
                          }
                          className="text-[10px] h-4 capitalize"
                        >
                          {t(`difficulty.${exercise.difficulty_level}`)}
                        </Badge>
                        <Badge variant={exercise.status === 'published' ? 'outline' : 'secondary'} className="text-[10px] h-4">
                          {t(`status.${exercise.status}`)}
                        </Badge>
                        {exercise.lesson && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <IconBooks className="h-3 w-3" />
                            <span className="truncate max-w-[120px]">{exercise.lesson.title}</span>
                          </span>
                        )}
                        {exercise.time_limit && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <IconClock className="h-3 w-3" />
                            {exercise.time_limit}m
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <Link href={`/dashboard/teacher/courses/${courseId}/exercises/${exercise.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('practice.edit')}>
                        <IconEdit size={16} />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
