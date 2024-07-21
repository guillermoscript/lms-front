import { ApiResponse } from '@/actions/actions'

export function createResponse<T>(
    status: 'success' | 'error' | 'idle',
    message: string,
    data?: T,
    error?: any
): ApiResponse<T> {
    return {
        status,
        message,
        data,
        error,
    }
}

export interface TocHeading {
    text: string
    id: string
    level: number
}

export const extractHeadings = (markdown: string): TocHeading[] => {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm
    const headings: TocHeading[] = []

    let match
    while ((match = headingRegex.exec(markdown)) !== null) {
        const [, hashes, text] = match
        const level = hashes.length
        const id = text.replace(/\s+/g, '-').toLowerCase()
        headings.push({ text, id, level })
    }

    return headings
}
