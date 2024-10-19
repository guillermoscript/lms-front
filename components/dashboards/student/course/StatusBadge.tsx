import { CheckCircle, Clock, Clock10 } from 'lucide-react'

import { useI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'

interface StatusBadgeProps {
    status: string
    t: (key: string) => string
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
    const t = useI18n()

    const getVariant = () => {
        switch (status) {
            case 'Completed':
                return 'default'
            case 'In Progress':
                return 'outline'
            default:
                return 'secondary'
        }
    }

    const getIcon = () => {
        switch (status) {
            case 'Completed':
                return <CheckCircle className="mr-1 h-3 w-3" />
            case 'In Progress':
                return <Clock className="mr-1 h-3 w-3" />
            default:
                return <Clock10 className="mr-1 h-3 w-3" />
        }
    }

    const getText = () => {
        switch (status) {
            case 'Completed':
                return t('dashboard.student.CourseStudentPage.completed')
            case 'In Progress':
                return t('dashboard.student.CourseStudentPage.inProgress')
            default:
                return t('dashboard.student.CourseStudentPage.notStarted')
        }
    }

    return (
        <Badge variant={getVariant()}>
            {getIcon()}
            {getText()}
        </Badge>
    )
}

export default StatusBadge
