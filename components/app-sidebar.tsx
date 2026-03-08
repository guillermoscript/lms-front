"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import {
    IconBook,
    IconBookmark,
    IconCertificate,
    IconChartBar,
    IconCoins,
    IconCreditCard,
    IconCurrencyDollar,
    IconDashboard,
    IconKey,
    IconLayout,
    IconLogout,
    IconPlus,
    IconSearch,
    IconSettings,
    IconTrophy,
    IconUsers,
} from "@tabler/icons-react"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from "@/components/ui/sidebar"
import { useTenant } from "@/components/tenant/tenant-provider"
import { useLogout } from "@/hooks/use-logout"
import Image from "next/image"

interface NavItem {
    title: string
    href: string
    icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
    label: string
    items: NavItem[]
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
    userRole: 'student' | 'teacher' | 'admin' | null
}

function isNavActive(href: string, pathname: string): boolean {
    const hrefPath = href.split('?')[0]
    if (pathname === hrefPath) return true
    if (hrefPath !== '/dashboard/admin' && hrefPath !== '/dashboard/teacher' && hrefPath !== '/dashboard/student') {
        return pathname.startsWith(hrefPath + '/')
    }
    return false
}

function NavSection({ group }: { group: NavGroup }) {
    const pathname = usePathname()

    return (
        <SidebarGroup>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    {group.items.map((item) => (
                        <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                                render={<Link href={item.href} />}
                                isActive={isNavActive(item.href, pathname)}
                                tooltip={item.title}
                            >
                                <item.icon />
                                <span>{item.title}</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}

export function AppSidebar({ userRole, ...props }: AppSidebarProps) {
    const t = useTranslations('sidebar')
    const tenant = useTenant()
    const logout = useLogout()

    const schoolName = tenant?.name || t('platform')
    const logoUrl = tenant?.logo_url
    const initials = schoolName.slice(0, 2).toUpperCase()

    const navGroups = React.useMemo((): NavGroup[] => {
        if (!userRole) return []

        const groups: Record<string, NavGroup[]> = {
            admin: [
                {
                    label: t('main'),
                    items: [
                        { title: t('dashboard'), href: "/dashboard/admin", icon: IconDashboard },
                    ],
                },
                {
                    label: t('management'),
                    items: [
                        { title: t('users'), href: "/dashboard/admin/users", icon: IconUsers },
                        { title: t('allCourses'), href: "/dashboard/admin/courses", icon: IconBook },
                        { title: t('enrollments'), href: "/dashboard/admin/enrollments", icon: IconCertificate },
                        { title: t('transactions'), href: "/dashboard/admin/transactions", icon: IconCurrencyDollar },
                        { title: t('billing'), href: "/dashboard/admin/billing", icon: IconCreditCard },
                        { title: t('pages'), href: "/dashboard/admin/landing-page", icon: IconLayout },
                        { title: t('apiTokens'), href: "/dashboard/admin/api-tokens", icon: IconKey },
                    ],
                },
                {
                    label: t('contentManagement'),
                    items: [
                        { title: t('myCourses'), href: "/dashboard/teacher/courses", icon: IconBook },
                        { title: t('createCourse'), href: "/dashboard/teacher/courses/new", icon: IconPlus },
                        { title: t('revenue'), href: "/dashboard/teacher/revenue", icon: IconCurrencyDollar },
                    ],
                },
            ],
            teacher: [
                {
                    label: t('main'),
                    items: [
                        { title: t('dashboard'), href: "/dashboard/teacher", icon: IconDashboard },
                    ],
                },
                {
                    label: t('contentManagement'),
                    items: [
                        { title: t('myCourses'), href: "/dashboard/teacher/courses", icon: IconBook },
                        { title: t('createCourse'), href: "/dashboard/teacher/courses/new", icon: IconPlus },
                        { title: t('apiTokens'), href: "/dashboard/teacher/api-tokens", icon: IconKey },
                    ],
                },
                {
                    label: t('business'),
                    items: [
                        { title: t('revenue'), href: "/dashboard/teacher/revenue", icon: IconCurrencyDollar },
                    ],
                },
            ],
            student: [
                {
                    label: t('main'),
                    items: [
                        { title: t('dashboard'), href: "/dashboard/student", icon: IconDashboard },
                        { title: t('myCourses'), href: "/dashboard/student/courses", icon: IconBookmark },
                    ],
                },
                {
                    label: t('discover'),
                    items: [
                        { title: t('browseCourses'), href: "/dashboard/student/browse", icon: IconSearch },
                        { title: t('courseCatalog'), href: "/courses", icon: IconBook },
                    ],
                },
                {
                    label: t('resources'),
                    items: [
                        { title: t('myCertificates'), href: "/dashboard/student/certificates", icon: IconCertificate },
                        { title: t('progressReport'), href: "/dashboard/student/progress", icon: IconChartBar },
                        { title: t('completed'), href: "/dashboard/student/courses?status=completed", icon: IconTrophy },
                        { title: t('pointStore'), href: "/dashboard/student/store", icon: IconCoins },
                    ],
                },
            ],
        }

        return groups[userRole] || []
    }, [userRole, t])

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
                            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground overflow-hidden">
                                {logoUrl ? (
                                    <Image
                                        src={logoUrl}
                                        alt={schoolName}
                                        width={32}
                                        height={32}
                                        className="size-8 object-cover"
                                    />
                                ) : (
                                    <span className="text-xs font-bold">{initials}</span>
                                )}
                            </div>
                            <div className="flex flex-col gap-0.5 leading-none">
                                <span className="font-semibold" data-testid="sidebar-platform">{schoolName}</span>
                                <span className="text-xs text-muted-foreground uppercase" data-testid="sidebar-role">{userRole || t('guest')}</span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                {navGroups.map((group) => (
                    <NavSection key={group.label} group={group} />
                ))}
            </SidebarContent>

            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton render={<Link href="/dashboard/settings" />} tooltip={t('settings')}>
                            <IconSettings />
                            <span>{t('settings')}</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton onClick={logout} tooltip={t('logout')}>
                            <IconLogout />
                            <span>{t('logout')}</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
