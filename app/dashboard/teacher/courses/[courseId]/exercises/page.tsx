import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IconPlus } from '@tabler/icons-react'

export default async function ExercisesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return notFound()

  const { courseId } = await params

  // Verify course ownership
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', courseId)
    .eq('author_id', user.id)
    .single()

  if (!course) return notFound()

  // Fetch exercises
  const { data: exercises } = await supabase
    .from('exercises')
    .select('*, lesson:lessons(title)')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Exercises</h1>
        <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`}>
          <Button>
            <IconPlus className="h-4 w-4 mr-2" />
            Create Exercise
          </Button>
        </Link>
      </div>

      {exercises && exercises.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>No exercises yet. Create your first exercise to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {exercises?.map((exercise) => (
            <Card key={exercise.id}>
              <CardHeader>
                <CardTitle>{exercise.title}</CardTitle>
                {exercise.lesson && (
                  <p className="text-sm text-muted-foreground">Lesson: {exercise.lesson.title}</p>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-4">{exercise.description}</p>
                <div className="flex gap-2 items-center">
                  <span className="text-xs bg-muted px-2 py-1 rounded">{exercise.exercise_type}</span>
                  <span className="text-xs bg-muted px-2 py-1 rounded">{exercise.difficulty_level}</span>
                  <Link href={`/dashboard/teacher/courses/${courseId}/exercises/${exercise.id}`} className="ml-auto">
                    <Button variant="outline" size="sm">Edit</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
