'use client' // Error components must be Client Components

import { useEffect } from 'react'

import GenericError from '@/components/GenericError'

export default function Error ({
    error,
    reset
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
    // Log the error to an error reporting service
        console.error(error)
    }, [error])

    return (
        <GenericError
            retry={reset}
            title="Oh no! An error occurred in the lessons page"
            description={error.message}
        />
    )
}
