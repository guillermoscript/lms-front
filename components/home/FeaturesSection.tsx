'use client'
import { motion } from 'framer-motion'
import Link from 'next/link'
import React from 'react'

import { cn } from '@/utils'

export function FeaturesSection() {
    const features = [
        {
            title: 'AI-Powered Lesson Reviews',
            description:
        'Get instant feedback from our artificial intelligence on your assigned tasks. Complete your lessons with confidence, knowing you’ll receive real-time suggestions for improvement or an immediate pass when you’ve mastered the material.',
            skeleton: <SkeletonOne />,
            className:
        'col-span-1 lg:col-span-4 border-b lg:border-r dark:border-neutral-800',
        },
        {
            title: 'Professional Content Creation',
            description:
        'Every lesson is crafted by industry professionals to ensure high-quality, relevant content that stays current with trends and best practices.',
            skeleton: <SkeletonTwo />,
            className: 'border-b col-span-1 lg:col-span-2 dark:border-neutral-800',
        },
        {
            title: 'Advanced Interactive Exams',
            description:
        'Transform your preparation with AI-generated exam forms, featuring various question types – from multiple choice to free text. Submit your answers for immediate AI evaluation and detailed feedback',
            skeleton: <SkeletonThree />,
            className:
        'col-span-1 lg:col-span-3 lg:border-r  dark:border-neutral-800',
        },
        {
            title: 'Fully Generative UI AI Chat',
            description:
        'Engage with the most advanced AI language models in our chat interface. Get instant answers to your questions, personalized recommendations, and more.',
            skeleton: <SkeletonFour />,
            className: 'col-span-1 lg:col-span-3 border-b lg:border-none',
        },
    ]
    return (
        <div className="relative z-20 py-10 lg:py-32 max-w-7xl mx-auto">
            <div className="px-8">
                <h4 className="text-3xl lg:text-5xl lg:leading-tight max-w-5xl mx-auto text-center tracking-tight font-medium text-black dark:text-white">
                Packed with Innovative Features
                </h4>

                <p className="text-sm lg:text-base  max-w-2xl  my-4 mx-auto text-neutral-500 text-center font-normal dark:text-neutral-300">

Experience educational excellence with a suite of powerful AI-driven tools designed to personalize and enhance your learning journey.
                </p>
            </div>

            <div className="relative ">
                <div className="grid grid-cols-1 lg:grid-cols-6 mt-12 xl:border rounded-md dark:border-neutral-800">
                    {features.map((feature) => (
                        <FeatureCard key={feature.title} className={feature.className}>
                            <FeatureTitle>{feature.title}</FeatureTitle>
                            <FeatureDescription>{feature.description}</FeatureDescription>
                            <div className=" h-full w-full">{feature.skeleton}</div>
                        </FeatureCard>
                    ))}
                </div>
            </div>
        </div>
    )
}

const FeatureCard = ({
    children,
    className,
}: {
    children?: React.ReactNode;
    className?: string;
}) => {
    return (
        <div className={cn('p-4 sm:p-8 relative overflow-hidden', className)}>
            {children}
        </div>
    )
}

const FeatureTitle = ({ children }: { children?: React.ReactNode }) => {
    return (
        <p className=" max-w-5xl mx-auto text-left tracking-tight text-black dark:text-white text-xl md:text-2xl md:leading-snug">
            {children}
        </p>
    )
}

const FeatureDescription = ({ children }: { children?: React.ReactNode }) => {
    return (
        <p
            className={cn(
                'text-sm md:text-base  max-w-4xl text-left mx-auto',
                'text-neutral-500 text-center font-normal dark:text-neutral-300',
                'text-left max-w-sm mx-0 md:text-sm my-2'
            )}
        >
            {children}
        </p>
    )
}

export const SkeletonOne = () => {
    return (
        <div className="relative flex py-8 px-2 gap-10 h-full">
            <div className="w-full mx-auto group h-full">
                <div className="flex flex-1 w-full h-full flex-col space-y-2  ">
                    {/* TODO */}
                    <img
                        src="/img/feature(3).png"
                        alt="header"
                        className="h-full w-full object-cover"
                    />
                </div>
            </div>
        </div>
    )
}

export const SkeletonThree = () => {
    return (
        <Link
            href="/plans"
            target="__blank"
            className="relative flex gap-10  h-full group/image"
        >
            <div className="w-full  mx-auto bg-transparent dark:bg-transparent group h-full">
                <div className="flex flex-1 w-full h-full flex-col space-y-2  relative">
                    {/* TODO */}
                    <img
                        src="/img/feature(1).png"
                        alt="ai"
                        className="h-full w-full aspect-square object-cover object-center rounded-sm"
                    />
                </div>
            </div>
        </Link>
    )
}

export const SkeletonTwo = () => {
    const images = [
        '/img/feature(4).png',
        '/img/feature(1).png',
        '/img/feature(5).png',
        '/img/feature(2).png',
        '/img/feature(3).png',
    ]

    const imageVariants = {
        whileHover: {
            scale: 1.1,
            rotate: 0,
            zIndex: 100,
        },
        whileTap: {
            scale: 1.1,
            rotate: 0,
            zIndex: 100,
        },
    }
    return (
        <div className="relative flex flex-col items-start p-8 gap-10 h-full overflow-hidden">
            {/* TODO */}
            <div className="flex flex-row -ml-20">
                {images.map((image, idx) => (
                    <motion.div
                        variants={imageVariants}
                        key={'images-first' + idx}
                        style={{
                            rotate: Math.random() * 20 - 10,
                        }}
                        whileHover="whileHover"
                        whileTap="whileTap"
                        className="rounded-xl -mr-4 mt-4 p-1 bg-white dark:bg-neutral-800 dark:border-neutral-700 border border-neutral-100 flex-shrink-0 overflow-hidden"
                    >
                        <img
                            src={image}
                            alt="bali images"
                            width="500"
                            height="500"
                            className="rounded-lg h-20 w-20 md:h-40 md:w-40 object-cover flex-shrink-0"
                        />
                    </motion.div>
                ))}
            </div>
            <div className="flex flex-row">
                {images.map((image, idx) => (
                    <motion.div
                        key={'images-second' + idx}
                        style={{
                            rotate: Math.random() * 20 - 10,
                        }}
                        variants={imageVariants}
                        whileHover="whileHover"
                        whileTap="whileTap"
                        className="rounded-xl -mr-4 mt-4 p-1 bg-white dark:bg-neutral-800 dark:border-neutral-700 border border-neutral-100 flex-shrink-0 overflow-hidden"
                    >
                        <img
                            src={image}
                            alt="bali images"
                            width="500"
                            height="500"
                            className="rounded-lg h-20 w-20 md:h-40 md:w-40 object-cover flex-shrink-0"
                        />
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

export const SkeletonFour = () => {
    return (
        <div className="flex flex-col items-center relative bg-transparent dark:bg-transparent mt-10">
            <img
                src="/img/feature(2).png"
                alt="hero"
                className="h-full w-full object-cover object-left-top rounded-sm"
            />
        </div>
    )
}
