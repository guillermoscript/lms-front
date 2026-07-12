"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import {
    IconBook,
    IconBookmark,
    IconChartBar,
    IconChevronRight,
    IconCoins,
    IconCurrencyDollar,
    IconDashboard,
    IconKey,
    IconLayout,
    IconLogout,
    IconMessages,
    IconReceipt,
    IconSearch,
    IconSettings,
    IconUsers,
} from "@tabler/icons-react"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarRail,
} from "@/components/ui/sidebar"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useTenant } from "@/components/tenant/tenant-provider"
import { useLogout } from "@/hooks/use-logout"
import Image from "next/image"

interface NavSubItem {
    title: string
    href: string
    tourId?: string
}

interface NavItem {
    title: string
    href: string
    icon: React.ComponentType<{ className?: string }>
    tourId?: string
    items?: NavSubItem[]
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
    userRole: 'student' | 'teacher' | 'admin' | null
}

// On hard loads the browser URL carries the locale prefix (/en, /es) while nav
// hrefs are locale-less; client-side navigations are already locale-less.
// (i18n.ts can't be imported here — it pulls in next-intl/server.)
function stripLocale(pathname: string): string {
    return pathname.replace(/^\/(en|es)(?=\/|$)/, '') || '/'
}

function isNavActive(href: string, pathname: string): boolean {
    const hrefPath = href.split('?')[0]
    if (pathname === hrefPath) return true
    if (hrefPath !== '/dashboard/admin' && hrefPath !== '/dashboard/teacher' && hrefPath !== '/dashboard/student') {
        return pathname.startsWith(hrefPath + '/')
    }
    return false
}

function NavEntry({ item }: { item: NavItem }) {
    const pathname = stripLocale(usePathname())
    const active = isNavActive(item.href, pathname)
    const tourProps = item.tourId ? { 'data-tour': item.tourId } : {}

    if (!item.items?.length) {
        return (
            <SidebarMenuItem {...tourProps}>
                <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={active}
                    tooltip={item.title}
                >
                    <item.icon />
                    <span>{item.title}</span>
                </SidebarMenuButton>
            </SidebarMenuItem>
        )
    }

    const childActive = item.items.some((sub) => isNavActive(sub.href, pathname))

    return (
        <Collapsible
            defaultOpen={active || childActive}
            render={<SidebarMenuItem {...tourProps} />}
        >
            <SidebarMenuButton
                render={<Link href={item.href} />}
                isActive={active}
                tooltip={item.title}
            >
                <item.icon />
                <span>{item.title}</span>
            </SidebarMenuButton>
            <CollapsibleTrigger
                render={<SidebarMenuAction className="data-[panel-open]:rotate-90" />}
            >
                <IconChevronRight />
                <span className="sr-only">{item.title}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <SidebarMenuSub>
                    {item.items.map((sub) => (
                        <SidebarMenuSubItem
                            key={sub.href}
                            {...(sub.tourId ? { 'data-tour': sub.tourId } : {})}
                        >
                            <SidebarMenuSubButton
                                render={<Link href={sub.href} />}
                                isActive={isNavActive(sub.href, pathname)}
                            >
                                <span>{sub.title}</span>
                            </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                    ))}
                </SidebarMenuSub>
            </CollapsibleContent>
        </Collapsible>
    )
}

export function AppSidebar({ userRole, ...props }: AppSidebarProps) {
    const t = useTranslations('sidebar')
    const tenant = useTenant()
    const logout = useLogout()

    const schoolName = tenant?.name || t('platform')
    const logoUrl = tenant?.logo_url
    const initials = schoolName.slice(0, 2).toUpperCase()

    const navItems = React.useMemo((): NavItem[] => {
        if (!userRole) return []

        const items: Record<string, NavItem[]> = {
            admin: [
                { title: t('dashboard'), href: "/dashboard/admin", icon: IconDashboard },
                {
                    title: t('courses'), href: "/dashboard/admin/courses", icon: IconBook,
                    items: [
                        { title: t('myCourses'), href: "/dashboard/teacher/courses", tourId: 'sidebar-courses' },
                        { title: t('enrollments'), href: "/dashboard/admin/enrollments" },
                    ],
                },
                {
                    title: t('people'), href: "/dashboard/admin/users", icon: IconUsers,
                    items: [
                        { title: t('community'), href: "/dashboard/admin/community" },
                    ],
                },
                {
                    title: t('monetization'), href: "/dashboard/admin/monetization", icon: IconCurrencyDollar,
                    items: [
                        { title: t('products'), href: "/dashboard/admin/products" },
                        { title: t('plans'), href: "/dashboard/admin/plans" },
                        { title: t('subscriptions'), href: "/dashboard/admin/subscriptions" },
                        { title: t('transactions'), href: "/dashboard/admin/transactions" },
                        { title: t('paymentRequests'), href: "/dashboard/admin/payment-requests" },
                        { title: t('revenue'), href: "/dashboard/admin/revenue" },
                        { title: t('payouts'), href: "/dashboard/admin/payouts" },
                        { title: t('invoices'), href: "/dashboard/admin/invoices" },
                    ],
                },
                { title: t('analytics'), href: "/dashboard/admin/analytics", icon: IconChartBar },
                {
                    title: t('website'), href: "/dashboard/admin/landing-page", icon: IconLayout,
                    items: [
                        { title: t('appearance'), href: "/dashboard/admin/appearance" },
                    ],
                },
                {
                    title: t('settings'), href: "/dashboard/admin/settings", icon: IconSettings, tourId: 'sidebar-settings',
                    items: [
                        { title: t('billing'), href: "/dashboard/admin/billing" },
                        { title: t('apiTokens'), href: "/dashboard/admin/api-tokens" },
                    ],
                },
            ],
            teacher: [
                { title: t('dashboard'), href: "/dashboard/teacher", icon: IconDashboard },
                { title: t('myCourses'), href: "/dashboard/teacher/courses", icon: IconBook, tourId: 'sidebar-courses' },
                { title: t('community'), href: "/dashboard/teacher/community", icon: IconMessages },
                { title: t('revenue'), href: "/dashboard/teacher/revenue", icon: IconCurrencyDollar },
                { title: t('apiTokens'), href: "/dashboard/teacher/api-tokens", icon: IconKey },
            ],
            student: [
                { title: t('dashboard'), href: "/dashboard/student", icon: IconDashboard },
                {
                    title: t('myCourses'), href: "/dashboard/student/courses", icon: IconBookmark,
                    items: [
                        { title: t('completed'), href: "/dashboard/student/courses?status=completed" },
                        { title: t('myCertificates'), href: "/dashboard/student/certificates" },
                        { title: t('progressReport'), href: "/dashboard/student/progress", tourId: 'sidebar-progress' },
                    ],
                },
                {
                    title: t('browseCourses'), href: "/dashboard/student/browse", icon: IconSearch, tourId: 'sidebar-browse',
                    items: [
                        { title: t('courseCatalog'), href: "/courses" },
                    ],
                },
                { title: t('community'), href: "/dashboard/student/community", icon: IconMessages },
                {
                    title: t('myBilling'), href: "/dashboard/student/billing", icon: IconReceipt,
                    items: [
                        { title: t('myPayments'), href: "/dashboard/student/payments" },
                    ],
                },
                { title: t('pointStore'), href: "/dashboard/student/store", icon: IconCoins },
            ],
        }

        return items[userRole] || []
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
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {navItems.map((item) => (
                                <NavEntry key={item.href} item={item} />
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
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
