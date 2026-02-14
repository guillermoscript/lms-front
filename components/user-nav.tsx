"use client"

import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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

interface UserNavProps {
  user: any
}

export function UserNav({ user }: UserNavProps) {
  const supabase = createClient()
  const router = useRouter()
  const t = useTranslations('userNav')

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  const userInitial = user?.email?.[0].toUpperCase() || "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar size="sm">
              <AvatarImage src={user?.user_metadata?.avatar_url} alt={user?.email} />
              <AvatarFallback>{userInitial}</AvatarFallback>
            </Avatar>
          </Button>
        }
      />
      <DropdownMenuContent className="w-56" align="end" sideOffset={8}>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user?.user_metadata?.full_name || "User"}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/dashboard/profile" />}>
            <IconUser className="mr-2 h-4 w-4" />
            <span>{t('profile')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
            <IconSettings className="mr-2 h-4 w-4" />
            <span>{t('settings')}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <IconLogout className="mr-2 h-4 w-4" />
          <span>{t('logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
