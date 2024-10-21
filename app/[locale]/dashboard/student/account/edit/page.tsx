import { getScopedI18n } from '@/app/locales/server'
import AccountEditPage from '@/components/dashboards/Common/account/AccountEditPage'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'

export default async function Dashboard () {
    const t = await getScopedI18n('BreadcrumbComponent')

    return (
        <div className="container mx-auto">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('dashboard') },
                    { href: '/dashboard/student', label: t('student') },
                    {
                        href: '/dashboard/student/account/',
                        label: t('account'),
                    },
                    {
                        href: '/dashboard/student/account/edit',
                        label: t('edit'),
                    },
                ]}
            />
            <AccountEditPage />
        </div>
    )
}
