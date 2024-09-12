import Link from 'next/link'

import UserSignupForm from '@/components/auth/UserSignupForm'
import { getI18n } from '@/app/locales/server'

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
                        {t('auth.register.createAccount')}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {t('auth.register.helpText')}
                    </p>
                </div>
                <UserSignupForm redirect="/dashboard" />
                {searchParams.message && (
                    <p className="text-center text-red-500 text-sm">
                        {searchParams.message}
                    </p>
                )}
                <p className="px-8 text-center text-sm text-muted-foreground">
                    {t('auth.register.byClicking')}{' '}
                    <Link
                        href="/terms"
                        className="underline underline-offset-4 hover:text-primary"
                    >
                        {t('auth.register.terms')}
                    </Link>{' '}
                    {t('auth.register.and')}{' '}
                    <Link
                        href="/privacy"
                        className="underline underline-offset-4 hover:text-primary"
                    >
                        {t('auth.register.policy')}
                    </Link>
                    .
                </p>
                <Link
                    href="/auth/login"
                    className="text-center text-sm cursor-pointer text-primary"
                >
                    {t('auth.register.alreadyHaveAccount')}
                </Link>
            </div>
        </>
    )
}
