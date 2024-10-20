'use client'
import React, { useEffect } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { extractHeadings } from '@/utils/functions'

interface TableOfContentsProps {
    markdown: string
}

const TableOfContents: React.FC<TableOfContentsProps> = ({
    markdown,
}) => {
    const headings = extractHeadings(markdown)

    const t = useScopedI18n('TableOfContents')

    useEffect(() => {
        const handleIntersection = (entries: IntersectionObserverEntry[]) => {
            entries.forEach((entry) => {
                const id = entry.target.id
                const tocLink = document.querySelector(`a[href="#${id}"]`)
                if (entry.isIntersecting) {
                    tocLink?.classList.add('bg-gray-200')
                } else {
                    tocLink?.classList.remove('bg-gray-200')
                }
            })
        }

        const observer = new IntersectionObserver(handleIntersection, {
            rootMargin: '-50% 0% -50% 0%',
        })

        headings.forEach((heading) => {
            const element = document.getElementById(heading.id)
            if (element) observer.observe(element)
        })

        return () => observer.disconnect()
    }, [headings])

    return (
        <nav className={'p-6'}>
            <h2 className="font-bold text-xl mb-4">
                {t('title')}
            </h2>
            <ul className="space-y-2">
                {headings.map((heading, index) => (
                    <li
                        key={heading.id}
                        className="flex items-center border rounded p-2 transition duration-200 dark:hover:bg-gray-700 hover:bg-gray-100"
                    >
                        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full font-bold mr-3">
                            {index + 1}
                        </span>
                        <a
                            href={`#${heading.id}`}
                            className="flex-grow hover:underline"
                        >
                            {heading.text}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    )
}

export default TableOfContents
