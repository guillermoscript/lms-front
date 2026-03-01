import { getTranslations } from 'next-intl/server'
import { StoreSection } from '@/components/gamification/store-section'
import { IconCoins } from '@tabler/icons-react'

export default async function StorePage() {
    const t = await getTranslations('dashboard.student.store')

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/50 pb-20" data-testid="store-page">
            <main className="container mx-auto px-4 md:px-8 py-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                            <IconCoins size={32} className="stroke-[2.5]" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black tracking-tight">{t('title')}</h1>
                            <p className="text-muted-foreground font-medium">{t('subtitle')}</p>
                        </div>
                    </div>
                </div>

                <StoreSection />
            </main>
        </div>
    )
}
