
import { Clock } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/utils'

interface Exercise {
    id: string;
    title: string;
    description: string;
    exercise_type: string;
    difficulty_level: string;
    time_limit?: number;
    exercise_completions: any[];
    exercise_messages: any[];
}

interface ExerciseCardProps {
    exercise: Exercise;
    courseId: string;
    t: any;
}

const getDifficultyColor = (level: string) => {
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

const ExerciseCard: React.FC<ExerciseCardProps> = ({ exercise, courseId, t }) => {
    return (
        <Card key={exercise.id} className="flex flex-col">
            <CardHeader>
                <CardTitle className="text-xl">{exercise.title}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground mb-4">{exercise.description}</p>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{exercise.exercise_type}</Badge>
                    <Badge className={getDifficultyColor(exercise.difficulty_level)}>
                        {t(exercise.difficulty_level)}
                    </Badge>
                    {exercise.time_limit && (
                        <Badge variant="outline">
                            <Clock className="mr-1 h-3 w-3" />
                            {exercise.time_limit} min
                        </Badge>
                    )}
                </div>
            </CardContent>
            <CardFooter className="mt-auto">
                <Link
                    className={cn(
                        buttonVariants({
                            variant:
                                exercise.exercise_completions.length > 0
                                    ? 'secondary'
                                    : exercise.exercise_messages.length > 0
                                        ? 'default'
                                        : 'outline',
                        }),
                        'w-full'
                    )}
                    href={`/dashboard/student/courses/${courseId}/exercises/${exercise.id}`}
                >
                    {exercise.exercise_completions.length > 0
                        ? t('review')
                        : exercise.exercise_messages.length > 0
                            ? t('continue')
                            : t('start')}
                </Link>
            </CardFooter>
        </Card>
    )
}

export default ExerciseCard
