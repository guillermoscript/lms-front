"use client"

import Link from "next/link"
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
import { IconLogout, IconSettings, IconUser } from "@tabler/icons-react"
import { GamificationHeaderCard } from "./gamification/gamification-header-card"
import { CurrentUserAvatar } from "./current-user-avatar"
import { useCurrentUserName } from "@/hooks/use-current-user-name"
import { useLogout } from "@/hooks/use-logout"

interface UserNavProps {
  user: any
}

export function UserNav({ user }: UserNavProps) {
  const t = useTranslations('userNav')
  const currentName = useCurrentUserName()
  const logout = useLogout()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="relative h-8 w-8 rounded-full border border-border/50 overflow-hidden transition-colors">
            <CurrentUserAvatar />
          </Button>
        }
      />
      <DropdownMenuContent className="w-64 mt-2 rounded-xl shadow-lg border-border bg-popover overflow-hidden" align="end" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal p-4">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-semibold leading-none text-foreground">
                {currentName || user?.user_metadata?.full_name || "User"}
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
        <DropdownMenuSeparator className="flex md:hidden" />
        <DropdownMenuGroup className="flex md:hidden p-2">
          <GamificationHeaderCard />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
