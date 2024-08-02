import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Button, buttonVariants } from '@/components/ui/button'
import { getServerUserRole } from '@/utils/supabase/getUserRole'
import { createClient } from '@/utils/supabase/server'

export default async function AuthButton () {
    const signOut = async () => {
        'use server'

        const cookieStore = cookies()
        const supabase = createClient()
        await supabase.auth.signOut()
        return redirect('/auth/login')
    }

    const userRola = await getServerUserRole()

    return (userRola != null)
        ? (
            <div className="flex items-center gap-4">
                <form action={signOut}>
                    <Button
                        variant='outline'
                    >
            Logout
                    </Button>
                </form>
                <Link href={`/dashboard/${userRola}`}>
                    <Button
                        variant='default'
                    >
            Dashboard
                    </Button>
                </Link>
            </div>
        )
        : (
            <Link
                href="/auth/login"
                className={buttonVariants({ variant: 'outline' })}
            >
        Login
            </Link>
        )
}
