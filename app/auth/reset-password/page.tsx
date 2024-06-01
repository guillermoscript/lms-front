import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function ResetPassword ({
  searchParams
}: {
  searchParams: {
    message: string
    error: string
    code: string
  }
}) {
  const resetPasswordFun = async (formData: FormData) => {
    'use server'

    const new_password = formData.get('password') as string
    const supabase = createClient()

    const { data, error } = await supabase.auth.updateUser({
      password: new_password
    })

    if (error != null) {
      console.log(error)
      return redirect('/auth/reset-password?error=Could not authenticate user')
    }

    return redirect(
      '/auth/reset-password?message=Great! Your password has been reset'
    )
  }

  return (
    <>
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Reset Password
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your new password below
            </p>
          </div>
          <form
            className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-foreground"
            action={resetPasswordFun}
          >
            <label className="text-md" htmlFor="password">
              New Password
            </label>
            <input
              className="rounded-md px-4 py-2 bg-inherit border mb-6"
              name="password"
              type="password"
            />
            <Button type="submit">Submit</Button>
          </form>
          {searchParams.error && (
          <Alert variant="destructive">
            <AlertTitle>Error!</AlertTitle>
            <AlertDescription>
              {searchParams.message}
            </AlertDescription>
          </Alert>
          )}
          {searchParams.message && (
          <Alert>
            <AlertTitle>Success!</AlertTitle>
            <AlertDescription>
              {searchParams.message}
            </AlertDescription>
          </Alert>
          )}

          <Link href="/auth/login" className="text-center text-sm cursor-pointer text-primary">
            Back to login
          </Link>
        </div>
      </div>
    </>
  )
}
