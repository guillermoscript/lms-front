"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    IconBook,
    IconBookmark,
    IconBriefcase,
    IconCertificate,
    IconChartBar,
    IconClipboardList,
    IconClock,
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

    const handleLogout = async () => {
        await supabase.auth.signOut()
        window.location.href = "/auth/login"
    }

    const navigation = {
        admin: {
            main: [
                { title: "Dashboard", href: "/dashboard/admin", icon: IconDashboard },
            ],
            management: [
                { title: "Users", href: "/dashboard/admin/users", icon: IconUsers },
                { title: "All Courses", href: "/dashboard/admin/courses", icon: IconBook },
                { title: "Enrollments", href: "/dashboard/admin/enrollments", icon: IconCertificate },
                { title: "Transactions", href: "/dashboard/admin/transactions", icon: IconCurrencyDollar },
            ],
        },
        teacher: {
            main: [
                { title: "Dashboard", href: "/dashboard/teacher", icon: IconDashboard },
            ],
            content: [
                { title: "My Courses", href: "/dashboard/teacher/courses", icon: IconBook },
                { title: "Create Course", href: "/dashboard/teacher/courses/new", icon: IconPlus },
            ],
        },
        student: {
            main: [
                { title: "Dashboard", href: "/dashboard/student", icon: IconDashboard },
                { title: "My Courses", href: "/dashboard/student/courses", icon: IconBookmark },
            ],
            discover: [
                { title: "Browse Courses", href: "/dashboard/student/browse", icon: IconSearch },
                { title: "Course Catalog", href: "/courses", icon: IconBook },
            ],
            learning: [
                { title: "Continue Learning", href: "/dashboard/student/courses?status=in_progress", icon: IconClock },
                { title: "Completed", href: "/dashboard/student/courses?status=completed", icon: IconTrophy },
            ],
            resources: [
                { title: "My Certificates", href: "/dashboard/student/certificates", icon: IconCertificate },
                { title: "Progress Report", href: "/dashboard/student/progress", icon: IconChartBar },
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
                                <span className="font-semibold">LMS Platform</span>
                                <span className="text-xs text-muted-foreground uppercase">{userRole || 'Guest'}</span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            
            <SidebarContent>
                {/* Main Navigation */}
                {currentNav?.main && (
                    <SidebarGroup>
                        <SidebarGroupLabel>Main</SidebarGroupLabel>
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
                        <SidebarGroupLabel>Discover</SidebarGroupLabel>
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
                        <SidebarGroupLabel>Learning</SidebarGroupLabel>
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
                        <SidebarGroupLabel>Resources</SidebarGroupLabel>
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
                        <SidebarGroupLabel>Content Management</SidebarGroupLabel>
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
                        <SidebarGroupLabel>Management</SidebarGroupLabel>
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
                        <SidebarMenuButton render={<Link href="/dashboard/settings" />} tooltip="Settings">
                            <IconSettings />
                            <span>Settings</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton onClick={handleLogout} tooltip="Logout">
                            <IconLogout />
                            <span>Logout</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
