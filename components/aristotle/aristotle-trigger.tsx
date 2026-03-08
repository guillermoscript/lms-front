'use client'

import { useAristotleOptional } from './aristotle-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

export function AristotleTrigger() {
    const aristotle = useAristotleOptional()
    const t = useTranslations('aristotle')

    if (!aristotle?.isEnabled) return null

    return (
        <Button
            onClick={aristotle.toggle}
            className={cn(
                'fixed bottom-6 right-6 z-40 h-13 gap-2 rounded-full px-5 shadow-lg transition-all hover:shadow-xl active:scale-95',
                aristotle.isOpen
                    ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                    : 'bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-amber-950'
            )}
            aria-label={aristotle.isOpen ? t('close') : t('open')}
        >
            <span className="text-lg" aria-hidden>&#966;</span>
            <span className="text-sm font-semibold hidden sm:inline">
                {aristotle.isOpen ? t('close') : t('trigger')}
            </span>
        </Button>
    )
}
