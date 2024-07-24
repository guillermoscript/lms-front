import React from 'react'

interface FeatureProps {
    feature: string
    primary: boolean
}

const Feature: React.FC<FeatureProps> = ({ feature, primary }) => (
    <li className="flex gap-x-3">
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
            className={`tabler-icon tabler-icon-circle-check-filled ${
                primary ? 'text-primary-dark' : 'text-secondary-dark'
            } h-6 w-5 flex-none`}
            aria-hidden="true"
        >
            <path d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z"></path>
        </svg>
        {feature}
    </li>
)

interface TierCardProps {
    id: string
    title: string
    price: string
    description: string
    features: string[]
    buttonLabel: string
    buttonAction: () => void
    primary?: boolean
}

const TierCard: React.FC<TierCardProps> = ({
    id,
    title,
    price,
    description,
    features,
    buttonLabel,
    buttonAction,
    primary,
}) => (
    <div
        className={`bg-white dark:bg-black rounded-lg px-6 py-8 sm:mx-8 lg:mx-0 h-full flex flex-col justify-between ${
            primary
                ? 'relative bg-primary shadow-2xl text-white'
                : 'text-neutral-600'
        }`}
    >
        <div>
            <h3
                id={id}
                className={`text-base font-semibold leading-7 ${
                    primary ? 'text-white' : 'text-secondary-dark'
                }`}
            >
                {title}
            </h3>
            <p className="mt-4">
                <span
                    className={`text-4xl font-bold tracking-tight inline-block ${
                        primary ? 'text-white' : 'text-neutral-900'
                    } dark:text-neutral-200`}
                    style={{ opacity: 1, transform: 'none' }}
                >
                    {price}
                </span>
            </p>
            <p
                className={`mt-6 text-sm leading-7 h-12 ${
                    primary ? 'text-neutral-300' : 'text-secondary'
                }`}
            >
                {description}
            </p>
            <ul
                role="list"
                className={`mt-8 space-y-3 text-sm leading-6 sm:mt-10 ${
                    primary ? 'text-neutral-300' : 'text-secondary'
                }`}
            >
                {features.map((feature, index) => (
                    <Feature
                        key={index}
                        feature={feature}
                        primary={primary || false}
                    />
                ))}
            </ul>
        </div>
        <div>
            <button
                className={`mt-8 rounded-full py-2.5 px-3.5 text-center text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:mt-10 block w-full ${
                    primary
                        ? 'bg-white text-black shadow-sm hover:bg-white/90'
                        : 'bg-neutral-900 text-white hover:bg-black/90'
                } transition duration-200 items-center justify-center shadow-[0px_-1px_0px_0px_#FFFFFF40_inset,_0px_1px_0px_0px_#FFFFFF40_inset]`}
            >
                {buttonLabel}
            </button>
        </div>
    </div>
)

export default TierCard
