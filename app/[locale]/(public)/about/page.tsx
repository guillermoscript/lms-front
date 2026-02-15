import Link from "next/link";
import { getTranslations } from 'next-intl/server';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rocket, Shield, Zap, Users, Gem, GraduationCap, ArrowRight } from "lucide-react";

export default async function AboutPage() {
    const t = await getTranslations('about');

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white selection:bg-blue-500/30 overflow-hidden">
            {/* Subtle Background Glows */}
            <div className="absolute top-0 right-0 w-[800px] h-[600px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none translate-y-1/2 -translate-x-1/2" />

            <main className="relative z-10">
                {/* Hero Section */}
                <section className="container mx-auto max-w-6xl px-4 md:px-6 pt-32 pb-20">
                    <div className="flex flex-col items-center text-center space-y-8">
                        <Badge variant="secondary" className="bg-blue-900/20 text-blue-400 border-blue-800/50 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase">
                            {t('missionTitle')}
                        </Badge>

                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-500 max-w-4xl leading-tight">
                            {t('title')}
                        </h1>

                        <p className="text-xl text-zinc-400 max-w-2xl leading-relaxed">
                            {t('description')}
                        </p>

                        <div className="flex flex-wrap gap-4 justify-center">
                            <Link href="/">
                                <Button size="lg" className="h-12 px-8 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-base shadow-[0_0_20px_rgba(37,99,235,0.2)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)] transition-all">
                                    {t('visitHome')}
                                </Button>
                            </Link>
                            <Link href="/contact">
                                <Button size="lg" variant="outline" className="h-12 px-8 bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl text-base backdrop-blur-sm">
                                    {t('contact')}
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Stats Section */}
                <section className="container mx-auto max-w-6xl px-4 md:px-6 py-12">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { label: t('stats.students'), value: "10k+", icon: Users, color: "text-blue-400" },
                            { label: t('stats.courses'), value: "150+", icon: GraduationCap, color: "text-purple-400" },
                            { label: t('stats.teachers'), value: "50+", icon: Gem, color: "text-emerald-400" },
                        ].map((stat, i) => (
                            <div key={i} className="p-8 bg-zinc-900/30 border border-white/5 rounded-3xl hover:bg-zinc-900/50 transition-colors group">
                                <stat.icon className={`w-8 h-8 ${stat.color} mb-4 group-hover:scale-110 transition-transform`} />
                                <div className="text-4xl font-bold mb-1">{stat.value}</div>
                                <div className="text-zinc-500 font-medium">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Values Section */}
                <section className="container mx-auto max-w-6xl px-4 md:px-6 py-24">
                    <div className="text-center mb-16 space-y-4">
                        <h2 className="text-3xl font-bold">{t('values.title')}</h2>
                        <div className="h-1 w-20 bg-blue-600 mx-auto rounded-full" />
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Innovation */}
                        <div className="space-y-4 p-8 bg-gradient-to-b from-zinc-900/50 to-transparent border-t border-white/5 rounded-3xl">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
                                <Rocket className="w-6 h-6 text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold">{t('values.innovation.title')}</h3>
                            <p className="text-zinc-400 leading-relaxed text-sm">
                                {t('values.innovation.desc')}
                            </p>
                        </div>

                        {/* Accessibility */}
                        <div className="space-y-4 p-8 bg-gradient-to-b from-zinc-900/50 to-transparent border-t border-white/5 rounded-3xl">
                            <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center">
                                <Shield className="w-6 h-6 text-purple-400" />
                            </div>
                            <h3 className="text-xl font-bold">{t('values.accessibility.title')}</h3>
                            <p className="text-zinc-400 leading-relaxed text-sm">
                                {t('values.accessibility.desc')}
                            </p>
                        </div>

                        {/* Quality */}
                        <div className="space-y-4 p-8 bg-gradient-to-b from-zinc-900/50 to-transparent border-t border-white/5 rounded-3xl">
                            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                                <Zap className="w-6 h-6 text-emerald-400" />
                            </div>
                            <h3 className="text-xl font-bold">{t('values.quality.title')}</h3>
                            <p className="text-zinc-400 leading-relaxed text-sm">
                                {t('values.quality.desc')}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Features List Section */}
                <section className="container mx-auto max-w-5xl px-4 md:px-6 py-20 border-t border-white/5">
                    <div className="bg-zinc-900/20 rounded-[2.5rem] border border-white/5 p-8 md:p-12 overflow-hidden relative">
                        {/* Decorative element */}
                        <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
                            <GraduationCap size={200} className="text-blue-500" />
                        </div>

                        <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                            <div className="space-y-6">
                                <h3 className="text-2xl font-bold">{t('whatWeBuild')}</h3>
                                <ul className="space-y-4">
                                    {[t('feature1'), t('feature2'), t('feature3')].map((feature, i) => (
                                        <li key={i} className="flex items-start gap-4">
                                            <div className="mt-1 w-5 h-5 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                                <div className="w-2 h-2 bg-blue-400 rounded-full" />
                                            </div>
                                            <span className="text-zinc-300">{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="bg-black/40 p-1 rounded-2xl border border-white/10 shadow-2xl">
                                <div className="bg-[#111111] p-8 rounded-xl space-y-4 grayscale group-hover:grayscale-0 transition-all duration-700">
                                    <h4 className="text-sm font-bold text-blue-400 uppercase tracking-tighter">Educational Tech Stack</h4>
                                    <div className="space-y-2">
                                        <div className="h-2 bg-zinc-800 rounded-full w-full" />
                                        <div className="h-2 bg-zinc-800 rounded-full w-[80%]" />
                                        <div className="h-2 bg-zinc-800 rounded-full w-[90%]" />
                                    </div>
                                    <div className="pt-4 flex gap-4">
                                        <div className="w-10 h-10 bg-zinc-900 rounded-lg border border-white/5" />
                                        <div className="w-10 h-10 bg-zinc-900 rounded-lg border border-white/5" />
                                        <div className="w-10 h-10 bg-zinc-900 rounded-lg border border-white/5" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="container mx-auto max-w-6xl px-4 md:px-6 py-32 text-center">
                    <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-[3rem] p-12 md:p-24 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

                        <h2 className="text-4xl md:text-5xl font-bold mb-8 relative z-10">{t('cta.title')}</h2>
                        <Link href="/auth/sign-up" className="relative z-10">
                            <Button size="lg" className="h-14 px-10 bg-white text-black hover:bg-zinc-200 font-bold rounded-2xl text-lg transition-transform hover:scale-105">
                                {t('cta.button')} <ArrowRight className="ml-2 w-5 h-5" />
                            </Button>
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
