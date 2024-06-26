import { BookIcon, HomeIcon, MessageCircleIcon, SearchIcon, User2 } from 'lucide-react'
import Link from 'next/link'

import { DarkThemeToggle } from '@/components/DarkThemeToggle'
import { CommandDialogComponent } from '@/components/dashboards/Common/CommandDialogComponent'
import { Input } from '@/components/ui/input'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger
} from '@/components/ui/sheet'
import { getServerUserRole } from '@/utils/supabase/getUserRole'

import ProfileDropdown from './Common/ProfileDropdown'
import Notifications from './notifications/Notifications'

export default async function DashboardHeader () {
    const userRole = await getServerUserRole()

    return (
        <header className="flex h-14 lg:h-[60px] items-center gap-4 border-b bg-gray-100/40 px-6 dark:bg-gray-800/40">
            <Sheet>
                <SheetTrigger>
                    <BookIcon className="h-6 w-6" />
                    <span className="sr-only">Dashboard</span>
                </SheetTrigger>
                <SheetContent
                    className='flex flex-col gap-4 p-4'
                >
                    <SheetHeader>
                        <SheetTitle>
                            Menus and Navigation
                        </SheetTitle>
                        <SheetDescription>
                            Access all the menus and navigation items from here
                        </SheetDescription>
                    </SheetHeader>
                    <div
                        className='flex flex-col gap-4'
                    >
                        <Link
                            className='flex items-center gap-2'
                            href={`/dashboard/${userRole}`}
                        >
                            <HomeIcon className="h-6 w-6" />
                            <span>Home</span>
                        </Link>
                        <Link
                            className='flex items-center gap-2'
                            href={`/dashboard/${userRole}/account`}
                        >
                            <User2 className="h-6 w-6" />
                            <span>Account</span>
                        </Link>
                        <Link
                            className='flex items-center gap-2'
                            href={`/dashboard/${userRole}/chat`}
                        >
                            <MessageCircleIcon className="h-6 w-6" />
                            <span>Chat</span>
                        </Link>
                    </div>

                </SheetContent>
            </Sheet>

            <div className="w-full flex-1">
                <form>
                    <div className="relative md:w-2/3 lg:w-1/3">
                        <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />

                        <Input
                            className="w-full bg-white shadow-none appearance-none pl-8  dark:bg-gray-950"
                            placeholder="Search lessons, courses, or students..."
                            type="search"
                        />
                        <div className="absolute right-2.5 top-2.5">
                            <CommandDialogComponent />
                        </div>
                    </div>
                </form>
            </div>
            <Notifications />
            <DarkThemeToggle />
            <ProfileDropdown />
        </header>
    )
}
