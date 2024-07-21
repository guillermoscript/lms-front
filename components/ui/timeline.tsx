// TimelineItem.tsx

import { CheckCircle, View } from 'lucide-react'
import Link from 'next/link'

interface TimelineItemProps {
    title: string;
    date: string;
    description: string;
    latest?: boolean;
    link?: string;
    isCheck?: boolean;
}

const TimelineItem: React.FC<TimelineItemProps> = ({ title, date, description, latest, link, isCheck }) => (
    <li className="mb-10 ms-6">
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
          Current
                </span>
            )}
            {isCheck && (
                <CheckCircle className="w-5 h-5 ml-2 text-green-500 dark:text-green-400" />
            )}
        </h3>
        <time className="block mb-2 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">
            {date}
        </time>
        <p className="mb-4 text-base font-normal text-gray-500 dark:text-gray-400">
            {description}
        </p>
        {link && (
            <Link
                href={link}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:outline-none focus:ring-gray-100 focus:text-blue-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700 dark:focus:ring-gray-700"
            >
                <View className="w-4 h-4 me-2" />
                View
            </Link>
        )}
    </li>
)

export default TimelineItem
