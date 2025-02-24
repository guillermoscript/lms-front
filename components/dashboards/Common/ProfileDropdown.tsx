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
import LocaleButtons from '@/components/ui/LocaleButtons'
import { getServerUserRole } from '@/utils/supabase/getUserRole'
import { createClient } from '@/utils/supabase/server'
import { getScopedI18n } from '@/app/locales/server'

export default async function ProfileDropdown () {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return <AuthButton />
    }

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

    const t = await getScopedI18n('ProfileDropdown')

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Avatar
                    id='profile'
                >
                    <AvatarImage src={profile.data.avatar_url} />
                    <AvatarFallback className='capitalize'>
                        {profile.data.full_name ? profile.data.full_name[0] : user.email[0]}
                    </AvatarFallback>
                </Avatar>

            </DropdownMenuTrigger>
            <DropdownMenuContent className="flex flex-col gap-2 p-2" align="end">
                <DropdownMenuLabel>
                    {t('myProfile')}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                    <Link href={`/dashboard/${userRole}/account`}>
                        {t('account')}
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem>
                    <LocaleButtons />
                </DropdownMenuItem>
                <DropdownMenuItem>
                    <AuthButton />
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
