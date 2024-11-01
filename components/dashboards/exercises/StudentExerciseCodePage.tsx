'use client'

import { Star } from 'lucide-react'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/utils'

interface ExercisePageProps {
    exercise: {
        id: string
        title: string
        description: string
        difficulty_level: string
        instructions: string
        system_prompt: string
        initial_code: string
        test_cases: string
        exercise_type: string
        points: number
    }
    isExerciseCompleted: boolean
    children: React.ReactNode
}

export default function StudentExerciseCodePage({
    exercise,
    isExerciseCompleted,
    children,
}: ExercisePageProps) {
    const t = useScopedI18n('StudentExerciseCodePage')
    const [showHint, setShowHint] = useState(false)

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
            {/* Instructions Panel */}
            <div className="w-full overflow-auto">
                <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                        <Badge
                            variant="outline"
                            className={cn(
                                'px-2 py-1',
                                getDifficultyColor(exercise.difficulty_level)
                            )}
                        >
                            {t(exercise.difficulty_level)}
                        </Badge>
                        <div className="flex items-center space-x-2">
                            <Badge variant="secondary">
                                <Star className="w-4 h-4 mr-1" />
                                {exercise.points} {t('points')}
                            </Badge>
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold mb-2">
                        {exercise.title}
                    </h1>
                    <p className="text-muted-foreground mb-4">
                        {exercise.description}
                    </p>

                    <Tabs defaultValue="problem" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="problem">
                                {t('problem')}
                            </TabsTrigger>
                            <TabsTrigger value="hints">
                                {t('hints')}
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="problem" className="space-y-4">
                            <ViewMarkdown markdown={exercise.instructions} />
                        </TabsContent>
                        <TabsContent value="hints">
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('needHint')}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {showHint ? (
                                        <p>{t('hintMessage')}</p>
                                    ) : (
                                        <Button
                                            onClick={() => setShowHint(true)}
                                        >
                                            {t('showHint')}
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Code Editor Area */}
            <div className="flex-1 flex flex-col">
                <div className="flex-1 p-4">{children}</div>
            </div>
        </div>
    )
}
