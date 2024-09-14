
import { getI18n } from '@/app/locales/server'
import Header from '@/components/Header'

export default async function LoginLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const t = await getI18n()

    return (
        <>
            <Header>
                <></>
            </Header>
            <div className="container relative min-h-screen flex-col py-8 items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
                <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
                    <div className="absolute z-10 inset-0 bg-zinc-900 opacity-30" />
                    <div className="flex items-center text-lg font-medium">
                        <img
                            src="https://wp.villademarcos.com/wp-content/uploads/2024/08/image_fx_a_illustration_of_javascript_logo_in_the_styl12.png"
                            alt="Hero"
                            className="absolute inset-0 object-cover w-full h-full"
                        />
                        <p className="absolute z-20 text-4xl font-bold">
                            LMS AI Inc
                        </p>
                    </div>
                    <div className="relative z-20 mt-auto">
                        <p>{t('auth.login.description')}</p>
                    </div>
                </div>
                <div className="lg:p-8">{children}</div>
            </div>
        </>
    )
}
