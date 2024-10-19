import { Dumbbell } from 'lucide-react'

import { useI18n } from '@/app/locales/client'
import { Tables } from '@/utils/supabase/supabase'

import ItemCard from './ItemCard'

interface ExerciseCardProps {
    title: string
    description: string
    difficulty_level: Tables<'exercises'>['difficulty_level']
    exercise_type: Tables<'exercises'>['exercise_type']
    status: string
    courseId: string
    id: string
}

const ExerciseCard: React.FC<ExerciseCardProps> = ({
    title,
    description,
    difficulty_level: difficulty,
    exercise_type: type,
    status,
    courseId,
    id: exerciseId,
}) => {
    const t = useI18n()

    return (
        <ItemCard
            title={title}
            description={description}
            status={status}
            courseId={courseId}
            actionLink={`/dashboard/student/courses/${courseId}/exercises/${exerciseId}`}
            actionLabel={
                status === 'Completed'
                    ? t('dashboard.student.CourseStudentPage.review')
                    : status === 'In Progress'
                        ? t('dashboard.student.CourseStudentPage.continue')
                        : t('dashboard.student.CourseStudentPage.start')
            }
            Icon={<Dumbbell className="h-4 w-4" />}
            headerDescription={`${type} - ${difficulty}`}
        />
    )
}

export default ExerciseCard
