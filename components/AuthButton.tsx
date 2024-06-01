import { buttonVariants, Button } from '@/components/ui/button'

import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AuthButton () {
  const cookieStore = cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user }
  } = await supabase.auth.getUser()

  const signOut = async () => {
    'use server'

    const cookieStore = cookies()
    const supabase = createClient(cookieStore)
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
