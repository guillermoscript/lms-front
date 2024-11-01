'use client'

import {
    Star
} from 'lucide-react'
import { useState } from 'react'

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

export default function StudentExerciseCodePage({ exercise, isExerciseCompleted, children }: ExercisePageProps) {
    const [activeTab, setActiveTab] = useState('instructions')
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
            <div className="w-full border-r overflow-auto">
                <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                        <Badge variant="outline" className={cn('px-2 py-1', getDifficultyColor(exercise.difficulty_level))}>
                            {exercise.difficulty_level}
                        </Badge>
                        <div className="flex items-center space-x-2">
                            <Badge variant="secondary">
                                <Star className="w-4 h-4 mr-1" />
                                {exercise.points} points
                            </Badge>
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold mb-2">{exercise.title}</h1>
                    <p className="text-muted-foreground mb-4">{exercise.description}</p>

                    <Tabs defaultValue="problem" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="problem">Problem</TabsTrigger>
                            <TabsTrigger value="hints">Hints</TabsTrigger>
                            <TabsTrigger value="tests">Tests</TabsTrigger>
                        </TabsList>
                        <TabsContent value="problem" className="space-y-4">
                            <ViewMarkdown markdown={ exercise.instructions } />
                        </TabsContent>
                        <TabsContent value="hints">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Need a hint?</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {showHint ? (
                                        <p>Here's a helpful hint for solving this problem...</p>
                                    ) : (
                                        <Button onClick={() => setShowHint(true)}>Show Hint</Button>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="tests" className="space-y-4">
                            <pre className="p-4 bg-muted rounded-lg overflow-auto">
                                <code>{exercise.test_cases}</code>
                            </pre>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Code Editor Area */}
            <div className="flex-1 flex flex-col">
                {/* <div className="border-b p-2 flex items-center justify-between bg-muted/50">
                        <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="font-mono">
                                <Code2 className="w-4 h-4 mr-1" />
                JavaScript
                            </Badge>
                            <Badge variant="outline" className="font-mono">
                                <Settings className="w-4 h-4 mr-1" />
                Node v18
                            </Badge>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="sm">
                                <RefreshCw className="w-4 h-4 mr-1" />
                Reset
                            </Button>
                            <Button variant="ghost" size="sm">
                                <SkipForward className="w-4 h-4 mr-1" />
                Skip
                            </Button>
                            <Button variant="default" size="sm">
                                <Play className="w-4 h-4 mr-1" />
                Run Tests
                            </Button>
                            <Button variant="secondary" size="sm">
                                <Check className="w-4 h-4 mr-1" />
                Submit
                            </Button>
                        </div>
                    </div> */}

                <div className="flex-1 p-4">
                    {/* Code Editor will be placed here */}
                    {children}
                </div>
            </div>

        </div>
    )
}
