import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react'
import Link from 'next/link'

import { getI18n } from '@/app/locales/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ErrorAuthPage({
    searchParams
}: {
    searchParams: {
        errorDescription: string
    }
}) {
    const errorDescription = searchParams.errorDescription
    const emailError = 'Email link is invalid or has expired'
    const t = await getI18n()

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <div className="flex items-center justify-center mb-4">
                        <AlertCircle className="text-red-500" size={50} />
                    </div>
                    <CardTitle className="text-center text-2xl font-bold">
                        {t('auth.ErrorAuthPage.errorTitle')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-center text-gray-600 dark:text-gray-300 mb-6">
                        {errorDescription && errorDescription === emailError
                            ? t('auth.ErrorAuthPage.emailError')
                            : t('auth.ErrorAuthPage.genericError')}
                    </p>
                    {errorDescription === emailError && (
                        <div className="space-y-4">
                            <Button variant="outline" className="w-full" asChild>
                                <Link href="/auth/forgot-password">
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    {t('auth.ErrorAuthPage.requestNewLink')}
                                </Link>
                            </Button>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <Button variant="ghost" className="w-full" asChild>
                        <Link href="/auth/login">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            {t('auth.ErrorAuthPage.backToLogin')}
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
