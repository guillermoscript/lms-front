'use client' // Error components must be Client Components

import { useScopedI18n } from '@/app/locales/client'
import GenericError from '@/components/GenericError'

export default function Error ({
    error,
    reset
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const t = useScopedI18n('errorPages.dashboard')

    return (
        <GenericError
            retry={reset}
            title={t('courses')}
            description={error.message}
        />
    )
}
