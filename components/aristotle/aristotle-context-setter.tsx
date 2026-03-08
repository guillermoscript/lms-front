'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAristotleOptional } from './aristotle-provider'

/**
 * Automatically updates Aristotle's context page when the student navigates.
 * Place this inside the course layout — it reads the current pathname.
 */
export function AristotleContextSetter({ pageLabel }: { pageLabel?: string }) {
    const pathname = usePathname()
    const aristotle = useAristotleOptional()

    useEffect(() => {
        if (aristotle) {
            aristotle.setContextPage(pathname)
            aristotle.setContextLabel(pageLabel || null)
        }
    }, [pathname, pageLabel, aristotle])

    return null
}
