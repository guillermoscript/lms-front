'use client'

import { AnimatePresence } from 'framer-motion'
import Fuse from 'fuse.js'
import { ArrowUpDown, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/utils'

import { CourseHeader } from './CourseHeader'
import ExamCard from './ExamCard'
import ExerciseCard from './ExerciseCard'
import LessonCard from './LessonCard'
import NoDataPlaceholder from './NoDataPlaceholder'
import { ProgressCard } from './ProgressCard'

interface EnhancedCourseStudentPageProps {
    courseData: {
        course_id: string
        title: string
        description: string
        thumbnail_url: string
        lessons: any[]
        exercises: any[]
        exams: any[]
    }
}

const EnhancedCourseStudentPage: React.FC<EnhancedCourseStudentPageProps> = ({
    courseData,
}) => {
    const t = useI18n()
    const [searchTerm, setSearchTerm] = useState('')
    const [filterStatus, setFilterStatus] = useState('all')
    const [sortOrder, setSortOrder] = useState('asc')

    const [filteredLessons, setFilteredLessons] = useState(courseData.lessons)
    const [filteredExercises, setFilteredExercises] = useState(
        courseData.exercises
    )
    const [filteredExams, setFilteredExams] = useState(courseData.exams)

    useEffect(() => {
        const filterAndSortItems = (items: any[], type: string) => {
            // Define the options for fuzzy search
            const options = {
                keys: ['title'], // Search in the title field
                includeScore: true, // Include score for ranking
                threshold: 0.4, // Allow fuzzy matching (lower is stricter)
            }

            // Create a Fuse instance with the items
            const fuse = new Fuse(items, options)

            // Perform the search, which supports partial matching
            // If no search term, just use original items
            const searchResults = searchTerm
                ? fuse.search(searchTerm).map(({ item }) => item)
                : items

            // First, filter by status
            const filteredItems = searchResults.filter((item) => {
                const status =
                    type === 'lessons'
                        ? item.lesson_completions.length > 0
                            ? 'Completed'
                            : item.lessons_ai_task_messages.length > 0
                                ? 'In Progress'
                                : 'Not Started'
                        : type === 'exercises'
                            ? item.exercise_completions?.length > 0
                                ? 'Completed'
                                : item.exercise_messages?.length > 0
                                    ? 'In Progress'
                                    : 'Not Started'
                            : item.exam_submissions.length > 0
                                ? item.exam_submissions[0].exam_scores.length > 0
                                    ? 'Completed'
                                    : 'Waiting for Review'
                                : 'Not Started'

                return filterStatus === 'all' || status === filterStatus
            })

            // Now sort the filtered results
            return filteredItems.sort((a, b) =>
                sortOrder === 'asc'
                    ? a.sequence - b.sequence
                    : b.sequence - a.sequence
            )
        }

        // Set filtered results for lessons, exercises, and exams
        setFilteredLessons(filterAndSortItems(courseData.lessons, 'lessons'))
        setFilteredExercises(filterAndSortItems(courseData.exercises, 'exercises'))
        setFilteredExams(filterAndSortItems(courseData.exams, 'exams'))
    }, [searchTerm, filterStatus, sortOrder, courseData])

    const completedLessons = courseData.lessons.filter(
        (lesson) => lesson.lesson_completions.length > 0
    ).length
    const completedExams = courseData.exams.filter(
        (exam) => exam.exam_submissions.length > 0
    ).length
    const completedExercises = courseData.exercises.filter(
        (exercise) => exercise.exercise_completions?.length > 0
    ).length

    const renderTabContent = (
        items: any[],
        renderCard: (item: any) => JSX.Element,
        noDataKey: string
    ) => (
        <AnimatePresence>
            {items.length > 0 ? (
                items.map((item) => renderCard(item))
            ) : (
                <NoDataPlaceholder
                    iconSrc="/img/404(2).jpeg"
                    iconAlt="No Data"
                    message={t(
                        `dashboard.student.CourseStudentPage.no${noDataKey}`
                    )}
                    description={t(
                        `dashboard.student.CourseStudentPage.no${noDataKey}Description`
                    )}
                />
            )}
        </AnimatePresence>
    )

    return (
        <>

            <CourseHeader
                title={courseData.title}
                description={courseData.description}
                image={courseData.thumbnail_url}
            />

            <ProgressCard
                completedLessons={completedLessons}
                totalLessons={courseData.lessons.length}
                completedExams={completedExams}
                totalExams={courseData.exams.length}
                completedExercises={completedExercises}
                totalExercises={courseData.exercises.length}
                t={t}
            />

            <div className="mb-6 flex flex-col md:flex-row gap-4">
                <div className="relative flex-grow">
                    <Input
                        placeholder={t('dashboard.student.CourseStudentPage.searchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full"
                    />
                    <Search className="absolute right-3 top-3 h-4 w-4 text-gray-500" />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full md:w-[180px]">
                        <SelectValue placeholder={t('dashboard.student.CourseStudentPage.filterByStatus')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('dashboard.student.CourseStudentPage.all')}</SelectItem>
                        <SelectItem value="Completed">
                            {t('dashboard.student.CourseStudentPage.completed')}
                        </SelectItem>
                        <SelectItem value="In Progress">
                            {t('dashboard.student.CourseStudentPage.inProgress')}
                        </SelectItem>
                        <SelectItem value="Not Started">
                            {t('dashboard.student.CourseStudentPage.notStarted')}
                        </SelectItem>
                    </SelectContent>
                </Select>
                <Button
                    variant="outline"
                    onClick={() =>
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                    }
                >
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    {sortOrder === 'asc'
                        ? t('dashboard.student.CourseStudentPage.sortAscending')
                        : t('dashboard.student.CourseStudentPage.sortDescending')}
                </Button>
            </div>

            <Tabs defaultValue="lessons" className="w-full space-y-8">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="lessons">
                        {t('dashboard.student.CourseStudentPage.lessons')}
                    </TabsTrigger>
                    <TabsTrigger value="exercises">
                        {t('dashboard.student.CourseStudentPage.exercises')}
                    </TabsTrigger>
                    <TabsTrigger value="exams">
                        {t('dashboard.student.CourseStudentPage.exams')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent
                    value="lessons"
                    className={cn(
                        'grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
                        filteredLessons.length === 0 && 'flex justify-center'
                    )}
                >
                    {renderTabContent(
                        filteredLessons,
                        (lesson) => (
                            <LessonCard
                                key={lesson.id}
                                status={
                                    lesson.lesson_completions.length > 0
                                        ? 'Completed'
                                        : lesson.lessons_ai_task_messages
                                            .length > 0
                                            ? 'In Progress'
                                            : 'Not Started'
                                }
                                {...lesson}
                                courseId={courseData.course_id}
                            />
                        ),
                        'Lessons'
                    )}
                </TabsContent>

                <TabsContent
                    value="exercises"
                    className={cn(
                        'grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
                        filteredExercises.length === 0 && 'flex justify-center'
                    )}
                >
                    {renderTabContent(
                        filteredExercises,
                        (exercise) => (
                            <ExerciseCard
                                key={exercise.id}
                                {...exercise}
                                courseId={courseData.course_id}
                                status={
                                    exercise.exercise_completions?.length > 0
                                        ? 'Completed'
                                        : exercise.exercise_messages?.length > 0
                                            ? 'In Progress'
                                            : 'Not Started'
                                }
                                exercise_type={exercise.exercise_type}
                                difficulty_level={exercise.difficulty_level}
                            />
                        ),
                        'Exercises'
                    )}
                </TabsContent>

                <TabsContent
                    value="exams"
                    className={cn(
                        'grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
                        filteredExams.length === 0 && 'flex justify-center'
                    )}
                >
                    {renderTabContent(
                        filteredExams,
                        (exam) => (
                            <ExamCard
                                key={exam.exam_id}
                                {...exam}
                                courseId={courseData.course_id}
                                status={
                                    exam.exam_submissions.length > 0
                                        ? exam.exam_submissions[0].exam_scores
                                            .length > 0
                                            ? 'Completed'
                                            : 'Waiting for Review'
                                        : 'Not Started'
                                }
                                exam_id={exam.exam_id}
                            />
                        ),
                        'Exams'
                    )}
                </TabsContent>
            </Tabs>
        </>
    )
}

export default EnhancedCourseStudentPage
