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
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface PlatformSidebarProps extends React.ComponentProps<typeof Sidebar> {
  pendingBillingCount?: number
  atRiskCount?: number
}

interface NavItem {
  /** Message key under `platform.sidebar`, resolved at render — not a literal label. */
  titleKey: string
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
  const t = useTranslations('platform.sidebar')
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/auth/login"
  }

  const groups: { labelKey: string; items: NavItem[] }[] = [
    {
      labelKey: 'groups.operate',
      items: [
        { titleKey: 'overview', href: '/platform', icon: IconLayoutDashboard },
        { titleKey: 'schools', href: '/platform/tenants', icon: IconSchool },
      ],
    },
    {
      labelKey: 'groups.money',
      items: [
        {
          titleKey: 'paymentRequests',
          href: '/platform/billing',
          icon: IconReceipt,
          badge: pendingBillingCount,
          badgeTone: 'warning',
        },
        {
          titleKey: 'billingHealth',
          href: '/platform/billing-health',
          icon: IconAlertTriangle,
          badge: atRiskCount,
          badgeTone: 'danger',
        },
        { titleKey: 'revenue', href: '/platform/revenue', icon: IconReportMoney },
        { titleKey: 'payouts', href: '/platform/payouts', icon: IconWallet },
      ],
    },
    {
      labelKey: 'groups.configure',
      items: [
        { titleKey: 'plans', href: '/platform/plans', icon: IconBuildingStore },
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
                <span className="font-semibold">{t('brand')}</span>
                <span className="text-xs text-muted-foreground">{t('brandSubtitle')}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const href = `${localePrefix}${item.href}`
                  const title = t(item.titleKey)
                  // Segment match, not prefix match — `/platform/billing` must not
                  // light up on `/platform/billing-health`.
                  const isActive = item.href === '/platform'
                    ? pathname === href
                    : pathname === href || pathname.startsWith(`${href}/`)
                  const showBadge = item.badge !== undefined && item.badge > 0
                  return (
                    <SidebarMenuItem key={item.titleKey}>
                      <SidebarMenuButton
                        render={<Link href={href} />}
                        isActive={isActive}
                        tooltip={showBadge ? t('badgeTooltip', { title, count: item.badge ?? 0 }) : title}
                      >
                        <item.icon />
                        <span>{title}</span>
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
            <SidebarMenuButton
              render={<Link href={`${localePrefix}/dashboard/admin`} />}
              tooltip={t('backToSchool')}
            >
              <IconExternalLink />
              <span>{t('backToSchool')}</span>
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
