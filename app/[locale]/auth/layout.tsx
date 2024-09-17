import { getI18n } from '@/app/locales/server'
import Header from '@/components/Header'
import ParticlesSection from '@/components/home/ParticlesSection'

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
            <ParticlesSection className="z-0">
                <div className="container z-10 relative min-h-screen lg:-mt-28 flex-col items-center justify-center md:grid">
                    {children}
                </div>
            </ParticlesSection>
        </>
    )
}
