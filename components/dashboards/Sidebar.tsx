'use server'
import { HomeIcon, MessageCircle, Settings, User2Icon } from 'lucide-react'
import Link from 'next/link'

import { getServerUserRole } from '@/utils/supabase/getUserRole'

async function Sidebar () {
    const userRole = await getServerUserRole()

    return (
        <div className="hidden border-r bg-gray-100/40 lg:block dark:bg-gray-800/40">
            <aside className="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col border-r bg-background sm:flex">
                <nav className="flex flex-col items-center gap-4 px-2 sm:py-5">
                    <NavLink
                        href={`/dashboard/${userRole}`}
                        icon={<HomeIcon className="h-5 w-5" />}
                        label="Home"
                    />
                    <NavLink
                        href={`/dashboard/${userRole}/account`}
                        icon={<User2Icon className="h-5 w-5" />}
                        label="Account"
                    />
                    <NavLink
                        href={`/dashboard/${userRole}/chat`}
                        icon={<MessageCircle className="h-5 w-5" />}
                        label="Chat"
                    />
                </nav>
                <nav className="mt-auto flex flex-col items-center gap-4 px-2 sm:py-5">
                    <NavLink
                        href="#"
                        icon={<Settings className="h-5 w-5" />}
                        label="Settings"
                    />
                </nav>
            </aside>
        </div>
    )
}

export default Sidebar

// Define a single NavLink component that can be reused
const NavLink = ({ href, icon, label }) => (
    <Link className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8" href={href} data-state="closed">
        {icon}
        <span className="sr-only">{label}</span>
    </Link>
)
