'use client'
import { useChangeLocale, useCurrentLocale, useScopedI18n } from '@/app/locales/client'

import { Button } from './button'

export default function LocaleButtons() {
    const t = useScopedI18n('footer')

    const locale = useCurrentLocale()
    const changeLocale = useChangeLocale()

    return (
        <div className="flex gap-2">
            <Button
                className={'px-2 py-1 rounded'}
                variant={locale === 'en' ? 'default' : 'outline'}
                onClick={() => changeLocale('en')}
            >
            EN
            </Button>
            <Button
                className={'px-2 py-1 rounded'}
                variant={locale === 'es' ? 'default' : 'outline'}
                onClick={() => changeLocale('es')}
            >
            ES
            </Button>
        </div>
    )
}
