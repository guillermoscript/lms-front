import { getScopedI18n } from '@/app/locales/server'
import AccountEditPage from '@/components/dashboards/Common/account/AccountEditPage'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'

export default async function Dashboard () {
    const t = await getScopedI18n('BreadcrumbComponent')

    return (
        <div className="container mx-auto flex flex-col gap-4">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('dashboard') },
                    { href: '/dashboard/teacher', label: t('teacher') },
                    {
                        href: '/dashboard/teacher/account/',
                        label: t('account'),
                    },
                    {
                        href: '/dashboard/teacher/account/edit',
                        label: t('edit'),
                    },
                ]}
            />
            <AccountEditPage />
        </div>
    )
}
