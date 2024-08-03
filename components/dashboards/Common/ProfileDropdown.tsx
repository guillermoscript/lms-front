import Link from 'next/link'

import AuthButton from '@/components/AuthButton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
                <Avatar>
                    <AvatarImage src={profile.data.avatar_url} />
                    <AvatarFallback className='capitalize'>
                        {profile.data.full_name ? profile.data.full_name[0] : user.email[0]}
                    </AvatarFallback>
                </Avatar>

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
