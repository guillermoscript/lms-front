import { FileText } from 'lucide-react'

import { useI18n } from '@/app/locales/client'

import ItemCard from './ItemCard'

interface ExamCardProps {
    title: string
    number: number
    description: string
    status: string
    grade?: string
    courseId: string
    exam_id: string
}

const ExamCard: React.FC<ExamCardProps> = ({
    title,
    number,
    description,
    status,
    grade,
    courseId,
    exam_id: examId,
}) => {
    const t = useI18n()

    return (
        <ItemCard
            title={title}
            description={description}
            status={status}
            courseId={courseId}
            actionLink={`/dashboard/student/courses/${courseId}/exams/${examId}`}
            actionLabel={status === 'Completed' ? t('dashboard.student.CourseStudentPage.completed') : status === 'Not Started' ? t('dashboard.student.CourseStudentPage.notStarted') : t('dashboard.student.CourseStudentPage.waitingForReview')}
            Icon={<FileText className="mr-2 h-4 w-4" />}
            headerDescription={t('dashboard.student.CourseStudentPage.exam')}
            additionalContent={grade && <p className="font-semibold">{t('dashboard.student.CourseStudentPage.grade')}: {grade}</p>}
        />
    )
}

export default ExamCard
