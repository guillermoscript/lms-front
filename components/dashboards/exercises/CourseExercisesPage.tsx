'use client'

import { BarChart2, Filter, Search, SortAsc } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
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
import { Tables } from '@/utils/supabase/supabase'

import ExerciseCard from './ExerciseCard'

interface Exercise {
    id: string
    title: string
    description: string
    exercise_type: string
    difficulty_level: 'easy' | 'medium' | 'hard'
    time_limit?: number
    exercise_completions: Array<Tables<'exercise_completions'>>
    exercise_messages: Array<Tables<'exercise_messages'>>
}

interface CourseExercisesPageProps {
    courseId: string
    courseTitle: string
    exercises: Exercise[]
}

export default function CourseExercisesPage({
    courseId,
    courseTitle,
    exercises,
}: CourseExercisesPageProps) {
    const t = useScopedI18n('CourseExercisesPage')
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
                {courseTitle} - {t('exercises')}
            </h1>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={t('searchPlaceholder')}
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
                                {t('filter')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem
                                onClick={() => setDifficultyFilter(null)}
                            >
                                {t('allDifficulties')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setDifficultyFilter('easy')}
                            >
                                {t('easy')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setDifficultyFilter('medium')}
                            >
                                {t('medium')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setDifficultyFilter('hard')}
                            >
                                {t('hard')}
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
                            <SelectValue placeholder={t('sortBy')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="title">
                                {t('sortByTitle')}
                            </SelectItem>
                            <SelectItem value="difficulty">
                                {t('sortByDifficulty')}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredExercises.map((exercise) => (
                    <ExerciseCard key={exercise.id}
                        t={t}
                        exercise={exercise} courseId={courseId}
                    />
                ))}
            </div>

            {filteredExercises.length === 0 && (
                <div className="text-center py-10">
                    <BarChart2 className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-2 text-sm font-semibold text-gray-900">
                        {t('noExercisesFound')}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                        {t('tryAdjustingSearch')}
                    </p>
                </div>
            )}
        </div>
    )
}
