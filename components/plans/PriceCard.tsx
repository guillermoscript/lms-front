// PriceCard.tsx

// Pricing.tsx
import Link from 'next/link'
import React from 'react'

import { cn } from '@/utils'

import { buttonVariants } from '../ui/button'

interface Feature {
    text: string;
}

interface PriceCardProps {
    title: string;
    price: number;
    description: string;
    features: Feature[];
    buttonText: string;
    isHighlighted?: boolean;
    periodicity: string;
    id: number;
}

const PriceCard: React.FC<PriceCardProps> = ({ title, price, description, features, buttonText, isHighlighted, periodicity, id }) => {
    const cardClass = isHighlighted
        ? 'relative shadow-2xl rounded-lg px-6 py-8 sm:mx-8 lg:mx-0 h-full flex flex-col justify-between text-white'
        : 'bg-white dark:bg-[var(--card)] rounded-lg border px-6 py-8 sm:mx-8 lg:mx-0 h-full flex flex-col justify-between text-[var(--foreground)] dark:text-[var(--card-foreground)]'
    const buttonClass = isHighlighted
        ? buttonVariants({ variant: 'default' }) + 'relative z-10 border border-transparent md:text-sm transition duration-200 items-center justify-center shadow-sm focus-visible:outline-white mt-8 rounded-full py-2.5 px-3.5 text-center text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:mt-10 block w-full'
        : ' relative z-10  border dark:text-white  md:text-sm transition duration-200 items-center justify-center shadow-[0px_-1px_0px_0px_#FFFFFF40_inset,_0px_1px_0px_0px_#FFFFFF40_inset] mt-8 rounded-full py-2.5 px-3.5 text-center text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:mt-10 block w-full hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:border-neutral-700 dark:hover:border-neutral-700'
    return (
        <div className={cardClass}>
            <div>
                <h3 id={`tier-${title.toLowerCase()}`} className={`text-base font-semibold leading-7 ${isHighlighted ? ' text-neutral-700 dark:text-neutral-300' : 'text-muted dark:text-muted-dark'}`}>
                    {title}
                </h3>
                <p className="mt-4">
                    <span className={cn('text-4xl font-bold tracking-tight inline-block', isHighlighted ? 'text-primary' : 'text-neutral-900 dark:text-neutral-200')} >
                        {price} / {periodicity}
                    </span>
                </p>
                <p className="text-[var(--muted-foreground)] mt-6 text-sm leading-7 h-12 md:h-12 xl:h-12">
                    {description}
                </p>
                <ul role="list" className={`mt-8 space-y-3 text-sm leading-6 ${isHighlighted ? 'text-neutral-700 dark:text-neutral-300' : 'text-neutral-600 dark:text-neutral-300'} sm:mt-10`}>
                    {features.map((feature, index) => (
                        <li key={index} className="flex gap-x-3">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`h-6 w-5 flex-none ${isHighlighted ? 'text-neutral-700 dark:text-neutral-300' : 'text-muted dark:text-muted-dark'}`} aria-hidden="true">
                                <path d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z"></path>
                            </svg>
                            {feature.text}
                        </li>
                    ))}
                </ul>
            </div>
            <div>
                <Link
                    href={`/plans/${id}`}
                    className={buttonClass} aria-describedby={`tier-${title.toLowerCase()}`}
                >
                    {buttonText}
                </Link>
            </div>
        </div>
    )
}

export default PriceCard
