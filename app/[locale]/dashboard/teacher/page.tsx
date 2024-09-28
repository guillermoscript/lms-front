
import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import EnhancedTeacherDashboard from '@/components/dashboards/teacher/enhanced-teacher-dashboard'

export default async function TeacherPage () {
    const t = await getI18n()

    return (
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/teacher', label: t('BreadcrumbComponent.teacher') }
                ]}
            />
            <EnhancedTeacherDashboard />
        </>
    )
}
