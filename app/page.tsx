import Footer from '@/components/Footer'
import Header from '@/components/Header'
import FeaturesSectionDemo from '@/components/home/FeaturedSection'
// import Header from '@/components/home/Header'
import ParticlesSection from '@/components/home/ParticlesSection'
import DotPattern from '@/components/magicui/dot-pattern'
import { cn } from '@/utils'

export default async function Index() {
    return (
        <>
            <Header />
            <div className="max-w-7xl mx-auto px-4 flex min-h-screen flex-col items-center justify-between">
                <ParticlesSection>
                    <section className="flex flex-col min-h-screen pt-20 md:pt-40 relative overflow-hidden">
                        <div className="flex flex-col items-center gap-4 text-center">
                            <a
                                className="rounded-2xl bg-muted px-4 py-1.5 text-sm font-medium"
                                target="_blank"
                                href="https://twitter.com/shadcn"
                                rel="noreferrer"
                            >
                                Follow along on Twitter
                            </a>
                            <h1 className="text-2xl md:text-4xl lg:text-8xl font-semibold max-w-6xl mx-auto text-center mt-6 relative z-10">
                                AI powered courses
                            </h1>
                            <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
                                LMS is a modern learning platform that combines
                                AI with human expertise to help you learn faster
                                and retain more knowledge.
                            </p>
                            <div className="space-x-4">
                                <a
                                    className="inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 rounded-md"
                                    href="/auth/login"
                                >
                                    Get Started
                                </a>
                                <a
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background border border-input hover:bg-accent hover:text-accent-foreground h-11 px-8 rounded-md"
                                    href="https://github.com/shadcn/taxonomy"
                                >
                                    GitHub
                                </a>
                            </div>
                        </div>
                    </section>
                </ParticlesSection>
                <FeaturesSectionDemo />
                <div className="relative flex h-[500px] w-full flex-col items-center justify-center overflow-hidden rounded-lg bg-background">
                    <div className="mx-auto flex flex-col items-center justify-center gap-4 text-center">
                        <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
                            Proudly Open Source
                        </h2>
                        <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
                            Taxonomy is open source and powered by open source
                            software. <br /> {/* */}The code is available on
                            {/* */}{' '}
                            <a
                                target="_blank"
                                rel="noreferrer"
                                className="underline underline-offset-4"
                                href="https://github.com/shadcn/taxonomy"
                            >
                                GitHub
                            </a>
                            .{/* */}{' '}
                        </p>
                    </div>
                    <DotPattern
                        className={cn(
                            '[mask-image:radial-gradient(300px_circle_at_center,white,transparent)]'
                        )}
                    />
                </div>
            </div>
            <Footer />
        </>
    )
}
