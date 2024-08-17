import Link from 'next/link'

import { buttonVariants } from '../ui/button'

const HeroSection = () => {
    return (
        <div className="flex flex-col-reverse lg:flex-row items-center space-y-4 lg:space-y-0 lg:space-x-4 min-h-[calc(70vh-5rem)]">
            <div className="flex flex-col items-start space-y-4 w-full lg:w-3/4 lg:pr-4">
                <Tittle />
                <Description />
                <EmailForm />
            </div>
            <Illustration />
        </div>
    )
}

const Tittle = () => {
    return (
        <h1 className="text-4xl font-bold leading-tight lg:text-5xl">
        Building Your Future with AI-Powered Learning
        </h1>
    )
}

const Description = () => {
    return (
        <p className="text-lg ">
            Dive into expertly crafted courses spanning from English to advanced programming, guided by AI and human experts to maximize your potential.
        </p>
    )
}

const EmailForm = () => {
    return (
        <div className="flex flex-col space-y-4 z-10">
            <div className="flex flex-wrap gap-2">
                <Link
                    href='/plans'
                    className={buttonVariants({ variant: 'default' })}
                >
                    Get Started
                </Link>
                <a
                    href='https://yodxlomcjzw.typeform.com/to/KkrKaZWu'
                    className={buttonVariants({ variant: 'secondary' })}
                >
                    Join Waitlist
                </a>
            </div>
        </div>
    )
}

const Illustration = () => {
    return (
        <div className="w-full lg:w-3/4">
            <img
                src="/img/hero.png"
                alt="Robot learning"
                className="w-full object-cover object-center"
            />
        </div>
    )
}

export default HeroSection
