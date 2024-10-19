import { useI18n } from '@/app/locales/client'

import ItemCard from './ItemCard'

interface LessonCardProps {
    title: string
    number: number
    description: string
    status: string
    courseId: string
    id: string
    image?: string
}

const LessonCard: React.FC<LessonCardProps> = ({
    title,
    number,
    description,
    status,
    courseId,
    id: lessonId,
    image,
}) => {
    const t = useI18n()

    return (
        <ItemCard
            title={title}
            description={description}
            status={status}
            courseId={courseId}
            actionLink={`/dashboard/student/courses/${courseId}/lessons/${lessonId}`}
            actionLabel={
                status === 'Completed'
                    ? t('dashboard.student.CourseStudentPage.completed')
                    : status === 'In Progress'
                        ? t('dashboard.student.CourseStudentPage.continue')
                        : t('dashboard.student.CourseStudentPage.start')
            }
            Icon={null}
            headerDescription={t('dashboard.student.CourseStudentPage.lesson')}
            image={image || '/icons/placeholder.svg'}
        />
    )
}

export default LessonCard
