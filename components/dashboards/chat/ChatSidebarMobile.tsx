'use client'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'
import { MenuSquare } from 'lucide-react'
import SearchChats from './SearchChats'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function ChatSidebarMobile({ userRole, chatTypes }) {
    const [open, setOpen] = useState(false)
    const path = usePathname()

    useEffect(() => {
        if (open) {
            setOpen(false)
        }
    }, [path])

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="md:hidden p-2 rounded-full shadow-lg">
                <MenuSquare size={24} />
            </SheetTrigger>
            <SheetContent side="left" className="p-2">
                <SheetHeader>
                    <SheetTitle>Your Chats</SheetTitle>
                    <SheetDescription>
                        Your chats are listed here.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-2 p-4">
                    <SearchChats userRole={userRole} chatTypes={chatTypes} />
                </div>
            </SheetContent>
        </Sheet>
    )
}
