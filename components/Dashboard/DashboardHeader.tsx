import { BookIcon, SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { DarkThemeToggle } from '../DarkThemeToggle'
import AuthButton from '../AuthButton'

export default function DashboardHeader () {
  return (
    <header className="flex h-14 lg:h-[60px] items-center gap-4 border-b bg-gray-100/40 px-6 dark:bg-gray-800/40">
      <Link className="lg:hidden" href="#">
        <BookIcon className="h-6 w-6" />
        <span className="sr-only">Dashboard</span>
      </Link>
      <div className="w-full flex-1">
        <form>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <Input
              className="w-full bg-white shadow-none appearance-none pl-8 md:w-2/3 lg:w-1/3 dark:bg-gray-950"
              placeholder="Search lessons, courses, or students..."
              type="search"
            />
          </div>
        </form>
      </div>
      <DarkThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="rounded-full border border-gray-200 w-8 h-8 dark:border-gray-800"
            size="icon"
            variant="ghost"
          >
            <img
              alt="Avatar"
              className="rounded-full"
              height="32"
              src="/placeholder.svg"
              style={{
							  aspectRatio: '32/32',
							  objectFit: 'cover'
              }}
              width="32"
            />
            <span className="sr-only">Toggle user menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Link href="/dashboard/account">
              Account
            </Link>
          </DropdownMenuItem>
          <AuthButton />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
