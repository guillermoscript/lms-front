import { Mail } from 'lucide-react'
import Link from 'next/link'

import { getI18n } from '@/app/locales/server'
import FacebookOAuthFlow from '@/components/auth/FacebookOAuthFlow'
import GitHubOAuthFlow from '@/components/auth/GitHubOAuthFlow'
import GoogleOAuthFlow from '@/components/auth/GoogleOAuthFlow'
import UserLoginForm from '@/components/auth/UserLoginForm'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'

export default async function Login({
    searchParams,
}: {
    searchParams: { message: string }
}) {
    const t = await getI18n()

    return (
        <>
            <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
                <div className="flex flex-col space-y-2 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        {t('auth.login.loginHeader')}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {t('auth.login.helpText')}
                    </p>
                </div>

                <GitHubOAuthFlow />

                <FacebookOAuthFlow />

                <GoogleOAuthFlow />
                <hr />
                <UserLoginForm redirect="/dashboard" />
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
                    {t('auth.login.forgotPassword')}
                </Link>
                <p className="text-center text-sm text-muted-foreground">
                    {t('auth.login.dontHaveAccount')}{' '}
                    <Link className="text-purple-800" href="/auth/signup">
                        {t('auth.register.form.signUp')}
                    </Link>
                </p>
            </div>
        </>
    )
}
