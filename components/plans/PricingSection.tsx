// PriceCard.tsx

// Pricing.tsx
import React from 'react'

interface Feature {
    text: string;
}

interface PriceCardProps {
    title: string;
    price: string;
    description: string;
    features: Feature[];
    buttonText: string;
    isHighlighted?: boolean;
}

const PriceCard: React.FC<PriceCardProps> = ({ title, price, description, features, buttonText, isHighlighted }) => {
    const cardClass = isHighlighted
        ? 'relative bg-[var(--primary)] shadow-2xl rounded-lg px-6 py-8 sm:mx-8 lg:mx-0 h-full flex flex-col justify-between text-white'
        : 'bg-white dark:bg-[var(--card)] rounded-lg px-6 py-8 sm:mx-8 lg:mx-0 h-full flex flex-col justify-between text-[var(--foreground)] dark:text-[var(--card-foreground)]'
    const buttonClass = isHighlighted
        ? 'relative z-10 border border-transparent md:text-sm transition duration-200 items-center justify-center bg-white text-[var(--primary-foreground)] shadow-sm hover:bg-white/90 focus-visible:outline-white mt-8 rounded-full py-2.5 px-3.5 text-center text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:mt-10 block w-full'
        : 'bg-[var(--primary)] relative z-10 hover:bg-[var(--primary)]/90 border border-transparent text-white md:text-sm transition duration-200 items-center justify-center shadow-[0px_-1px_0px_0px_#FFFFFF40_inset,_0px_1px_0px_0px_#FFFFFF40_inset] mt-8 rounded-full py-2.5 px-3.5 text-center text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:mt-10 block w-full'
    return (
        <div className={cardClass}>
            <div>
                <h3 id={`tier-${title.toLowerCase()}`} className={`text-base font-semibold leading-7 ${isHighlighted ? 'text-white' : 'text-muted dark:text-muted-dark'}`}>
                    {title}
                </h3>
                <p className="mt-4">
                    <span className="text-4xl font-bold tracking-tight inline-block" style={{ color: isHighlighted ? 'text-white' : 'text-neutral-900 dark:text-neutral-200' }}>
                        {price}
                    </span>
                </p>
                <p className="text-[var(--muted-foreground)] mt-6 text-sm leading-7 h-12 md:h-12 xl:h-12">
                    {description}
                </p>
                <ul role="list" className={`mt-8 space-y-3 text-sm leading-6 ${isHighlighted ? 'text-neutral-300' : 'text-neutral-600 dark:text-neutral-300'} sm:mt-10`}>
                    {features.map((feature, index) => (
                        <li key={index} className="flex gap-x-3">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`h-6 w-5 flex-none ${isHighlighted ? 'text-white' : 'text-muted dark:text-muted-dark'}`} aria-hidden="true">
                                <path d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z"></path>
                            </svg>
                            {feature.text}
                        </li>
                    ))}
                </ul>
            </div>
            <div>
                <button className={buttonClass} aria-describedby={`tier-${title.toLowerCase()}`}>
                    {buttonText}
                </button>
            </div>
        </div>
    )
}

// export default PriceCard

const Pricing: React.FC = () => {
    const pricingData = [
        {
            title: 'Hobby',
            price: '$4/mo',
            description: 'Best for developers trying to use the platform.',
            features: [
                { text: '5 API requests per day' },
                { text: 'Access to basic API endpoints' },
                { text: 'Email support within 48 hours' },
                { text: 'Community forum access' },
                { text: 'Monthly newsletter' },
            ],
            buttonText: 'Browse Components',
            isHighlighted: false,
        },
        {
            title: 'Starter',
            price: '$8/mo',
            description: 'Perfect for small businesses',
            features: [
                { text: 'Everything in Hobby, plus' },
                { text: '50 API requests per day' },
                { text: 'Access to advanced API endpoints' },
                { text: 'Email support within 24 hours' },
                { text: 'Community forum access' },
                { text: 'Self hosting options' },
            ],
            buttonText: 'Buy Now',
            isHighlighted: false,
        },
        {
            title: 'Professional',
            price: '$12/mo',
            description: 'Ideal for small to mid range startups',
            features: [
                { text: 'Everything in Starter, plus' },
                { text: '500 API requests per day' },
                { text: 'Access to super advanced API endpoints' },
                { text: 'Email support within 12 hours' },
                { text: 'Private Community access' },
                { text: 'Monthly retreats' },
                { text: 'Self hosting options' },
                { text: 'Private infrastructure' },
                { text: 'On-Prem deployments' },
            ],
            buttonText: 'Buy Now',
            isHighlighted: true,
        },
        {
            title: 'Enterprise',
            price: 'Contact Us',
            description: 'Best for big fortune 500 companies.',
            features: [
                { text: 'Everything in Professional, plus' },
                { text: '500K API requests per day' },
                { text: 'Access to super advanced API endpoints' },
                { text: 'Email support within 12 hours' },
                { text: 'Private Community access' },
                { text: 'Monthly retreats' },
                { text: 'Self hosting options' },
                { text: 'Private infrastructure' },
                { text: 'On-Prem deployments' },
                { text: 'I retweet your tweets personally' },
            ],
            buttonText: 'Contact Us',
            isHighlighted: false,
        },
    ]

    return (
        <div className="mx-auto mt-4 md:mt-20 grid relative z-20 grid-cols-1 gap-4 items-center md:grid-cols-2 xl:grid-cols-4">
            {pricingData.map((card, index) => (
                <PriceCard
                    key={index}
                    title={card.title}
                    price={card.price}
                    description={card.description}
                    features={card.features}
                    buttonText={card.buttonText}
                    isHighlighted={card.isHighlighted}
                />
            ))}
        </div>
    )
}

export default Pricing
