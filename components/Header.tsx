import { DollarSign, Home, Menu, ShoppingBag } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'

import AuthButton from './AuthButton'
import { DarkThemeToggle } from './DarkThemeToggle'

export default function Header({ children }: { children?: React.ReactNode }) {
    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ">
            <div className="flex items-center justify-between py-1 px-4">
                <div className="flex gap-6 md:gap-10 w-full">
                    <Link
                        className="hidden items-center space-x-2 md:flex"
                        href="/"
                    >
                        <span className="hidden cursor-pointer font-bold sm:inline-block">
                            LMS
                        </span>
                    </Link>
                    <nav className="hidden gap-6 md:flex">
                        <Link
                            className="flex items-center cursor-pointer text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
                            href="/plans"
                        >
                            Plans
                        </Link>
                        <Link
                            className="flex items-center cursor-pointer text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
                            href="/store"
                        >
                            Store
                        </Link>
                    </nav>
                    <Sheet>
                        <SheetTrigger className="flex items-center space-x-2 md:hidden p-3 justify-between gap-2 w-full">
                            <Menu className="h-6 w-6" />
                            <Image
                                src="/img/logo.png"
                                alt="LMS"
                                width={52}
                                height={52}
                            />
                        </SheetTrigger>
                        <SheetContent>
                            <SheetHeader className='w-full'>
                                <SheetTitle>LMS Academy</SheetTitle>
                                <SheetDescription>
                                    <nav className="flex flex-col gap-4">
                                        <div className="w-full max-w-5xl flex flex-wrap gap-4 items-center p-3 text-sm">
                                            <AuthButton />
                                        </div>
                                        <Link
                                            className="flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
                                            href="/"
                                        >
                                            <Home className="h-5 w-5 mr-2" />
                                            Home
                                        </Link>
                                        <Link
                                            className="flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
                                            href="/plans"
                                        >
                                            <DollarSign className="h-5 w-5 mr-2" />
                                            Plans
                                        </Link>
                                        <Link
                                            className="flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm text-foreground/60"
                                            href="/store"
                                        >
                                            <ShoppingBag className="h-5 w-5 mr-2" />
                                            Store
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
                <nav className="hidden md:flex justify-center items-center">
                    <div className="w-full max-w-4xl flex justify-end items-center p-3 text-sm">
                        {<AuthButton />}
                    </div>
                    <DarkThemeToggle />
                </nav>
            </div>
        </header>
    )
}
