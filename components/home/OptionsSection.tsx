import { Cloud, DollarSign, Heart, HelpCircle, LineChart, Route, Settings2Icon, Terminal } from 'lucide-react'

import { cn } from '@/utils'

export default function OptionsSection() {
    const features = [
        {
            title: 'Built for All Learners',
            description:
        'From beginners to experts, our platform supports every learning journey.',
            icon: <Terminal />,
        },
        {
            title: 'Ease of use',
            description:
        'User-friendly interface that makes learning as simple and engaging as it should be.',
            icon: <LineChart />,
        },
        {
            title: 'Affordable Pricing',
            description:
        'Competitive rates with no hidden fees. Choose what works best for you.',
            icon: <DollarSign />,
        },
        {
            title: 'Unmatched Uptime',
            description: 'Reliable and always accessible, so you can learn whenever and wherever you want.',
            icon: <Cloud />,
        },
        {
            title: 'Build with Next.js',
            description: 'Next.js is a React framework that makes it easy to build fast, production-ready web applications.',
            icon: <Route />,
        },
        {
            title: '24/7 Customer Support',
            description:
        'Our team is always here to help, around the clock.',
            icon: <HelpCircle />,
        },
        {
            title: 'Satisfaction Guaranteed',
            description:
        'Money-back guarantee if our service doesn’t meet your expectations.',
            icon: <Settings2Icon />,
        },
        {
            title: 'Build with love',
            description: 'We are a team of passionate individuals who love what we do.',
            icon: <Heart />,
        },

    ]
    return (
        <div className="py-12 lg:py-24 relative">
            <h3 className="text-3xl lg:text-5xl lg:leading-tight max-w-5xl mx-auto text-center tracking-tight font-medium text-black dark:text-white">
            Don’t Miss Out! Join this amazing platform today.
            </h3>
            <p className="text-sm lg:text-base  max-w-2xl  my-4 mx-auto text-neutral-500 text-center font-normal dark:text-neutral-300">
            Be part of an educational revolution. Subscribe now and unlock your potential with our AI-powered LMS.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4  relative z-10 py-10 max-w-7xl mx-auto">
                {features.map((feature, index) => (
                    <Feature key={feature.title} {...feature} index={index} />
                ))}
            </div>
        </div>
    )
}

const Feature = ({
    title,
    description,
    icon,
    index,
}: {
    title: string;
    description: string;
    icon: React.ReactNode;
    index: number;
}) => {
    return (
        <div
            className={cn(
                'flex flex-col lg:border-r  py-10 relative group/feature dark:border-neutral-800',
                (index === 0 || index === 4) && 'lg:border-l dark:border-neutral-800',
                index < 4 && 'lg:border-b dark:border-neutral-800'
            )}
        >
            {index < 4 && (
                <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-t from-neutral-100 dark:from-neutral-800 to-transparent pointer-events-none" />
            )}
            {index >= 4 && (
                <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-b from-neutral-100 dark:from-neutral-800 to-transparent pointer-events-none" />
            )}
            <div className="mb-4 relative z-10 px-10 text-neutral-600 dark:text-neutral-400">
                {icon}
            </div>
            <div className="text-lg font-bold mb-2 relative z-10 px-10">
                <div className="absolute left-0 inset-y-0 h-6 group-hover/feature:h-8 w-1 rounded-tr-full rounded-br-full bg-neutral-300 dark:bg-neutral-700 group-hover/feature:bg-primary transition-all duration-200 origin-center" />
                <span className="group-hover/feature:translate-x-2 transition duration-200 inline-block text-neutral-800 dark:text-neutral-100">
                    {title}
                </span>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-xs relative z-10 px-10">
                {description}
            </p>
        </div>
    )
}
