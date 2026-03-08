'use client'

import { useState } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AristotleStudyTab } from './aristotle-study-tab'
import { useTranslations } from 'next-intl'

interface AristotleStudySectionProps {
    courseId: number
}

export function AristotleStudySection({ courseId }: AristotleStudySectionProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const t = useTranslations('aristotle')

    if (!isExpanded) {
        return (
            <div className="mt-10">
                <button
                    onClick={() => setIsExpanded(true)}
                    className="w-full group text-left rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-5 transition-colors hover:bg-amber-50 dark:hover:bg-amber-950/30"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl leading-none" aria-hidden>&#966;</span>
                            <div>
                                <h3 className="font-semibold">{t('studySessionTitle')}</h3>
                                <p className="text-sm text-muted-foreground mt-0.5">{t('studySessionDesc')}</p>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" className="shrink-0 gap-1.5 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30">
                            {t('startSession')}
                            <IconChevronDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" />
                        </Button>
                    </div>
                </button>
            </div>
        )
    }

    return (
        <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl leading-none" aria-hidden>&#966;</span>
                    <h2 className="text-lg font-semibold">{t('studySessionTitle')}</h2>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => setIsExpanded(false)}
                >
                    {t('hideChat')}
                </Button>
            </div>
            <AristotleStudyTab courseId={courseId} />
        </div>
    )
}
