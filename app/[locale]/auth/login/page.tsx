import { Mail } from 'lucide-react'
import Link from 'next/link'

import UserLoginForm from '@/components/auth/UserLoginForm'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'

export default function Login ({
    searchParams
}: {
    searchParams: { message: string }
}) {
    return (
        <>
            <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
                <div className="flex flex-col space-y-2 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Login to your account
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Enter your email below to login
                    </p>
                </div>
                <UserLoginForm
                    redirect='/dashboard'
                />
                {searchParams.message && (
                    <Alert>
                        <Mail className="h-4 w-4" />
                        <AlertTitle>Heads up!</AlertTitle>
                        <AlertDescription>
                            {searchParams.message}
                        </AlertDescription>
                    </Alert>
                )}
                <Link
                    href="/auth/forgot-password"
                    className="text-center text-sm cursor-pointer text-primary"
                >
                    Forgot your password?
                </Link>
                <p className="text-center text-sm text-muted-foreground">
                    Don't have an account?
                </p>
                <Link
                    href="/auth/signup"
                    className={buttonVariants({ variant: 'secondary' })}
                >
                    Sign up
                </Link>
            </div>
        </>
    )
}
