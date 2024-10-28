'use client'

import { generateId } from 'ai'
import { AnimatePresence, motion } from 'framer-motion'
import {
    ChevronLeft,
    Clock,
    Loader,
    Share2,
    Trash,
} from 'lucide-react'
import Link from 'next/link'
import React, { useState } from 'react'
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
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/utils'
import { URL_OF_SITE } from '@/utils/const'

import ExerciseChat from '../student/course/exercises/exerciseChat'
import ToggleableSection from '../student/course/lessons/ToggleableSection'

export default function EnhancedStudentExercisePage({
    exercise,
    courseId,
    exerciseId,
    isExerciseCompleted,
    profile,
    children,
    isExerciseCompletedSection,
    studentId
}: {
    exercise: any
    courseId: string
    exerciseId: string
    isExerciseCompleted: boolean
    profile: {
        full_name: string
        avatar_url: string
    }
    children?: React.ReactNode
    isExerciseCompletedSection?: React.ReactNode
    studentId: string
}) {
    const progress = isExerciseCompleted ? 100 : 0
    const t = useScopedI18n('StudentExercisePage')

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
                className="space-y-4"
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

                <div className="md:grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8 flex flex-col-reverse lg:flex-row">
                    <div className="lg:col-span-2 space-y-4">
                        <ToggleableSection
                            isOpen={false}
                            title={ t('instructions')}
                        >
                            <>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-xl font-bold">
                                        {t('instructions')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <AnimatePresence initial={false}>
                                        <motion.div
                                            initial="collapsed"
                                            animate="open"
                                            exit="collapsed"
                                            variants={{
                                                open: {
                                                    opacity: 1,
                                                    height: 'auto',
                                                },
                                                collapsed: {
                                                    opacity: 0,
                                                    height: 0,
                                                },
                                            }}
                                            transition={{
                                                duration: 0.3,
                                                ease: 'easeInOut',
                                            }}
                                        >
                                            <ViewMarkdown
                                                markdown={exercise.instructions}
                                            />
                                        </motion.div>
                                    </AnimatePresence>
                                </CardContent>
                            </>
                        </ToggleableSection>

                        <Card className=" border-none shadow-none md:border md:shadow ">
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
                        {isExerciseCompleted && isExerciseCompletedSection && (
                            isExerciseCompletedSection
                        )}
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
                                    <Link
                                        className={buttonVariants({ variant: 'outline'})}
                                        href={`/student/${studentId}/exercises/${exerciseId}/`}
                                    >
                                        <Share2 className="mr-2 h-4 w-4" />
                                        {t('shareProgress')}
                                    </Link>
                                    {isExerciseCompleted && (
                                        <DeleteModal
                                            exerciseId={exerciseId}
                                            t={t}
                                        />
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                        {children}
                    </div>
                </div>
            </motion.div>
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
