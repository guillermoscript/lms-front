import { HomeIcon, MessageCircle, User2Icon } from 'lucide-react'
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
                        id='home'
                    />
                    <NavLink
                        href={`/dashboard/${userRole}/account`}
                        icon={<User2Icon className="h-5 w-5" />}
                        label="Account"
                        id='account'
                    />
                    <NavLink
                        href={`/dashboard/${userRole}/chat`}
                        icon={<MessageCircle className="h-5 w-5" />}
                        label="Chat"
                        id='chat'
                    />
                </nav>
            </aside>
        </div>
    )
}

export default Sidebar

// Define a single NavLink component that can be reused
export const NavLink = ({
    href,
    icon,
    label,
    children,
    id
}: {
    href: string
    icon: React.ReactNode
    label?: string
    children?: React.ReactNode
    id: string
}) => (
    <Link
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
        href={href}
        data-state="closed"
        id={id}
    >
        {icon}
        {label && <span className="sr-only">{label}</span>}
        {children}
    </Link>
)
