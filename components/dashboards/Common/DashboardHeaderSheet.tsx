'use client'
import { HamburgerMenuIcon, HomeIcon } from '@radix-ui/react-icons'
import { MessageCircleIcon, User2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { DarkThemeToggle } from '@/components/DarkThemeToggle'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger
} from '@/components/ui/sheet'
import { Tables } from '@/utils/supabase/supabase'

export default function DashboardHeaderSheet ({
    userRole
}: {
    userRole: Tables<'user_roles'>['role']
}) {
    const [isSheetOpen, setIsSheetOpen] = useState(false)

    return (
        <Sheet
            open={isSheetOpen}
            onOpenChange={setIsSheetOpen}
        >
            <SheetTrigger
                className='block md:hidden'
            >
                <HamburgerMenuIcon className="h-6 w-6" />
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
                        onClick={() => setIsSheetOpen(false)}
                    >
                        <HomeIcon className="h-6 w-6" />
                        <span>Home</span>
                    </Link>
                    <Link
                        className='flex items-center gap-2'
                        href={`/dashboard/${userRole}/account`}
                        onClick={() => setIsSheetOpen(false)}
                    >
                        <User2 className="h-6 w-6" />
                        <span>Account</span>
                    </Link>
                    <Link
                        className='flex items-center gap-2'
                        href={`/dashboard/${userRole}/chat`}
                        onClick={() => setIsSheetOpen(false)}
                    >
                        <MessageCircleIcon className="h-6 w-6" />
                        <span>Chat</span>
                    </Link>
                    <DarkThemeToggle />
                </div>
            </SheetContent>
        </Sheet>

    )
}
