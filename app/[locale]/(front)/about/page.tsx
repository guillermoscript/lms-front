import Image from 'next/image'

import { Timeline } from '@/components/ui/Acernity/TimeLine'

export default function TimelineDemo() {
    const data = [
        {
            title: 'Early 2024',
            content: (
                <div>
                    <p className="text-neutral-800 dark:text-neutral-200 text-xs md:text-sm font-normal mb-8">
            The Team started working on LMS-AI as a side project because whe knew that Google was creating a competition for the best AI project that uses their technology.
                    </p>
                    <p className="text-neutral-800 dark:text-neutral-200 text-xs md:text-sm font-normal mb-8">
            That was a huge opportunity for us and we decided to take it. We started working on the project and we were able to finish it in time for the competition.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <img
                            src="https://assets.aceternity.com/templates/startup-1.webp"
                            alt="startup template"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                        <img
                            src="https://assets.aceternity.com/templates/startup-2.webp"
                            alt="startup template"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                        <img
                            src="https://assets.aceternity.com/templates/startup-3.webp"
                            alt="startup template"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                        <img
                            src="https://assets.aceternity.com/templates/startup-4.webp"
                            alt="startup template"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                    </div>
                </div>
            ),
        },
        {
            title: 'Early 2023',
            content: (
                <div>
                    <p className="text-neutral-800 dark:text-neutral-200 text-xs md:text-sm font-normal mb-8">
            This project started as a thesis for Guillermo Marin, a student at the University Santa Maria. He was studying computer science and he wanted to create a project that would help students learn more effectively.
                    </p>
                    <p className="text-neutral-800 dark:text-neutral-200 text-xs md:text-sm font-normal mb-8">
            This was accepted by the university and he started working on it full-time
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <img
                            src="https://assets.aceternity.com/pro/hero-sections.png"
                            alt="hero template"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                        <img
                            src="https://assets.aceternity.com/features-section.png"
                            alt="feature template"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                        <img
                            src="https://assets.aceternity.com/pro/bento-grids.png"
                            alt="bento template"
                            width={500}
                            height={500}
                            className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
                        />
                        <img
                            src="https://assets.aceternity.com/cards.png"
                            alt="cards template"
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
            <h1 className="text-6xl font-bold text-center mb-4">About Us</h1>
            <Timeline data={data} />
            <section className="mb-16">

                <section className="mb-16 text-center">
                    <h2 className="text-4xl font-bold mb-4">Empowering the world with LMS-AI.</h2>
                    <p className="text-lg text-gray-600 mb-8">
            We're a team of programmers who loves to build and create. We're passionate about our work and we're always looking for new ways to improve our skills.
                    </p>
                    <div className="flex flex-wrap justify-center gap-8">
                        <TeamMember
                            name="Angel Afonso"
                            role="Senior Developer"
                            image="/img/feature(1).png"
                        />
                        <TeamMember
                            name="Guillermo Marin"
                            role="Principal Strategist"
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
