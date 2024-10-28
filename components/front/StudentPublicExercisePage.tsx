'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import React from 'react'

import dayjs from 'dayjs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Separator } from '@/components/ui/separator'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import ToggleableSection from '@/components/dashboards/student/course/lessons/ToggleableSection'
import { SuccessMessage } from '../dashboards/Common/chat/chat'

export default function StudentPublicExercisePage({
    exercise,
    isExerciseCompleted,
    profile,
}: {
    exercise: any
    isExerciseCompleted: boolean
    profile: {
        full_name: string
        avatar_url: string
    }
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

    return (
        <div className="container mx-auto px-4 py-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-4"
            >
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

                <div className="flex flex-col gap-4 w-full">
                    <div className="lg:col-span-2 space-y-4">
                        <ToggleableSection
                            isOpen={false}
                            title={t('instructions')}
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
                            <CardContent className="p-0"></CardContent>
                        </Card>
                    </div>
                </div>

                {exercise.exercise_messages.map((message, index) => (
                    <MessageItem
                        key={index}
                        message={message}
                        profile={profile}
                    />
                ))}

                {isExerciseCompleted && (
                    <SuccessMessage message={t('exerciseCompleted')} />
                )}
            </motion.div>
        </div>
    )
}

interface MessageItemProps {
    message: any
    profile: {
        full_name: string
        avatar_url: string
    }
    children?: React.ReactNode
}

const MessageItem: React.FC<MessageItemProps> = ({
    message,
    profile,
    children,
}) => {
    const content = message.message
    return (
        <div className="mb-6">
            <div className="flex flex-col items-start gap-3">
                <Avatar className="w-8 h-8">
                    <AvatarImage
                        src={
                            message.role === 'user'
                                ? profile.avatar_url
                                : '/img/robot.jpeg'
                        }
                    />
                    <AvatarFallback>
                        {message.role === 'user' ? profile.full_name[0] : 'A'}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 w-full">
                    <div className="py-3 rounded-lg">
                        <ViewMarkdown markdown={content} />
                        <div className="text-xs text-gray-500 mt-1 flex items-center flex-wrap gap-4 justify-between">
                            <span>
                                {dayjs(message.createdAt).format(
                                    'MMM D, YYYY h:mm A'
                                )}
                            </span>
                            <div className="flex items-center space-x-2">
                                {children}
                            </div>
                        </div>
                    </div>
                    <Separator className="mt-3" />
                </div>
            </div>
        </div>
    )
}
