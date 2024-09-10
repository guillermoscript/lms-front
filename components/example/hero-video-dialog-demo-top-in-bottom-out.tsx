import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { getI18n } from '@/app/locales/server'
import HeroVideoDialog from '@/components/magicui/HeroVideoDialog'

import { buttonVariants } from '../ui/button'

// Animated text component
const AnimatedText = ({
    children,
    className,
}: {
    children: string
    className?: string
}) => {
    return (
        <span
            className={`inline-block ${className}`}
            data-br={`:R${Math.random().toString(36).substr(2, 9)}:`}
            data-brr="1"
        >
            {children}
        </span>
    )
}

// Notification banner component
const NotificationBanner = ({ message }: { message: string }) => {
    return (
        <div className="flex justify-center">
            <Link
                href="#"
                className="bg-neutral-50 dark:bg-neutral-700 no-underline group cursor-pointer relative shadow-zinc-900 rounded-full p-px text-xs font-semibold leading-6 text-neutral-700 dark:text-neutral-300 inline-block"
            >
                <div className="relative flex space-x-2 items-center z-10 rounded-full bg-neutral-100 dark:bg-neutral-800 py-1.5 px-4 ring-1 ring-white/10">
                    <span>{message}</span>
                    <ChevronRight size={16} />
                </div>
            </Link>
        </div>
    )
}

export default async function HeroVideoDialogDemoTopInBottomOut() {
    const t = await getI18n()

    return (
        <div className="flex flex-col md:pt-20 pt-10 items-center space-y-4 md:gap-7 gap-2 lg:space-y-0 lg:space-x-4 min-h-[calc(70vh-5rem)]">
            <NotificationBanner message={t('landing.betaBadge')} />

            <h1 className="text-2xl md:text-4xl lg:text-8xl font-semibold max-w-6xl mx-auto text-center mt-6 relative z-10">
                <a href="https://yodxlomcjzw.typeform.com/to/L0FbgHZK">
                    <AnimatedText>{t('landing.title')}</AnimatedText>
                </a>
            </h1>

            <p className="text-center mt-6 text-base md:text-xl opacity-90 max-w-3xl mx-auto relative z-10">
                <AnimatedText>
                    {t('landing.description')}
                </AnimatedText>
            </p>

            <div className="flex items-center gap-4 justify-center mt-6 relative z-10">
                <a
                    href="https://yodxlomcjzw.typeform.com/to/L0FbgHZK"
                    className={buttonVariants({ variant: 'default' })}
                >
                    {t('landing.getEarlyAccess')}
                </a>
            </div>
            <div className="relative text-center">
                <div className="p-4 border border-neutral-200 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700 rounded-[32px] mt-20 relative">
                    <HeroVideoDialog
                        className="dark:hidden block"
                        animationStyle="top-in-bottom-out"
                        videoSrc="https://www.youtube.com/embed/LxOUXPbTDm8?si=Br9ZRm19lyqyKbRU"
                        thumbnailSrc="/img/desktop-light.png"
                        thumbnailAlt="Hero Video"
                    />
                    <HeroVideoDialog
                        className="hidden dark:block"
                        animationStyle="top-in-bottom-out"
                        videoSrc="https://www.youtube.com/embed/LxOUXPbTDm8?si=Br9ZRm19lyqyKbRU"
                        thumbnailSrc="/img/dashboard.png"
                        thumbnailAlt="Hero Video"
                    />
                </div>
            </div>
        </div>
    )
}
