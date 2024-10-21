import { generateId } from 'ai'
import { Clock, Edit, MessageSquare, Users } from 'lucide-react'
import Link from 'next/link'

import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import ExerciseChat from '@/components/dashboards/student/course/exercises/exerciseChat'
import DeleteExerciseAlert from '@/components/dashboards/teacher/exercises/DeleteExerciseAlert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { URL_OF_SITE } from '@/utils/const'
import { createClient } from '@/utils/supabase/server'

export default async function ExercisePageTeacher({
    params
}: {
    params: { courseId: string; exerciseId: string }
}) {
    const supabase = createClient()
    const t = await getI18n()
    const user = await supabase.auth.getUser()

    const { data: exercise, error } = await supabase
        .from('exercises')
        .select(`
            *,
            courses(*),
            exercise_completions(*),
            exercise_messages(id,message,role)
        `)
        .eq('id', params.exerciseId)
        .eq('exercise_messages.user_id', user.data.user.id)
        .order('created_at', { referencedTable: 'exercise_messages', ascending: false })
        .single()

    const usersData = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .in('id', exercise?.exercise_completions.map((completion) => completion.user_id))

    if (error) {
        console.error('Error fetching exercise:', error)
        return <div>{t('errorLoadingExercise')}</div>
    }

    const getDifficultyColor = (level: string) => {
        switch (level) {
            case 'easy': return 'bg-green-100 text-green-800'
            case 'medium': return 'bg-yellow-100 text-yellow-800'
            case 'hard': return 'bg-red-100 text-red-800'
            default: return 'bg-gray-100 text-gray-800'
        }
    }

    const averageScore = exercise?.exercise_completions.length > 0
        ? (exercise?.exercise_completions.reduce((acc, curr) => acc + (curr.score || 0), 0) / exercise?.exercise_completions.length).toFixed(2)
        : 'N/A'

    const initialMessages = [
        {
            id: generateId().toString(),
            role: 'system' as const,
            content: exercise.system_prompt
        },
        ...exercise.exercise_messages.map((message) => ({
            id: message.id.toString(),
            role: message.role as 'system' | 'user' | 'assistant' | 'data' | 'tool',
            content: message.message
        }))
    ]

    const profile = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.data.user.id)
        .single()

    return (
        <div className="container mx-auto">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/teacher', label: t('BreadcrumbComponent.teacher') },
                    { href: '/dashboard/teacher/courses', label: t('BreadcrumbComponent.course') },
                    { href: `/dashboard/teacher/courses/${params.courseId}`, label: exercise?.courses.title },
                    { href: `/dashboard/teacher/courses/${params.courseId}/exercises`, label: t('BreadcrumbComponent.exercise') },
                    { href: `/dashboard/teacher/courses/${params.courseId}/exercises/${params.exerciseId}`, label: exercise?.title }
                ]}
            />

            <div className="flex justify-between items-center mt-8 mb-6">
                <h1 className="text-3xl font-bold">{exercise.title || 'Exercise'}</h1>
                <div className="space-x-2">
                    <Link
                        className={buttonVariants({ variant: 'outline' })}
                        href={`/dashboard/teacher/courses/${params.courseId}/exercises/${params.exerciseId}/edit`}
                    >
                        <Edit className="w-4 h-4 mr-2" />
                        {t('dashboard.teacher.ExercisePageTeacher.editExercise')}
                    </Link>
                    <Button variant="destructive">
                        <DeleteExerciseAlert exerciseId={params.exerciseId} />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>{t('dashboard.teacher.ExercisePageTeacher.exerciseDetails')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className=" mb-4">{exercise.instructions}</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                            <Badge variant="secondary">{exercise.exercise_type}</Badge>
                            <Badge className={getDifficultyColor(exercise.difficulty_level)}>
                                {exercise.difficulty_level}
                            </Badge>
                            {exercise.time_limit && (
                                <Badge variant="outline">
                                    <Clock className="w-4 h-4 mr-1" />
                                    {exercise.time_limit} {t('dashboard.teacher.ExercisePageTeacher.minutes')}
                                </Badge>
                            )}
                        </div>
                        <div className="mt-4">
                            <h3 className="font-semibold mb-2">{t('dashboard.teacher.ExercisePageTeacher.systemPrompt')}</h3>
                            <ViewMarkdown
                                markdown={exercise.system_prompt || ''}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('dashboard.teacher.ExercisePageTeacher.performanceMetrics')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center">
                                <Users className="w-5 h-5 mr-2 text-blue-500" />
                                <span>{t('dashboard.teacher.ExercisePageTeacher.completions')}: {exercise?.exercise_completions.length}</span>
                            </div>
                            <div className="flex items-center">
                                <span>{t('dashboard.teacher.ExercisePageTeacher.averageScore')}: {averageScore}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="chat" className="mt-8">
                <TabsList>
                    <TabsTrigger value="chat">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        {t('dashboard.teacher.ExercisePageTeacher.exerciseChat')}
                    </TabsTrigger>
                    <TabsTrigger value="completions">
                        <Users className="w-4 h-4 mr-2" />
                        {t('dashboard.teacher.ExercisePageTeacher.studentCompletions')}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="chat" className="mt-4">
                    <ExerciseChat
                        exerciseId={params.exerciseId}
                        apiEndpoint={`${URL_OF_SITE}/api/chat/exercises/`}
                        initialMessages={initialMessages || []}
                        isExerciseCompleted={false}
                        profile={profile.data}
                    />
                </TabsContent>
                <TabsContent value="completions" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('dashboard.teacher.ExercisePageTeacher.studentCompletions')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[400px]">
                                {usersData?.data.map((user, index) => (
                                    <div key={index} className="flex items-center justify-between py-4 border-b last:border-b-0">
                                        <div className="flex items-center">
                                            <Avatar className="w-10 h-10 mr-3">
                                                <AvatarImage src={user.avatar_url} />
                                                <AvatarFallback>{user.full_name[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-semibold">{user.full_name}</p>
                                                <p className="text-sm text-gray-500">
                                                    {t('dashboard.teacher.ExercisePageTeacher.completed')}: {new Date(exercise.exercise_completions[index].completed_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
