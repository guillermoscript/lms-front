'use client' // Error components must be Client Components

import { useEffect } from 'react'

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

    useEffect(() => {
    // Log the error to an error reporting service
        console.error(error)
    }, [error])

    return (
        <GenericError
            retry={reset}
            title={t('exams')}
            description={error.message}
        />
    )
}
