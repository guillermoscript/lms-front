import { BookOpenIcon, EditIcon, HomeIcon, MessageCircle, User2Icon } from 'lucide-react'
import Link from 'next/link'

import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { getServerUserRole } from '@/utils/supabase/getUserRole'

const navItems = [
    {
        href: (userRole: string) => `/dashboard/${userRole}`,
        icon: <HomeIcon className="h-5 w-5" />,
        label: 'Home',
        tooltip: 'Go to your dashboard home',
        id: 'home'
    },
    {
        href: (userRole: string) => `/dashboard/${userRole}/account`,
        icon: <User2Icon className="h-5 w-5" />,
        label: 'Account',
        tooltip: 'View and edit your profile',
        id: 'account'
    },
    {
        href: (userRole: string) => `/dashboard/${userRole}/chat`,
        icon: <MessageCircle className="h-5 w-5" />,
        label: 'Chat',
        tooltip: 'Chat with the AI assistant',
        id: 'chat'
    }
]

const getAdditionalNavItem = (userRole: string) => {
    if (userRole === 'student') {
        return {
            href: `/dashboard/${userRole}/courses`,
            icon: <BookOpenIcon className="h-5 w-5" />,
            label: 'Courses',
            tooltip: 'View your courses',
            id: 'courses'
        }
    } else if (userRole === 'teacher') {
        return {
            href: `/dashboard/${userRole}/manage-courses`,
            icon: <EditIcon className="h-5 w-5" />,
            label: 'Manage Courses',
            tooltip: 'Create or view courses',
            id: 'manage-courses'
        }
    }
    return null
}

const NavItem = ({ href, icon, label, tooltip, id }: {
    href: string
    icon: React.ReactNode
    label: string
    tooltip: string
    id: string
}) => (
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger>
                <NavLink
                    href={href}
                    icon={icon}
                    label={label}
                    id={id}
                />
            </TooltipTrigger>
            <TooltipContent>
                <p>{tooltip}</p>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
)

async function Sidebar() {
    const userRole = await getServerUserRole()
    const additionalNavItem = getAdditionalNavItem(userRole)

    return (
        <div className="hidden border-r bg-gray-100/40 lg:block dark:bg-gray-800/40">
            <aside className="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col border-r bg-background sm:flex">
                <nav className="flex flex-col items-center gap-4 px-2 sm:py-5">
                    {navItems.map(item => (
                        <NavItem
                            key={item.id}
                            href={item.href(userRole)}
                            icon={item.icon}
                            label={item.label}
                            tooltip={item.tooltip}
                            id={item.id}
                        />
                    ))}
                    {additionalNavItem && (
                        <NavItem
                            key={additionalNavItem.id}
                            href={additionalNavItem.href}
                            icon={additionalNavItem.icon}
                            label={additionalNavItem.label}
                            tooltip={additionalNavItem.tooltip}
                            id={additionalNavItem.id}
                        />
                    )}
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
