import { getTranslations } from 'next-intl/server'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import { StoreExplorer } from '@/components/student/store-explorer'

export default async function StorePage() {
    const t = await getTranslations('dashboard.student.store')

    return (
        <PageShell variant="wide" data-testid="store-page">
            <PageHeader title={t('title')} description={t('subtitle')} />

            <StoreExplorer />
        </PageShell>
    )
}
