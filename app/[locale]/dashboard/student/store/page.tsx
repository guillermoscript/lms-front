import { getTranslations } from 'next-intl/server'
import { StoreSection } from '@/components/gamification/store-section'

export default async function StorePage() {
    const t = await getTranslations('dashboard.student.store')

    return (
        <div className="container mx-auto py-8 px-4 max-w-7xl" data-testid="store-page">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
                <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
            </div>

            <StoreSection />
        </div>
    )
}
