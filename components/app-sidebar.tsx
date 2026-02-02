"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    IconBook,
    IconCertificate,
    IconCurrencyDollar,
    IconDashboard,
    IconLogout,
    IconPlus,
    IconSchool,
    IconSettings,
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
        admin: [
            { title: "Dashboard", href: "/dashboard/admin", icon: IconDashboard },
            { title: "Users", href: "/dashboard/admin/users", icon: IconUsers },
            { title: "Courses", href: "/dashboard/admin/courses", icon: IconBook },
            { title: "Enrollments", href: "/dashboard/admin/enrollments", icon: IconCertificate },
            { title: "Transactions", href: "/dashboard/admin/transactions", icon: IconCurrencyDollar },
        ],
        teacher: [
            { title: "Dashboard", href: "/dashboard/teacher", icon: IconDashboard },
            { title: "My Courses", href: "/dashboard/teacher/courses", icon: IconBook },
            { title: "Create Course", href: "/dashboard/teacher/courses/new", icon: IconPlus },
        ],
        student: [
            { title: "Dashboard", href: "/dashboard/student", icon: IconDashboard },
            { title: "My Learning", href: "/dashboard/student/courses", icon: IconSchool },
        ],
    }

    const currentNav = userRole ? navigation[userRole] : []

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
                                <span className="text-xs text-muted-foreground uppercase">{userRole}</span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Application</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {currentNav.map((item) => (
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
