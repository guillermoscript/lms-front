import Link from 'next/link'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function ForgotPassword ({
  searchParams
}: {
  searchParams: {
    message: string
    error: string
  }
}) {
  const forgotPasswordFun = async (formData: FormData) => {
    'use server'

    const email = formData.get('email') as string

    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:3000/auth/reset-password'
    })

    if (error != null) {
      console.log(error)
      return redirect('/auth/forgot-password?error=Could not authenticate user')
    }

    return redirect(
      '/auth/forgot-password?message=Check email to continue sign in process'
    )
  }

  return (
    <>
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Forgot Password
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your email below to create your account
            </p>
          </div>
          <form
            className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-foreground"
            action={forgotPasswordFun}
          >
            <label className="text-md" htmlFor="email">
              Email
            </label>
            <input
              className="rounded-md px-4 py-2 bg-inherit border mb-6"
              name="email"
              placeholder="you@example.com"
              required
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
