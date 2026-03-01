import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { IconPlus, IconEdit, IconBrandOpenai, IconBooks, IconClock, IconBrain, IconCode, IconMessageCircle, IconFileText, IconArrowRight } from '@tabler/icons-react'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { Badge } from '@/components/ui/badge'

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
      case 'coding_challenge': return <IconCode className="w-6 h-6 text-blue-500" />
      case 'quiz': return <IconBrain className="w-6 h-6 text-purple-500" />
      case 'discussion': return <IconMessageCircle className="w-6 h-6 text-green-500" />
      case 'essay':
      default: return <IconFileText className="w-6 h-6 text-orange-500" />
    }
  }

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'easy': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
      case 'hard': return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
      case 'medium':
      default: return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-12 px-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 mb-3">
            {t('practice.title')}
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl leading-relaxed">
            Design and manage practice exercises for your students. Leverage AI to create engaging challenges seamlessly integrated into your curriculum.
          </p>
        </div>
        <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`}>
          <Button size="lg" className="rounded-full font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 px-6">
            <IconPlus className="h-5 w-5 mr-2" />
            {t('practice.addExercise')}
          </Button>
        </Link>
      </div>

      {exercises && exercises.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center border-2 border-dashed border-border/60 rounded-[2.5rem] bg-muted/20">
          <div className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center mb-6 ring-8 ring-primary/5">
            <IconBrandOpenai className="h-10 w-10 text-primary opacity-80" />
          </div>
          <h3 className="text-2xl font-bold tracking-tight mb-3">{t('practice.noExercises')}</h3>
          <p className="text-muted-foreground max-w-md mb-8 text-lg">
            Create your first exercise to help students practice and master the course material. Start with an AI template or build from scratch.
          </p>
          <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`}>
            <Button variant="outline" size="lg" className="rounded-full shadow-sm">
              Get Started <IconArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {exercises?.map((exercise) => (
            <div
              key={exercise.id}
              className="group relative flex flex-col md:flex-row gap-6 p-6 md:p-8 rounded-[2rem] border border-border/40 bg-card hover:bg-accent/5 transition-all duration-300 hover:shadow-lg hover:border-primary/20"
            >
              <div className="flex bg-background border border-border/50 shadow-sm rounded-2xl h-16 w-16 items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                {getExerciseIcon(exercise.exercise_type)}
              </div>

              <div className="flex-1 flex flex-col justify-center">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight mb-2 group-hover:text-primary transition-colors">
                      {exercise.title}
                    </h3>
                    <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed max-w-2xl mb-5">
                      {exercise.description || 'No description provided for this exercise.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className="rounded-full px-3 py-1 font-medium bg-background border-border/50 text-xs">
                    <span className="capitalize">{exercise.exercise_type.replace('_', ' ')}</span>
                  </Badge>
                  <Badge variant="outline" className={`rounded-full px-3 py-1 font-medium border text-xs ${getDifficultyColor(exercise.difficulty_level)}`}>
                    <span className="capitalize">{exercise.difficulty_level}</span>
                  </Badge>
                  {exercise.lesson && (
                    <div className="flex items-center text-xs font-medium text-muted-foreground ml-2">
                      <IconBooks className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                      {exercise.lesson.title}
                    </div>
                  )}
                  {exercise.time_limit && (
                    <div className="flex items-center text-xs font-medium text-muted-foreground ml-2">
                      <IconClock className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                      {exercise.time_limit}m
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center md:items-start justify-end shrink-0 md:opacity-0 md:-translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                <Link href={`/dashboard/teacher/courses/${courseId}/exercises/${exercise.id}`}>
                  <Button variant="secondary" className="rounded-full hover:bg-primary hover:text-primary-foreground transition-all duration-300 shadow-sm px-6 h-10">
                    <IconEdit className="w-4 h-4 mr-2" />
                    {t('practice.edit')}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
