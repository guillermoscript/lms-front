import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Button, buttonVariants } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/server'

export default async function AuthButton () {
    const cookieStore = cookies()
    const supabase = createClient()

    const {
        data: { user }
    } = await supabase.auth.getUser()

    const signOut = async () => {
        'use server'

        const cookieStore = cookies()
        const supabase = createClient()
        await supabase.auth.signOut()
        return redirect('/auth/login')
    }

    return (user != null)
        ? (
            <div className="flex items-center gap-4">
                <form action={signOut}>
                    <Button>
            Logout
                    </Button>
                </form>
                <Link href="/dashboard">
                    <Button
                        variant={'link'}
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
