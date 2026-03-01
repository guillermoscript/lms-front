"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconBuildingStore,
  IconChartBar,
  IconCreditCard,
  IconExternalLink,
  IconLogout,
  IconSchool,
  IconSettings,
  IconShare,
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { createClient } from "@/lib/supabase/client"

interface PlatformSidebarProps extends React.ComponentProps<typeof Sidebar> {
  pendingBillingCount?: number
}

export function PlatformSidebar({ pendingBillingCount = 0, ...props }: PlatformSidebarProps) {
  const pathname = usePathname()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/auth/login"
  }

  const navItems = [
    { title: "Overview", href: "/platform", icon: IconChartBar },
    { title: "Tenants", href: "/platform/tenants", icon: IconSchool },
    { title: "Billing", href: "/platform/billing", icon: IconCreditCard, badge: pendingBillingCount },
    { title: "Plans", href: "/platform/plans", icon: IconBuildingStore },
    { title: "Referrals", href: "/platform/referrals", icon: IconShare },
  ]

  // Determine locale prefix from pathname
  const localeMatch = pathname.match(/^\/(en|es)/)
  const localePrefix = localeMatch ? localeMatch[0] : '/en'

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href={`${localePrefix}/platform`} />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <IconSettings className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">Platform Admin</span>
                <span className="text-xs text-muted-foreground uppercase">Super Admin</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const href = `${localePrefix}${item.href}`
                const isActive = item.href === '/platform'
                  ? pathname === href
                  : pathname.startsWith(href)
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link href={href} />}
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {item.badge !== undefined && item.badge > 0 && (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href={`${localePrefix}/dashboard/admin`} />} tooltip="Back to School">
              <IconExternalLink />
              <span>Back to School</span>
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
