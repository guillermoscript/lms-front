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
            <div className="container relative min-h-screen flex-col items-center justify-center md:grid">
                <div className="lg:p-8">{children}</div>
            </div>
        </>
    )
}
