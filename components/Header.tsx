import { DollarSign, Home, Menu, ShoppingBag } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { getScopedI18n } from '@/app/locales/server'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'

import { DarkThemeToggle } from './DarkThemeToggle'
import ProfileDropdown from './dashboards/Common/ProfileDropdown'
import LocaleButtons from './ui/LocaleButtons'

export default async function Header({ children }: { children?: React.ReactNode }) {
    const t = await getScopedI18n('header')

    return (
        <header className="sticky container top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ">
            <div className="flex items-center justify-between py-4 px-4">
                <div className="flex gap-6 md:gap-10 w-full">
                    <Link
                        className="hidden items-center space-x-2 md:flex"
                        href="/"
                    >
                        <span className="hidden cursor-pointer font-bold sm:inline-block">
                            {t('title')}
                        </span>
                    </Link>
                    <nav className="hidden gap-6 md:flex">
                        <Link
                            className="flex items-center cursor-pointer text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
                            href="/contact"
                        >
                            {t('contact')}
                        </Link>
                        <Link
                            className="flex items-center cursor-pointer text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
                            href="/about"
                        >
                            {t('about')}
                        </Link>
                    </nav>
                    <Sheet>
                        <div className="md:hidden flex p-2 items-center justify-between w-full">
                            <SheetTrigger className="flex items-center space-x-2 md:hidden p-3 justify-between gap-2 w-full">
                                <Menu className="h-6 w-6" />
                            </SheetTrigger>
                            <ProfileDropdown />
                        </div>
                        <SheetContent>
                            <SheetHeader className='w-full'>
                                <Image
                                    src="/img/logo.png"
                                    alt="LMS"
                                    width={52}
                                    height={52}
                                />
                                <SheetTitle>LMS Academy</SheetTitle>
                                <SheetDescription>
                                    <nav className="flex flex-col gap-4">
                                        <Link
                                            className="flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
                                            href="/"
                                        >
                                            <Home className="h-5 w-5 mr-2" />
                                            {t('home')}
                                        </Link>
                                        <Link
                                            className="flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
                                            href="/contact"
                                        >
                                            <DollarSign className="h-5 w-5 mr-2" />
                                            {t('contact')}
                                        </Link>
                                        <Link
                                            className="flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
                                            href="/about"
                                        >
                                            <ShoppingBag className="h-5 w-5 mr-2" />
                                            {t('about')}
                                        </Link>
                                        <DarkThemeToggle />
                                    </nav>
                                    {children}
                                </SheetDescription>
                            </SheetHeader>
                        </SheetContent>
                    </Sheet>
                    {children}
                </div>
                <nav className="hidden md:flex justify-center gap-2 items-center">
                    <DarkThemeToggle />
                    <LocaleButtons />
                </nav>
            </div>
        </header>
    )
}
