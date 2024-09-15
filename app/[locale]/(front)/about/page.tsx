import Image from 'next/image'

import { getScopedI18n } from '@/app/locales/server'
import { Timeline } from '@/components/ui/Acernity/TimeLine'

export default async function TimelineDemo() {
    const t = await getScopedI18n('aboutUs')

    const data = [
        {
            title: t('timeline.items.early2024.title'),
            content: (
                <div>
                    <p className="text-neutral-800 dark:text-neutral-200 text-xs md:text-sm font-normal mb-8">
                        {t('timeline.items.early2024.description1')}
                    </p>
                    <p className="text-neutral-800 dark:text-neutral-200 text-xs md:text-sm font-normal mb-8">
                        {t('timeline.items.early2024.description2')}
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <img
                            src="/img/about/google-competition.png"
                            alt="Google Competition"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                        <img
                            src="/img/about/lms-landing.png"
                            alt="LMS Landing"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                    </div>
                </div>
            ),
        },
        {
            title: t('timeline.items.early2023.title'),
            content: (
                <div>
                    <p className="text-neutral-800 dark:text-neutral-200 text-xs md:text-sm font-normal mb-8">
                        {t('timeline.items.early2023.description1')}
                    </p>
                    <p className="text-neutral-800 dark:text-neutral-200 text-xs md:text-sm font-normal mb-8">
                        {t('timeline.items.early2023.description2')}
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <img
                            src="/img/about/2024-09-15 18.40.17.jpg"
                            alt="Early stage app"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                        <img
                            src="/img/about/2024-09-15 18.40.41.jpg"
                            alt="Early stage app"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                        <img
                            src="/img/about/2024-09-15 18.40.22.jpg"
                            alt="Early stage app"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                        <img
                            src="/img/about/2024-09-15 18.40.28.jpg"
                            alt="Early stage app"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                    </div>
                </div>
            ),
        },
    ]
    return (
        <div className="w-full container py-4">
            <h1 className="text-6xl font-bold text-center mb-4">{t('title')}</h1>
            <Timeline data={data} />
            <section className="mb-16">

                <section className="mb-16 text-center">
                    <h2 className="text-4xl font-bold mb-4">{t('empoweringTheWorld')}</h2>
                    <p className="text-lg text-gray-600 mb-8">
                        {t('description')}
                    </p>
                    <div className="flex flex-wrap justify-center gap-8">
                        <TeamMember
                            name="Angel Afonso"
                            role="Senior Developer"
                            image="/img/feature(1).png"
                        />
                        <TeamMember
                            name="Guillermo Marin"
                            role="Senior Developer"
                            image="/img/feature(2).png"
                        />
                        <TeamMember
                            name="Hector Zurga"
                            role="Marketing Engineer"
                            image="/img/feature(3).png"
                        />
                    </div>
                </section>
            </section>
        </div>
    )
}

const TeamMember = ({ name, role, image }: { name: string; role: string; image: string }) => (
    <div className="text-center">
        <Image
            src={image}
            alt={name}
            width={300}
            height={300}
            className="rounded-lg mb-4"
        />
        <h3 className="text-xl font-semibold">{name}</h3>
        <p className="text-gray-600">{role}</p>
    </div>
)
