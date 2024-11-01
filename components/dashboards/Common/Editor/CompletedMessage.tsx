'use client'
import { Star } from 'lucide-react'

import { useScopedI18n } from '@/app/locales/client'

export default function CompletedMessage() {
    const t = useScopedI18n('CompletedMessage')
    return (
        <div className="flex flex-col gap-4 items-center justify-center">
            <div className="flex items-center space-x-2">
                <h4 className="text-lg font-semibold text-green-500">
                    {t('title')}
                </h4>
                <Star className="w-6 h-6 text-yellow-500" />
            </div>
            <p className="text-md text-muted-foreground">
                {t('description')}
            </p>
        </div>
    )
}
