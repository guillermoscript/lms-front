import Link from 'next/link'

import AuthButton from '../AuthButton'
import { DarkThemeToggle } from '../DarkThemeToggle'

const Header = () => {
    return (
        <nav className="max-w-7xl fixed top-4 mx-auto inset-x-0 z-50 w-[95%] lg:w-full">
            <div className="hidden lg:block w-full">
                <div className="w-full flex relative justify-between px-4 py-2 rounded-full transition duration-200 bg-neutral-50 dark:bg-neutral-900">

                    <div className="flex flex-row gap-2 items-center">
                        <Link
                            href="/"
                            className="font-normal flex space-x-2 items-center text-sm mr-4 px-2 py-1 relative z-20"
                        >
                            <div className="h-5 w-6 bg-black dark:bg-white rounded-br-lg rounded-tr-sm rounded-tl-lg rounded-bl-sm"></div>
                            <span className="font-medium text-black dark:text-white">
                                Every AI
                            </span>
                        </Link>
                        <div className="flex items-center gap-1.5">
                            <Link
                                className={'flex items-center justify-center text-sm leading-[110%] px-4 py-2 rounded-md hover:bg-[#F5F5F5] dark:hover:bg-neutral-800'}
                                href="/pricing"
                            >Pricing</Link>
                            <Link
                                className={'flex items-center justify-center text-sm leading-[110%] px-4 py-2 rounded-md hover:bg-[#F5F5F5] dark:hover:bg-neutral-800'}
                                href="/blog"
                            >Blog</Link>
                            <Link
                                className={'flex items-center justify-center text-sm leading-[110%] px-4 py-2 rounded-md hover:bg-[#F5F5F5] dark:hover:bg-neutral-800'}
                                href="/contact"
                            >Contact</Link>
                        </div>
                    </div>
                    <div className="flex space-x-2 items-center">
                        <DarkThemeToggle />
                        <AuthButton />
                        {/* <NavItem
                            href="/login"
                            additionalClasses="relative z-10 bg-transparent hover:bg-gray-100 border border-transparent text-black text-sm md:text-sm transition font-medium duration-200 rounded-full px-4 py-2 flex items-center justify-center dark:text-white dark:hover:bg-neutral-800 dark:hover:shadow-xl"
                        >
                            Login
                        </NavItem>
                        <NavItem
                            href="/signup"
                            additionalClasses="bg-neutral-900 relative z-10 hover:bg-black/90 border border-transparent text-white text-sm md:text-sm transition font-medium duration-200 rounded-full px-4 py-2 flex items-center justify-center shadow-[0px_-1px_0px_0px_#FFFFFF40_inset,_0px_1px_0px_0px_#FFFFFF40_inset]"
                        >
                            Sign Up
                        </NavItem> */}
                    </div>
                </div>
            </div>

            <div className="flex h-full w-full items-center lg:hidden">
                <div className="flex justify-between items-center w-full rounded-full px-2.5 py-1.5 transition duration-200 bg-neutral-50 dark:bg-neutral-900 shadow-[0px_-2px_0px_0px_var(--neutral-100),0px_2px_0px_0px_var(--neutral-100)] dark:shadow-[0px_-2px_0px_0px_var(--neutral-800),0px_2px_0px_0px_var(--neutral-800)]">
                    <Link
                        href="/"
                        className="font-normal flex space-x-2 items-center text-sm mr-4 text-black px-2 py-1 relative z-20"
                    >
                        <div className="h-5 w-6 bg-black dark:bg-white rounded-br-lg rounded-tr-sm rounded-tl-lg rounded-bl-sm"></div>
                        <span className="font-medium text-black dark:text-white">
                            Every AI
                        </span>
                    </Link>
                    <DarkThemeToggle />
                    <AuthButton />
                </div>
            </div>
        </nav>
    )
}

export default Header
