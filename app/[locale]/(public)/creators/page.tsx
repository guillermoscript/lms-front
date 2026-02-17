import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTranslations } from 'next-intl/server';
import {
    Sparkles,
    Trophy,
    Zap,
    FileText,
    ClipboardCheck,
    Code2,
    CreditCard,
    BarChart3,
    LayoutDashboard,
    ArrowRight,
    Check,
    X,
    Minus
} from "lucide-react";

export default async function CreatorsPage() {
    const t = await getTranslations('creators');

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
                    <div className="flex flex-col items-center text-center max-w-4xl mx-auto space-y-10">
                        <Badge variant="secondary" className="bg-blue-900/20 text-blue-400 border-blue-800/50 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase flex items-center gap-2 w-fit">
                            <Sparkles className="w-3.5 h-3.5 fill-current" />
                            {t('badge')}
                        </Badge>

                        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight leading-[1.1] bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-500">
                            {t('heroTitle')}
                        </h1>

                        <p className="text-xl text-zinc-400 max-w-2xl leading-relaxed font-medium">
                            {t('heroSubtitle')}
                        </p>

                        <div className="flex flex-wrap gap-5 justify-center">
                            <Link href="/auth/sign-up">
                                <Button size="lg" className="h-14 px-10 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-lg shadow-[0_0_25px_rgba(37,99,235,0.25)] hover:shadow-[0_0_35px_rgba(37,99,235,0.4)] transition-all active:scale-95">
                                    {t('ctaHero')}
                                    <ArrowRight className="ml-2 w-5 h-5" />
                                </Button>
                            </Link>
                            <a href="#features">
                                <Button size="lg" variant="outline" className="h-14 px-10 bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-xl text-lg backdrop-blur-sm transition-all">
                                    {t('ctaSecondary')}
                                </Button>
                            </a>
                        </div>

                        {/* Social Proof */}
                        <div className="pt-8 border-t border-white/5 w-full flex flex-col md:flex-row items-center justify-center gap-8 text-sm text-zinc-500">
                            <span>{t('socialProof.creators')}</span>
                            <span className="hidden md:block text-zinc-700">|</span>
                            <span>{t('socialProof.students')}</span>
                            <span className="hidden md:block text-zinc-700">|</span>
                            <span>{t('socialProof.revenue')}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Key Differentiators */}
            <section className="py-24 border-y border-white/5 bg-zinc-900/20 backdrop-blur-sm">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">{t('differentiators.title')}</h2>
                        <p className="text-zinc-400 text-lg">{t('differentiators.subtitle')}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* AI Auto-Grading */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/20 group-hover:scale-110 transition-transform">
                                <Sparkles className="w-7 h-7 text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{t('differentiators.ai.title')}</h3>
                            <p className="text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('differentiators.ai.description')}
                            </p>
                        </div>

                        {/* Built-in Gamification */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-6 border border-amber-500/20 group-hover:scale-110 transition-transform">
                                <Trophy className="w-7 h-7 text-amber-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{t('differentiators.gamification.title')}</h3>
                            <p className="text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('differentiators.gamification.description')}
                            </p>
                        </div>

                        {/* Modern & Fast */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                                <Zap className="w-7 h-7 text-emerald-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{t('differentiators.modern.title')}</h3>
                            <p className="text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('differentiators.modern.description')}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section id="features" className="py-32 relative">
                <div className="container mx-auto px-4 md:px-6 relative z-10">
                    <div className="text-center max-w-3xl mx-auto mb-20 space-y-6">
                        <Badge variant="outline" className="border-zinc-800 text-zinc-400 rounded-full px-4 py-1">
                            {t('features.badge')}
                        </Badge>
                        <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">{t('features.title')}</h2>
                        <p className="text-zinc-400 text-lg leading-relaxed">
                            {t('features.subtitle')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Rich Content Editor */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-8 border border-blue-500/20 group-hover:scale-110 transition-transform">
                                <FileText className="w-6 h-6 text-blue-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-3">{t('features.editor.title')}</h3>
                            <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('features.editor.description')}
                            </p>
                        </div>

                        {/* Exam Builder */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-8 border border-purple-500/20 group-hover:scale-110 transition-transform">
                                <ClipboardCheck className="w-6 h-6 text-purple-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-3">{t('features.exams.title')}</h3>
                            <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('features.exams.description')}
                            </p>
                        </div>

                        {/* Exercise System */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-8 border border-amber-500/20 group-hover:scale-110 transition-transform">
                                <Code2 className="w-6 h-6 text-amber-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-3">{t('features.exercises.title')}</h3>
                            <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('features.exercises.description')}
                            </p>
                        </div>

                        {/* Stripe Payments */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-8 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                                <CreditCard className="w-6 h-6 text-emerald-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-3">{t('features.payments.title')}</h3>
                            <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('features.payments.description')}
                            </p>
                        </div>

                        {/* Student Dashboard */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-12 h-12 bg-pink-500/10 rounded-2xl flex items-center justify-center mb-8 border border-pink-500/20 group-hover:scale-110 transition-transform">
                                <LayoutDashboard className="w-6 h-6 text-pink-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-3">{t('features.dashboard.title')}</h3>
                            <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('features.dashboard.description')}
                            </p>
                        </div>

                        {/* Analytics */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl hover:bg-zinc-800/40 transition-all duration-300 group">
                            <div className="w-12 h-12 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-8 border border-cyan-500/20 group-hover:scale-110 transition-transform">
                                <BarChart3 className="w-6 h-6 text-cyan-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-3">{t('features.analytics.title')}</h3>
                            <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors">
                                {t('features.analytics.description')}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Comparison Table */}
            <section className="py-24 border-y border-white/5 bg-zinc-900/20 backdrop-blur-sm">
                <div className="container mx-auto px-4 md:px-6">
                    <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
                        <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">{t('comparison.title')}</h2>
                        <p className="text-zinc-400 text-lg">{t('comparison.subtitle')}</p>
                    </div>

                    <div className="max-w-4xl mx-auto overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-zinc-800">
                                    <th className="text-left py-4 px-4 text-sm font-medium text-zinc-500">{t('comparison.feature')}</th>
                                    <th className="text-center py-4 px-4">
                                        <span className="text-sm font-bold text-blue-400">LMS V2</span>
                                    </th>
                                    <th className="text-center py-4 px-4 text-sm font-medium text-zinc-500">Teachable</th>
                                    <th className="text-center py-4 px-4 text-sm font-medium text-zinc-500">Thinkific</th>
                                    <th className="text-center py-4 px-4 text-sm font-medium text-zinc-500">Udemy</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-zinc-800/50">
                                    <td className="py-4 px-4 text-sm text-zinc-300">{t('comparison.rows.aiGrading')}</td>
                                    <td className="py-4 px-4 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                                    <td className="py-4 px-4 text-center"><X className="w-5 h-5 text-zinc-600 mx-auto" /></td>
                                    <td className="py-4 px-4 text-center"><X className="w-5 h-5 text-zinc-600 mx-auto" /></td>
                                    <td className="py-4 px-4 text-center"><X className="w-5 h-5 text-zinc-600 mx-auto" /></td>
                                </tr>
                                <tr className="border-b border-zinc-800/50">
                                    <td className="py-4 px-4 text-sm text-zinc-300">{t('comparison.rows.gamification')}</td>
                                    <td className="py-4 px-4 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                                    <td className="py-4 px-4 text-center"><X className="w-5 h-5 text-zinc-600 mx-auto" /></td>
                                    <td className="py-4 px-4 text-center"><X className="w-5 h-5 text-zinc-600 mx-auto" /></td>
                                    <td className="py-4 px-4 text-center"><X className="w-5 h-5 text-zinc-600 mx-auto" /></td>
                                </tr>
                                <tr className="border-b border-zinc-800/50">
                                    <td className="py-4 px-4 text-sm text-zinc-300">{t('comparison.rows.openSource')}</td>
                                    <td className="py-4 px-4 text-center"><Check className="w-5 h-5 text-emerald-400 mx-auto" /></td>
                                    <td className="py-4 px-4 text-center"><X className="w-5 h-5 text-zinc-600 mx-auto" /></td>
                                    <td className="py-4 px-4 text-center"><X className="w-5 h-5 text-zinc-600 mx-auto" /></td>
                                    <td className="py-4 px-4 text-center"><X className="w-5 h-5 text-zinc-600 mx-auto" /></td>
                                </tr>
                                <tr className="border-b border-zinc-800/50">
                                    <td className="py-4 px-4 text-sm text-zinc-300">{t('comparison.rows.transactionFee')}</td>
                                    <td className="py-4 px-4 text-center text-sm font-semibold text-emerald-400">0%</td>
                                    <td className="py-4 px-4 text-center text-sm text-zinc-500">5%</td>
                                    <td className="py-4 px-4 text-center text-sm text-zinc-500">3%</td>
                                    <td className="py-4 px-4 text-center text-sm text-zinc-500">63%</td>
                                </tr>
                                <tr>
                                    <td className="py-4 px-4 text-sm text-zinc-300">{t('comparison.rows.startingPrice')}</td>
                                    <td className="py-4 px-4 text-center text-sm font-semibold text-emerald-400">{t('comparison.rows.free')}</td>
                                    <td className="py-4 px-4 text-center text-sm text-zinc-500">$39/mo</td>
                                    <td className="py-4 px-4 text-center text-sm text-zinc-500">$49/mo</td>
                                    <td className="py-4 px-4 text-center text-sm text-zinc-500">$0*</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-xs text-zinc-600 mt-4 text-center">{t('comparison.footnote')}</p>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section className="py-32 relative">
                <div className="container mx-auto px-4 md:px-6 relative z-10">
                    <div className="text-center max-w-3xl mx-auto mb-20 space-y-6">
                        <Badge variant="outline" className="border-zinc-800 text-zinc-400 rounded-full px-4 py-1">
                            {t('pricing.badge')}
                        </Badge>
                        <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">{t('pricing.title')}</h2>
                        <p className="text-zinc-400 text-lg leading-relaxed">
                            {t('pricing.subtitle')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
                        {/* Free */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl flex flex-col">
                            <h3 className="text-lg font-bold text-white mb-2">{t('pricing.free.name')}</h3>
                            <div className="mb-6">
                                <span className="text-4xl font-bold text-white">$0</span>
                                <span className="text-zinc-500 text-sm">/{t('pricing.mo')}</span>
                            </div>
                            <ul className="space-y-3 mb-8 flex-1">
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.free.f1')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.free.f2')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.free.f3')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.free.f4')}
                                </li>
                            </ul>
                            <Link href="/auth/sign-up">
                                <Button variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl">
                                    {t('pricing.getStarted')}
                                </Button>
                            </Link>
                        </div>

                        {/* Creator */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl flex flex-col">
                            <h3 className="text-lg font-bold text-white mb-2">{t('pricing.creator.name')}</h3>
                            <div className="mb-6">
                                <span className="text-4xl font-bold text-white">$39</span>
                                <span className="text-zinc-500 text-sm">/{t('pricing.mo')}</span>
                            </div>
                            <ul className="space-y-3 mb-8 flex-1">
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.creator.f1')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.creator.f2')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.creator.f3')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.creator.f4')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.creator.f5')}
                                </li>
                            </ul>
                            <Link href="/auth/sign-up">
                                <Button variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl">
                                    {t('pricing.getStarted')}
                                </Button>
                            </Link>
                        </div>

                        {/* Pro - Highlighted */}
                        <div className="bg-zinc-900/50 border-2 border-blue-600/50 p-8 rounded-3xl flex flex-col relative">
                            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white border-0 rounded-full px-4 py-1 text-xs">
                                {t('pricing.popular')}
                            </Badge>
                            <h3 className="text-lg font-bold text-white mb-2">{t('pricing.pro.name')}</h3>
                            <div className="mb-6">
                                <span className="text-4xl font-bold text-white">$99</span>
                                <span className="text-zinc-500 text-sm">/{t('pricing.mo')}</span>
                            </div>
                            <ul className="space-y-3 mb-8 flex-1">
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.pro.f1')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.pro.f2')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.pro.f3')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.pro.f4')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.pro.f5')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.pro.f6')}
                                </li>
                            </ul>
                            <Link href="/auth/sign-up">
                                <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-[0_0_25px_rgba(37,99,235,0.25)]">
                                    {t('pricing.getStarted')}
                                </Button>
                            </Link>
                        </div>

                        {/* Business */}
                        <div className="bg-zinc-900/30 border border-zinc-800/50 p-8 rounded-3xl flex flex-col">
                            <h3 className="text-lg font-bold text-white mb-2">{t('pricing.business.name')}</h3>
                            <div className="mb-6">
                                <span className="text-4xl font-bold text-white">$249</span>
                                <span className="text-zinc-500 text-sm">/{t('pricing.mo')}</span>
                            </div>
                            <ul className="space-y-3 mb-8 flex-1">
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.business.f1')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.business.f2')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.business.f3')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.business.f4')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.business.f5')}
                                </li>
                                <li className="flex items-center gap-2 text-sm text-zinc-400">
                                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                                    {t('pricing.business.f6')}
                                </li>
                            </ul>
                            <Link href="/auth/sign-up">
                                <Button variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl">
                                    {t('pricing.contactSales')}
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="py-24 relative overflow-hidden">
                <div className="container mx-auto px-4 md:px-6 relative z-10">
                    <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-[2.5rem] p-12 md:p-20 text-center relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-transform duration-1000 group-hover:scale-110" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

                        <div className="max-w-3xl mx-auto space-y-8 relative z-10">
                            <h2 className="text-4xl md:text-6xl font-bold text-white tracking-tight">
                                {t('cta.title')}
                            </h2>
                            <p className="text-blue-100 text-xl max-w-2xl mx-auto font-medium">
                                {t('cta.subtitle')}
                            </p>
                            <Link href="/auth/sign-up">
                                <Button size="lg" className="h-14 px-10 bg-white text-blue-600 hover:bg-blue-50 font-bold rounded-xl text-lg transition-all active:scale-95 shadow-xl shadow-black/10">
                                    {t('cta.button')}
                                    <ArrowRight className="ml-2 w-5 h-5" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer space */}
            <div className="h-20" />
        </div>
    );
}
