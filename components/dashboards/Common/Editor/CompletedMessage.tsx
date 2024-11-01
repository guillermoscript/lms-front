'use client'
import { useScopedI18n } from '@/app/locales/client'
import { Star } from 'lucide-react'

export default function CompletedMessage() {
    const t = useScopedI18n('CompletedMessage')
    return (
        <div className="flex items-center justify-center h-20">
            <div className="flex items-center space-x-2">
                <p className="text-lg font-semibold text-green-500">
                    {t('completedMessage')}
                </p>
                <Star className="w-6 h-6 text-yellow-500" />
            </div>
        </div>
    )
}
