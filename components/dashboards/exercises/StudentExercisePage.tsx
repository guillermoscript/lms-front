'use client'

import { generateId } from 'ai'
import confetti from 'canvas-confetti'
import { AnimatePresence, motion } from 'framer-motion'
import {
    Award,
    ChevronDown,
    ChevronLeft,
    ChevronUp,
    Clock,
    Loader,
    Share2,
    Trash,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { toast } from 'sonner'

import { deleteMessagesAndCompletitionOfExerciseAction } from '@/actions/dashboard/exercisesActions'
import { useScopedI18n } from '@/app/locales/client'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/utils'
import { URL_OF_SITE } from '@/utils/const'

import ExerciseChat from '../student/course/exercises/exerciseChat'

export default function EnhancedStudentExercisePage({
    exercise,
    courseId,
    exerciseId,
    isExerciseCompleted,
    profile,
}: {
    exercise: any
    courseId: string
    exerciseId: string
    isExerciseCompleted: boolean
    profile: {
        full_name: string
        avatar_url: string
    }
}) {
    const [progress, setProgress] = useState(isExerciseCompleted ? 100 : 0)
    const [showConfetti, setShowConfetti] = useState(false)
    const [isInstructionsExpanded, setIsInstructionsExpanded] = useState(true)
    const router = useRouter()
    const { theme } = useTheme()
    const t = useScopedI18n('StudentExercisePage')

    const handleProgressUpdate = (newProgress) => {
        setProgress(newProgress)
        if (newProgress === 100) {
            setShowConfetti(true)
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
            })
        }
    }

    const getDifficultyColor = (level) => {
        switch (level) {
            case 'easy':
                return 'bg-green-100 text-green-800'
            case 'medium':
                return 'bg-yellow-100 text-yellow-800'
            case 'hard':
                return 'bg-red-100 text-red-800'
            default:
                return 'bg-gray-100 text-gray-800'
        }
    }

    const initialMessages = [
        {
            id: generateId(),
            role: 'system',
            content: exercise.system_prompt,
        },
        ...exercise.exercise_messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.message,
        })),
    ]

    return (
        <div className="container mx-auto px-4 py-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className='space-y-4'
            >
                <Link
                    className={buttonVariants({ variant: 'ghost' })}
                    href={`/dashboard/student/courses/${courseId}`}
                >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    {t('backToCourse')}
                </Link>

                <Card className="mb-4">
                    <CardHeader>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <CardTitle className="text-2xl md:text-3xl font-bold">
                                    {exercise.title}
                                </CardTitle>
                                <p className="text-muted-foreground mt-2">
                                    {exercise.description}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary">
                                    {exercise.exercise_type}
                                </Badge>
                                <Badge
                                    className={getDifficultyColor(
                                        exercise.difficulty_level
                                    )}
                                >
                                    {exercise.difficulty_level}
                                </Badge>
                                {exercise.time_limit && (
                                    <Badge variant="outline">
                                        <Clock className="mr-1 h-3 w-3" />
                                        {exercise.time_limit} {t('minutes')}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">
                                {t('progress')}
                            </span>
                            <span className="text-sm font-medium">
                                {progress}%
                            </span>
                        </div>
                        <Progress value={progress} className="h-2" />
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
                    <div className="lg:col-span-2 space-y-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xl font-bold">
                                    {t('instructions')}
                                </CardTitle>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsInstructionsExpanded(!isInstructionsExpanded)}
                                >
                                    {isInstructionsExpanded ? <ChevronUp /> : <ChevronDown />}
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <AnimatePresence initial={false}>
                                    {isInstructionsExpanded && (
                                        <motion.div
                                            initial="collapsed"
                                            animate="open"
                                            exit="collapsed"
                                            variants={{
                                                open: { opacity: 1, height: 'auto' },
                                                collapsed: { opacity: 0, height: 0 }
                                            }}
                                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                                        >
                                            <ViewMarkdown
                                                markdown={exercise.instructions}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </CardContent>
                        </Card>

                        <Card
                            className=' border-none shadow-none md:border md:shadow '
                        >
                            <CardContent className="p-0">
                                <ExerciseChat
                                    apiEndpoint={`${URL_OF_SITE}/api/chat/exercises/student/`}
                                    exerciseId={exerciseId}
                                    initialMessages={initialMessages}
                                    isExerciseCompleted={isExerciseCompleted}
                                    profile={profile}
                                />
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('tips')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="list-disc list-inside space-y-2">
                                    <li>{t('tip1')}</li>
                                    <li>{t('tip2')}</li>
                                    <li>{t('tip3')}</li>
                                </ul>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('actions')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <Button
                                        className="w-full"
                                        variant="outline"
                                    >
                                        <Share2 className="mr-2 h-4 w-4" />
                                        {t('shareProgress')}
                                    </Button>
                                    {isExerciseCompleted && (
                                        <DeleteModal
                                            exerciseId={exerciseId}
                                            t={t}
                                        />
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </motion.div>

            <AnimatePresence>
                {showConfetti && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="fixed inset-0 flex items-center justify-center z-50"
                        onClick={() => setShowConfetti(false)}
                    >
                        <div
                            className={`bg-${
                                theme === 'dark' ? 'gray-800' : 'white'
                            } p-8 rounded-lg shadow-lg text-center`}
                        >
                            <Award className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold mb-2">
                                {t('congratulations')}
                            </h2>
                            <p>{t('exerciseCompleted')}</p>
                            <Button
                                className="mt-4"
                                onClick={() =>
                                    router.push(
                                        `/dashboard/student/courses/${courseId}`
                                    )
                                }
                            >
                                {t('backToCourse')}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function DeleteModal({ exerciseId, t }: { exerciseId: string; t: any }) {
    const [isLoading, setIsLoading] = useState(false)

    return (
        <AlertDialog>
            <AlertDialogTrigger
                className={cn(
                    buttonVariants({
                        variant: 'destructive',
                    }),
                    'w-full'
                )}
            >
                <Trash className="mr-2 h-4 w-4" />
                {t('deleteConfirmation.trigger')}
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {t('deleteConfirmation.title')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('deleteConfirmation.description')}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>
                        {t('deleteConfirmation.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={isLoading}
                        onClick={async (e) => {
                            e.preventDefault()
                            setIsLoading(true)
                            try {
                                const res =
                                    await deleteMessagesAndCompletitionOfExerciseAction(
                                        {
                                            exerciseId,
                                        }
                                    )

                                if (res.error) {
                                    toast.error(t('deleteConfirmation.error'))
                                    return
                                }

                                toast.success(t('deleteConfirmation.success'))
                            } catch (e) {
                                console.error(e)
                                toast.error(t('deleteConfirmation.error'))
                            } finally {
                                setIsLoading(false)
                            }
                        }}
                    >
                        {isLoading ? (
                            <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                            t('deleteConfirmation.continue')
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
