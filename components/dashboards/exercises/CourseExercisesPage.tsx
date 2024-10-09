'use client'

import { BarChart2, Clock, Filter, Search, SortAsc } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/utils'
import { Tables } from '@/utils/supabase/supabase'

interface Exercise {
    id: string
    title: string
    description: string
    exercise_type: string
    difficulty_level: 'easy' | 'medium' | 'hard'
    time_limit?: number
}

interface CourseExercisesPageProps {
    courseId: string
    courseTitle: string
    exercises: Array<Tables<'exercises'>>
}

export default function CourseExercisesPage({
    courseId,
    courseTitle,
    exercises,
}: CourseExercisesPageProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [difficultyFilter, setDifficultyFilter] = useState<string | null>(
        null
    )
    const [sortBy, setSortBy] = useState<'title' | 'difficulty'>('title')
    const router = useRouter()

    const filteredExercises = exercises
        .filter(
            (exercise) =>
                exercise.title
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase()) ||
                exercise.description
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase())
        )
        .filter(
            (exercise) =>
                !difficultyFilter ||
                exercise.difficulty_level === difficultyFilter
        )
        .sort((a, b) => {
            if (sortBy === 'title') {
                return a.title.localeCompare(b.title)
            } else {
                const difficultyOrder = { easy: 1, medium: 2, hard: 3 }
                return (
                    difficultyOrder[a.difficulty_level] -
                    difficultyOrder[b.difficulty_level]
                )
            }
        })

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

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">
                {courseTitle} - Exercises
            </h1>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search exercises"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                    />
                </div>

                <div className="flex gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Filter className="mr-2 h-4 w-4" />
                                Filter
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem
                                onClick={() => setDifficultyFilter(null)}
                            >
                                All Difficulties
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setDifficultyFilter('easy')}
                            >
                                Easy
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setDifficultyFilter('medium')}
                            >
                                Medium
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setDifficultyFilter('hard')}
                            >
                                Hard
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Select
                        onValueChange={(value) =>
                            setSortBy(value as 'title' | 'difficulty')
                        }
                    >
                        <SelectTrigger className="w-[180px]">
                            <SortAsc className="mr-2 h-4 w-4" />
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="title">Sort by Title</SelectItem>
                            <SelectItem value="difficulty">
                                Sort by Difficulty
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredExercises.map((exercise) => (
                    <Card key={exercise.id} className="flex flex-col">
                        <CardHeader>
                            <CardTitle className="text-xl">
                                {exercise.title}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground mb-4">
                                {exercise.description}
                            </p>
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
                                        {exercise.time_limit} min
                                    </Badge>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter className="mt-auto">
                            <Link
                                className={cn(
                                    buttonVariants({ variant: 'default' }),
                                    'w-full'
                                )}
                                href={`/dashboard/student/courses/${courseId}/exercises/${exercise.id}`}
                            >
                                Start Exercise
                            </Link>
                        </CardFooter>
                    </Card>
                ))}
            </div>

            {filteredExercises.length === 0 && (
                <div className="text-center py-10">
                    <BarChart2 className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-2 text-sm font-semibold text-gray-900">
                        No exercises found
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                        Try adjusting your search or filter to find what you're
                        looking for.
                    </p>
                </div>
            )}
        </div>
    )
}
