// TimelineItem.tsx

import { CheckCircle, Eye } from 'lucide-react'
import Link from 'next/link'

import { getScopedI18n } from '@/app/locales/server'
import { cn } from '@/utils'

import { buttonVariants } from './button'

interface TimelineItemProps {
    title: string
    date: string
    latest?: boolean
    link?: string
    isCheck?: boolean
    image?: string
    isCurrent?: boolean
}

const TimelineItem: React.FC<TimelineItemProps> = async ({
    title,
    date,
    latest,
    link,
    isCheck,
    image,
    isCurrent,
}) => {
    const t = await getScopedI18n('TimelineItem')
    return (
        <li className="mb-10 ms-6 space-y-2">
            <span className="absolute flex items-center justify-center w-6 h-6 bg-blue-100 rounded-full -start-3 ring-8 ring-white dark:ring-gray-900 dark:bg-blue-900">
                <svg
                    className="w-2.5 h-2.5 text-blue-800 dark:text-blue-300"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path d="M20 4a2 2 0 0 0-2-2h-2V1a1 1 0 0 0-2 0v1h-3V1a1 1 0 0 0-2 0v1H6V1a1 1 0 0 0-2 0v1H2a2 2 0 0 0-2 2v2h20V4ZM0 18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8H0v10Zm5-8h10a1 1 0 0 1 0 2H5a1 1 0 0 1 0-2Z" />
                </svg>
            </span>
            <h3 className="flex items-center mb-1 text-lg font-semibold text-gray-900 dark:text-white">
                {title}
                {latest && (
                    <span className="bg-blue-100 text-blue-800 text-sm font-medium me-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300 ms-3">
                        {t('current')}
                    </span>
                )}
                {isCheck && (
                    <CheckCircle className="w-5 h-5 ml-2 text-green-500 dark:text-green-400" />
                )}
            </h3>
            <time className="block mb-2 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">
                {date}
            </time>

            {image && (
                <img
                    src={image}
                    alt={title}
                    className="block w-full h-48 object-cover rounded-lg"
                />
            )}

            {link && (
                <Link
                    href={link}
                    className={cn(
                        buttonVariants({ variant: 'outline' }),
                        'w-full',
                        !isCurrent && ' bg-primary text-white',
                        isCheck && 'bg-green-500 text-white dark:bg-green-600 dark:text-white'
                    )}
                >
                    {isCurrent ? (
                        <>
                            <Eye className="w-4 h-4 me-2" />
                            {t('viewLesson')}
                        </>
                    ) : isCheck ? (
                        <CheckCircle className="w-4 h-4 me-2" />
                    ) : (
                        t('viewLesson')
                    )}
                </Link>
            )}
        </li>
    )
}

export default TimelineItem
