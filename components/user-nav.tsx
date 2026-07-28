"use client"

import Link from "next/link"
import type { User } from "@supabase/supabase-js"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconBug, IconLogout, IconSettings, IconUser } from "@tabler/icons-react"
import { GamificationHeaderCard } from "./gamification/gamification-header-card"
import { CurrentUserAvatar } from "./current-user-avatar"
import { useLogout } from "@/hooks/use-logout"
import { openFeedbackDialog } from "@/lib/sentry/feedback"

interface UserNavProps {
  user: User | null
}

export function UserNav({ user }: UserNavProps) {
  const t = useTranslations('userNav')
  const currentName = user?.user_metadata?.full_name || user?.email || "User"
  const logout = useLogout()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button data-testid="user-nav-trigger" variant="ghost" className="relative h-8 w-8 rounded-full border border-border/50 overflow-hidden transition-colors">
            <CurrentUserAvatar />
          </Button>
        }
      />
      <DropdownMenuContent className="w-64 mt-2 rounded-xl shadow-lg border-border bg-popover overflow-hidden" align="end" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal p-4">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-semibold leading-none text-foreground">
                {currentName}
              </p>
              <p className="text-xs leading-none text-muted-foreground truncate">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuItem className="rounded-lg mx-1 cursor-pointer gap-2 focus:bg-accent text-muted-foreground focus:text-accent-foreground" render={<Link href="/dashboard/settings" />}>
            <IconUser className="h-4 w-4" />
            <span>{t('profile')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="rounded-lg mx-1 cursor-pointer gap-2 focus:bg-accent text-muted-foreground focus:text-accent-foreground" render={<Link href="/dashboard/settings" />}>
            <IconSettings className="h-4 w-4" />
            <span>{t('settings')}</span>
          </DropdownMenuItem>
          {/* Discoverable entry point for bug reports. The floating puck is fast for
              people who know it's there; this is how everyone else finds it, and it
              costs no screen space. */}
          <DropdownMenuItem
            className="rounded-lg mx-1 cursor-pointer gap-2 focus:bg-accent text-muted-foreground focus:text-accent-foreground"
            onClick={() => { void openFeedbackDialog() }}
          >
            <IconBug className="h-4 w-4" />
            <span>{t('reportProblem')}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="rounded-lg mx-1 cursor-pointer gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive font-medium transition-colors"
            onClick={logout}
          >
            <IconLogout className="h-4 w-4" />
            <span>{t('logout')}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {/* #586: `lg`, matching the header's gate in
            app/[locale]/dashboard/layout.tsx. These two breakpoints are a pair —
            whenever the header hides the card, this has to show it, or the
            streak and coins become unreachable between 768px and 1023px. */}
        <DropdownMenuSeparator className="flex lg:hidden" />
        <DropdownMenuGroup className="flex lg:hidden p-2">
          <GamificationHeaderCard />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
