'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, ChevronLeft, Share2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useCopyToClipboard } from 'usehooks-ts'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/utils'

interface ExercisePageProps {
    exercise: {
        id: string
        title: string
        description: string
        difficulty_level: string
        instructions: string
        system_prompt: string
        test_cases: string
        exercise_type: string
        points: number
    }
    isExerciseCompleted: boolean
    children: React.ReactNode
    studentId: string
    readOnly?: boolean
    courseId?: string
}

export default function StudentExerciseCodePage({
    exercise,
    isExerciseCompleted,
    children,
    studentId,
    readOnly = false,
    courseId,
}: ExercisePageProps) {
    const t = useScopedI18n('StudentExerciseCodePage')

    const [copiedText, copy] = useCopyToClipboard()

    const getDifficultyColor = (level: string) => {
        switch (level.toLowerCase()) {
            case 'easy':
                return 'text-green-500 bg-green-500/10'
            case 'medium':
                return 'text-yellow-500 bg-yellow-500/10'
            case 'hard':
                return 'text-red-500 bg-red-500/10'
            default:
                return 'text-gray-500 bg-gray-500/10'
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Top Navigation */}
            <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-14 max-w-screen-2xl items-center">
                    <div className="flex items-center space-x-4">
                        {!readOnly && (
                            <Link
                                href={`/dashboard/student/courses/${courseId}/exercises`}
                                className="flex items-center space-x-2 hover:text-primary"
                            >
                                <ChevronLeft className="h-4 w-4" />
                                <span>{t('backToExercises')}</span>
                            </Link>
                        )}
                        <Separator orientation="vertical" className="h-6" />
                        <Badge
                            variant="outline"
                            className={cn('px-2 py-1', getDifficultyColor(exercise.difficulty_level))}
                        >
                            {t(exercise.difficulty_level)}
                        </Badge>
                    </div>
                    <div className="ml-auto flex items-center space-x-4">
                        {!readOnly && (
                            <Button
                                onClick={ () => {
                                    copy(window.location.hostname + `/student/${studentId}/exercises/${exercise.id}/`)
                                    toast.success(t('copiedToClipboard'))
                                }}
                                variant="outline" size="sm"
                            >
                                <Share2 className="mr-2 h-4 w-4" />
                                {t('shareProgress')}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Success Message */}
            <AnimatePresence>
                {isExerciseCompleted && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="mb-6"
                    >
                        <Card className="bg-green-500/10 border-green-500/20">
                            <CardContent className="flex items-center justify-center py-6">
                                <div className="flex items-center space-x-4">
                                    <CheckCircle className="h-8 w-8 text-green-500" />
                                    <div>
                                        <h2 className="text-xl font-bold text-green-500">{t('congratulations')}</h2>
                                        <p className="text-green-600">{t('youDidGreat')}</p>
                                        {readOnly && <p className="text-green-600">{t('thisExerciseWasCompleted')}</p>}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="space-y-4 px-4">
                <h1 className="text-3xl font-bold tracking-tight">{exercise.title}</h1>
                <p className="text-muted-foreground mt-2">{exercise.description}</p>
            </div>

            {/* Code Editor Area */}
            <div className="flex-1 flex flex-col">
                <div className="flex-1 p-4">
                    {children}
                </div>
            </div>
        </div>
    )
}
