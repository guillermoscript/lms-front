"use client"

import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
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

interface UserNavProps {
  user: any
}

export function UserNav({ user }: UserNavProps) {
  const supabase = createClient()
  const router = useRouter()
  const t = useTranslations('userNav')
  const currentName = useCurrentUserName()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="relative h-8 w-8 rounded-full border border-border/50 overflow-hidden hover:scale-105 transition-transform">
            <CurrentUserAvatar />
          </Button>
        }
      />
      <DropdownMenuContent className="w-64 mt-2 rounded-2xl shadow-2xl border-border bg-popover/90 backdrop-blur-xl overflow-hidden" align="end" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal p-4">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-black leading-none text-foreground">
                {currentName || user?.user_metadata?.full_name || "User"}
              </p>
              <p className="text-xs leading-none text-muted-foreground truncate font-medium">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuItem className="rounded-xl m-1 cursor-pointer gap-2 focus:bg-primary/10 text-muted-foreground focus:text-accent-foreground font-medium" render={<Link href="/dashboard/student/profile" />}>
            <IconUser className="h-4 w-4" />
            <span>{t('profile')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="rounded-xl m-1 cursor-pointer gap-2 focus:bg-primary/10 text-muted-foreground focus:text-accent-foreground font-medium" render={<Link href="/dashboard/settings" />}>
            <IconSettings className="h-4 w-4" />
            <span>{t('settings')}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="rounded-xl m-1 cursor-pointer gap-2 text-red-500/80 focus:bg-red-500/10 focus:text-red-500 font-bold transition-colors"
            onClick={handleLogout}
          >
            <IconLogout className="h-4 w-4" />
            <span>{t('logout')}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="flex md:hidden" />
        <DropdownMenuGroup
          className="flex md:hidden p-2"
        >
          <GamificationHeaderCard />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
