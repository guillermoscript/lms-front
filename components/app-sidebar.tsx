"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import {
    IconBook,
    IconBookmark,
    IconBriefcase,
    IconCertificate,
    IconChartBar,
    IconClipboardList,
    IconClock,
    IconCoins,
    IconCurrencyDollar,
    IconDashboard,
    IconFileText,
    IconLogout,
    IconPlus,
    IconSchool,
    IconSearch,
    IconSettings,
    IconSparkles,
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
import { createClient } from "@/lib/supabase/client"

interface NavItem {
    title: string
    href: string
    icon: React.ComponentType<{ className?: string }>
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
    userRole: 'student' | 'teacher' | 'admin' | null
}

export function AppSidebar({ userRole, ...props }: AppSidebarProps) {
    const pathname = usePathname()
    const supabase = createClient()
    const t = useTranslations('sidebar')

    const handleLogout = async () => {
        await supabase.auth.signOut()
        window.location.href = "/auth/login"
    }

    const navigation = {
        admin: {
            main: [
                { title: t('dashboard'), href: "/dashboard/admin", icon: IconDashboard },
            ],
            management: [
                { title: t('users'), href: "/dashboard/admin/users", icon: IconUsers },
                { title: t('allCourses'), href: "/dashboard/admin/courses", icon: IconBook },
                { title: t('enrollments'), href: "/dashboard/admin/enrollments", icon: IconCertificate },
                { title: t('transactions'), href: "/dashboard/admin/transactions", icon: IconCurrencyDollar },
            ],
        },
        teacher: {
            main: [
                { title: t('dashboard'), href: "/dashboard/teacher", icon: IconDashboard },
            ],
            content: [
                { title: t('myCourses'), href: "/dashboard/teacher/courses", icon: IconBook },
                { title: t('createCourse'), href: "/dashboard/teacher/courses/new", icon: IconPlus },
            ],
        },
        student: {
            main: [
                { title: t('dashboard'), href: "/dashboard/student", icon: IconDashboard },
                { title: t('myCourses'), href: "/dashboard/student/courses", icon: IconBookmark },
            ],
            discover: [
                { title: t('browseCourses'), href: "/dashboard/student/browse", icon: IconSearch },
                { title: t('courseCatalog'), href: "/courses", icon: IconBook },
            ],
            learning: [
                { title: t('continueLearning'), href: "/dashboard/student/courses?status=in_progress", icon: IconClock },
                { title: t('completed'), href: "/dashboard/student/courses?status=completed", icon: IconTrophy },
            ],
            resources: [
                { title: t('myCertificates'), href: "/dashboard/student/certificates", icon: IconCertificate },
                { title: t('progressReport'), href: "/dashboard/student/progress", icon: IconChartBar },
                { title: t('pointStore'), href: "/dashboard/student/store", icon: IconCoins },
            ],
        },
    }

    const currentNav = userRole ? navigation[userRole] : null

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
                            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                <IconSchool className="size-4" />
                            </div>
                            <div className="flex flex-col gap-0.5 leading-none">
                                <span className="font-semibold">{t('platform')}</span>
                                <span className="text-xs text-muted-foreground uppercase">{userRole || t('guest')}</span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                {/* Main Navigation */}
                {currentNav?.main && (
                    <SidebarGroup>
                        <SidebarGroupLabel>{t('main')}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {currentNav.main.map((item) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            render={<Link href={item.href} />}
                                            isActive={pathname === item.href}
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
                )}

                {/* Student: Discover Section */}
                {userRole === 'student' && currentNav && 'discover' in currentNav && (
                    <SidebarGroup>
                        <SidebarGroupLabel>{t('discover')}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {currentNav.discover.map((item: NavItem) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            render={<Link href={item.href} />}
                                            isActive={pathname === item.href}
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
                )}

                {/* Student: Learning Section */}
                {userRole === 'student' && currentNav && 'learning' in currentNav && (
                    <SidebarGroup>
                        <SidebarGroupLabel>{t('learning')}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {currentNav.learning.map((item: NavItem) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            render={<Link href={item.href} />}
                                            isActive={pathname === item.href || pathname.startsWith(item.href)}
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
                )}

                {/* Student: Resources Section */}
                {userRole === 'student' && currentNav && 'resources' in currentNav && (
                    <SidebarGroup>
                        <SidebarGroupLabel>{t('resources')}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {currentNav.resources.map((item: NavItem) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            render={<Link href={item.href} />}
                                            isActive={pathname === item.href}
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
                )}

                {/* Teacher: Content Section */}
                {userRole === 'teacher' && currentNav && 'content' in currentNav && (
                    <SidebarGroup>
                        <SidebarGroupLabel>{t('contentManagement')}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {currentNav.content.map((item: NavItem) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            render={<Link href={item.href} />}
                                            isActive={pathname === item.href}
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
                )}

                {/* Admin: Management Section */}
                {userRole === 'admin' && currentNav && 'management' in currentNav && (
                    <SidebarGroup>
                        <SidebarGroupLabel>{t('management')}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {currentNav.management.map((item: NavItem) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            render={<Link href={item.href} />}
                                            isActive={pathname === item.href}
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
                )}
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
                        <SidebarMenuButton onClick={handleLogout} tooltip={t('logout')}>
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
