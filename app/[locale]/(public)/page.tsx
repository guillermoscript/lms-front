import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    ArrowUpRight,
    Zap,
    Code2,
    Users,
    Star,
    ArrowRight,
    Shield,
    Rocket,
    GraduationCap,
    Gem,
    CheckCircle2
} from "lucide-react";
import { VideoPlayerMock } from "@/components/public/video-player-mock";
import { Badge } from "@/components/ui/badge";
import { getTranslations } from 'next-intl/server';

export default async function LandingPage() {
    const t = await getTranslations('landing');

    return (
        <div className="flex flex-col min-h-screen bg-[#0A0A0A] overflow-hidden selection:bg-blue-500/30">
            {/* Background Glows */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
                <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[20%] left-[-10%] w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px]" />
            </div>

            {/* Hero Section */}
            <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32">
                <div className="container mx-auto px-4 md:px-6 relative z-10">
                    <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                        <div className="flex flex-col items-start space-y-10">
                            <div className="space-y-4">
                                <Badge variant="secondary" className="bg-blue-900/20 text-blue-400 border-blue-800/50 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase flex items-center gap-2 w-fit">
                                    <Zap className="w-3.5 h-3.5 fill-current" />
                                    {t('poweredBy')}
                                </Badge>
                                <h1 className="text-6xl lg:text-8xl font-bold tracking-tight text-white leading-[1.05] bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-500"
                                    dangerouslySetInnerHTML={{ __html: t.raw('heroTitle') }} />
                                <p className="text-xl text-zinc-400 max-w-xl leading-relaxed font-medium">
                                    {t('heroSubtitle')}
                                </p>
                                <p className="text-lg text-zinc-500 max-w-xl leading-relaxed">
                                    {t('heroDescription')}
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-5">
                                <Link href="/auth/sign-up">
                                    <Button size="lg" className="h-14 px-10 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-lg shadow-[0_0_25px_rgba(37,99,235,0.25)] hover:shadow-[0_0_35px_rgba(37,99,235,0.4)] transition-all active:scale-95">
                                        {t('getStarted')}
                                    </Button>
                                </Link>
                                <Link href="/courses">
                                    <Button size="lg" variant="outline" className="h-14 px-10 bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-xl text-lg backdrop-blur-sm transition-all">
                                        {t('exploreCourses')}
                                    </Button>
                                </Link>
                            </div>

                            {/* Trust badges */}
                            <div className="pt-4 border-t border-white/5 w-full flex flex-col gap-6">
                                <div className="flex items-center gap-4">
                                    <div className="flex -space-x-3">
                                        {[1, 2, 3, 4].map((i) => (
                                            <div key={i} className="w-10 h-10 rounded-full border-2 border-[#0A0A0A] bg-zinc-800 overflow-hidden ring-1 ring-zinc-700">
                                                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=user${i}`} alt="user" />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-sm">
                                        <div className="flex items-center gap-1 text-yellow-500">
                                            {[1, 2, 3, 4, 5].map((s) => <Star key={s} className="w-3.5 h-3.5 fill-current" />)}
                                        </div>
                                        <p className="text-zinc-400 font-medium">{t('stats.rating')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="relative group">
                            <div className="relative z-10 transition-transform duration-500 group-hover:-translate-y-2">
                                <VideoPlayerMock />
                            </div>
                            {/* Glow effects */}
                            <div className="absolute -inset-10 bg-blue-600/10 rounded-full blur-[80px] -z-10 opacity-50"></div>
                            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 via-transparent to-purple-500/20 rounded-2xl -z-10 group-hover:scale-105 transition-transform duration-700"></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats section */}
            <section className="py-16 border-y border-white/5 bg-zinc-900/20 backdrop-blur-sm">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-8 justify-items-center">
                        <div className="text-center">
                            <div className="text-3xl font-bold text-white mb-1">{t('stats.students').split(' ')[0]}</div>
                            <div className="text-sm text-zinc-500 font-medium tracking-wide uppercase">{t('stats.students').split(' ')[1]}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-3xl font-bold text-white mb-1">{t('stats.courses').split(' ')[0]}</div>
                            <div className="text-sm text-zinc-500 font-medium tracking-wide uppercase">{t('stats.courses').split(' ')[1]}</div>
                        </div>
                        <div className="text-center col-span-2 md:col-span-1">
                            <div className="text-3xl font-bold text-white mb-1">{t('stats.rating').split(' ')[0]}</div>
                            <div className="text-sm text-zinc-500 font-medium tracking-wide uppercase">{t('stats.rating').split(' ')[1]}</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-32 relative">
                <div className="container mx-auto px-4 md:px-6 relative z-10">
                    <div className="text-center max-w-3xl mx-auto mb-20 space-y-6">
                        <Badge variant="outline" className="border-zinc-800 text-zinc-400 rounded-full px-4 py-1">
                            {t('featuresTitle')}
                        </Badge>
                        <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">{t('featuresTitle')}</h2>
                        <p className="text-zinc-400 text-lg leading-relaxed">
                            {t('featuresDescription')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Feature Cards */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-8 border border-blue-500/20 group-hover:scale-110 transition-transform">
                                <Rocket className="w-6 h-6 text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-4">{t('feature1Title')}</h3>
                            <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('feature1Description')}
                            </p>
                        </div>

                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-8 border border-purple-500/20 group-hover:scale-110 transition-transform">
                                <Code2 className="w-6 h-6 text-purple-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-4">{t('feature2Title')}</h3>
                            <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('feature2Description')}
                            </p>
                        </div>

                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-8 border border-amber-500/20 group-hover:scale-110 transition-transform">
                                <Gem className="w-6 h-6 text-amber-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-4">{t('feature3Title')}</h3>
                            <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('feature3Description')}
                            </p>
                        </div>

                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-8 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                                <Shield className="w-6 h-6 text-emerald-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-4">{t('feature4Title')}</h3>
                            <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('feature4Description')}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 relative overflow-hidden">
                <div className="container mx-auto px-4 md:px-6 relative z-10">
                    <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-[2.5rem] p-12 md:p-20 text-center relative overflow-hidden group">
                        {/* Decorative circles */}
                        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-transform duration-1000 group-hover:scale-110" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

                        <div className="max-w-3xl mx-auto space-y-8 relative z-10">
                            <h2 className="text-4xl md:text-6xl font-bold text-white tracking-tight">
                                {t('cta.title')}
                            </h2>
                            <p className="text-blue-100 text-xl max-w-2xl mx-auto font-medium">
                                {t('cta.description')}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                                <Link href="/auth/sign-up">
                                    <Button size="lg" className="h-14 px-10 bg-white text-blue-600 hover:bg-blue-50 font-bold rounded-xl text-lg transition-all active:scale-95 shadow-xl shadow-black/10">
                                        {t('cta.button')}
                                        <ArrowRight className="ml-2 w-5 h-5" />
                                    </Button>
                                </Link>
                                <Link href="/about">
                                    <Button size="lg" variant="outline" className="h-14 px-10 border-white/20 bg-white/10 text-white hover:bg-white/20 rounded-xl text-lg backdrop-blur-md">
                                        {t('poweredBy')}
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer space */}
            <div className="h-20" />
        </div>
    );
}

