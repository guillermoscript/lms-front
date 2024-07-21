import Link from 'next/link'

import AuthButton from '@/components/AuthButton'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { getServerUserRole } from '@/utils/supabase/getUserRole'
import { createClient } from '@/utils/supabase/server'

export default async function ProfileDropdown () {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()
    const user = userData.data.user
    const userRole = await getServerUserRole()

    const profile = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (profile.error) {
        console.error(profile.error)
        return null
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    className="rounded-full border border-gray-200 w-8 h-8 dark:border-gray-800"
                    size="icon"
                    variant="ghost"
                    id='profile'
                >
                    <img
                        alt="Avatar"
                        className="rounded-full"
                        height="32"
                        src={
                            profile.data.avatar_url ||
                            '/placeholder.svg'
                        }
                        style={{
                            aspectRatio: '32/32',
                            objectFit: 'cover'
                        }}
                        width="32"
                    />
                    <span className="sr-only">Toggle user menu</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="flex flex-col gap-2" align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                    <Link href={`/dashboard/${userRole}/account`}>
                        Account
                    </Link>
                </DropdownMenuItem>
                <AuthButton />
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
