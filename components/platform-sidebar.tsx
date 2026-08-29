"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconAlertTriangle,
  IconBuildingStore,
  IconExternalLink,
  IconLayoutDashboard,
  IconLogout,
  IconReceipt,
  IconReportMoney,
  IconSchool,
  IconShieldCheck,
  IconWallet,
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
import { cn } from "@/lib/utils"

interface PlatformSidebarProps extends React.ComponentProps<typeof Sidebar> {
  pendingBillingCount?: number
  atRiskCount?: number
}

interface NavItem {
  title: string
  href: string
  icon: typeof IconSchool
  badge?: number
  /** Past-due money is red, money waiting on you is amber — the badge says which without reading. */
  badgeTone?: 'warning' | 'danger'
}

const BADGE_TONE: Record<NonNullable<NavItem['badgeTone']>, string> = {
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  danger: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

export function PlatformSidebar({ pendingBillingCount = 0, atRiskCount = 0, ...props }: PlatformSidebarProps) {
  const pathname = usePathname()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/auth/login"
  }

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: 'Operate',
      items: [
        { title: 'Overview', href: '/platform', icon: IconLayoutDashboard },
        { title: 'Schools', href: '/platform/tenants', icon: IconSchool },
      ],
    },
    {
      label: 'Money',
      items: [
        {
          title: 'Payment requests',
          href: '/platform/billing',
          icon: IconReceipt,
          badge: pendingBillingCount,
          badgeTone: 'warning',
        },
        {
          title: 'Billing health',
          href: '/platform/billing-health',
          icon: IconAlertTriangle,
          badge: atRiskCount,
          badgeTone: 'danger',
        },
        { title: 'Revenue', href: '/platform/revenue', icon: IconReportMoney },
        { title: 'Payouts', href: '/platform/payouts', icon: IconWallet },
      ],
    },
    {
      label: 'Configure',
      items: [
        { title: 'Plans', href: '/platform/plans', icon: IconBuildingStore },
        // Referrals stays hidden until the backing schema is built.
      ],
    },
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
                <IconShieldCheck className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">Platform</span>
                <span className="text-xs text-muted-foreground">Super admin</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const href = `${localePrefix}${item.href}`
                  const isActive = item.href === '/platform'
                    ? pathname === href
                    : pathname.startsWith(href)
                  const showBadge = item.badge !== undefined && item.badge > 0
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        render={<Link href={href} />}
                        isActive={isActive}
                        tooltip={showBadge ? `${item.title} (${item.badge})` : item.title}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      {showBadge && (
                        <SidebarMenuBadge
                          className={cn('rounded-full', item.badgeTone && BADGE_TONE[item.badgeTone])}
                        >
                          {item.badge}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href={`${localePrefix}/dashboard/admin`} />} tooltip="Back to my school">
              <IconExternalLink />
              <span>Back to my school</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Log out">
              <IconLogout />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
