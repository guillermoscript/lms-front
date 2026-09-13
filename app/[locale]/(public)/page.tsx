import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Zap,
  Code2,
  Users,
  Shield,
  Rocket,
  GraduationCap,
  Gem,
  CheckCircle2,
  Brain,
  Trophy,
  Flame,
  BarChart3,
  Globe2,
  CreditCard,
  Bell,
  FileText,
  Layers,
  Sparkles,
  TrendingUp,
  Award,
  BookOpen,
  Play,
  MessageSquare,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getCurrentTenantId, getCurrentTenant } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SchoolLandingPage } from "@/components/public/school-landing-page";
import type { Metadata } from "next";
import { buildPageMetadata, getRequestBaseUrl } from "@/lib/seo";
import { JsonLd, organizationJsonLd } from "@/lib/structured-data";
import { PuckPageRenderer } from "@/components/public/landing-page/puck-page-renderer";
import type { Data } from "@measured/puck";
import { getLandingData } from "@/lib/puck/utils/landing-data";

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'seo' })
  return buildPageMetadata({ title: t('home.title'), description: t('defaultDescription'), path: '/', locale })
}

// Illustrative numbers for the gamification preview and the multi-tenant
// mock cards. They are UI mockups, not claims about the platform — every
// figure that read as a claim (student counts, ratings) was removed in #724.
const PREVIEW_XP = { current: 3240, total: 4000, percent: 81 }
const PREVIEW_LEADERS = [
  { rank: 1, name: "Maria S.", xp: 4820 },
  { rank: 2, name: "Carlos R.", xp: 4210 },
] as const
const MOCK_SCHOOLS = [
  { key: 'a', students: 124, courses: 8, tone: 'blue' },
  { key: 'b', students: 89, courses: 5, tone: 'purple' },
  { key: 'c', students: 312, courses: 14, tone: 'emerald' },
  { key: 'd', students: 47, courses: 3, tone: 'amber' },
] as const
const MOCK_SCHOOL_TONES: Record<(typeof MOCK_SCHOOLS)[number]['tone'], { wrap: string; icon: string; badge: string }> = {
  blue: { wrap: 'bg-blue-900/10 border-blue-800/30', icon: 'bg-blue-500/20 text-blue-400', badge: 'border-blue-800/50 text-blue-400' },
  purple: { wrap: 'bg-purple-900/10 border-purple-800/30', icon: 'bg-purple-500/20 text-purple-400', badge: 'border-purple-800/50 text-purple-400' },
  emerald: { wrap: 'bg-emerald-900/10 border-emerald-800/30', icon: 'bg-emerald-500/20 text-emerald-400', badge: 'border-emerald-800/50 text-emerald-400' },
  amber: { wrap: 'bg-amber-900/10 border-amber-800/30', icon: 'bg-amber-500/20 text-amber-400', badge: 'border-amber-800/50 text-amber-400' },
}

export default async function LandingPage() {
  // Branch to school landing page on subdomains
  const tenantId = await getCurrentTenantId()
  if (tenantId !== DEFAULT_TENANT_ID) {
    const [tenant, supabase, baseUrl] = await Promise.all([getCurrentTenant(), createClient(), getRequestBaseUrl()])
    if (tenant) {
      const orgStructuredData = organizationJsonLd({
        name: tenant.name,
        url: baseUrl,
        logo: tenant.logo_url,
      })
      // Custom landing pages are available on every plan (free is capped at one
      // page at creation time — see app/actions/admin/landing-pages.ts)
      const adminClient = createAdminClient()
      const { data: customPage } = await adminClient
        .from('landing_pages')
        .select('puck_data')
        .eq('tenant_id', tenantId)
        .eq('slug', 'home')
        .eq('is_published', true)
        .maybeSingle()
      if (customPage?.puck_data && typeof customPage.puck_data === 'object') {
        const landingData = await getLandingData(tenantId)
        return (
          <>
            <JsonLd data={orgStructuredData} />
            <PuckPageRenderer data={customPage.puck_data as unknown as Data} landingData={landingData} />
          </>
        )
      }

      // Fallback: default school landing page
      const { data: products } = await supabase
        .from('products')
        .select('product_id, name, description, price, currency, image')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(9)
      return (
        <>
          <JsonLd data={orgStructuredData} />
          <SchoolLandingPage tenant={tenant} products={products ?? []} />
        </>
      )
    }
  }

  const t = await getTranslations('home')

  const trustChips = [
    t('hero.trust.noCard'),
    t('hero.trust.freePlan'),
    t('hero.trust.subdomain'),
    t('hero.trust.openSource'),
  ]
  const schoolItems = ['subdomain', 'branding', 'payments', 'ai', 'analytics'] as const
  const learnerItems = ['progress', 'tutor', 'gamification', 'certificates', 'mdx'] as const
  const perks = [
    { key: 'xp', icon: Zap },
    { key: 'levels', icon: TrendingUp },
    { key: 'streaks', icon: Flame },
    { key: 'achievements', icon: Award },
    { key: 'coins', icon: Gem },
    { key: 'leaderboard', icon: BarChart3 },
  ] as const
  const previewBadges = ['firstExam', 'streak7', 'lessons10', 'firstComment'] as const
  const previewBadgeIcons: Record<(typeof previewBadges)[number], string> = {
    firstExam: '🎯',
    streak7: '🔥',
    lessons10: '📚',
    firstComment: '💬',
  }
  const features = [
    { key: 'mdx', icon: Code2, wrap: "bg-blue-500/10 border-blue-500/20", icon_: "text-blue-400" },
    { key: 'exams', icon: FileText, wrap: "bg-violet-500/10 border-violet-500/20", icon_: "text-violet-400" },
    { key: 'video', icon: Play, wrap: "bg-red-500/10 border-red-500/20", icon_: "text-red-400" },
    { key: 'exercises', icon: Brain, wrap: "bg-purple-500/10 border-purple-500/20", icon_: "text-purple-400" },
    { key: 'payments', icon: CreditCard, wrap: "bg-emerald-500/10 border-emerald-500/20", icon_: "text-emerald-400" },
    { key: 'plans', icon: Layers, wrap: "bg-cyan-500/10 border-cyan-500/20", icon_: "text-cyan-400" },
    { key: 'certificates', icon: Award, wrap: "bg-amber-500/10 border-amber-500/20", icon_: "text-amber-400" },
    { key: 'multiTenant', icon: Globe2, wrap: "bg-blue-500/10 border-blue-500/20", icon_: "text-blue-400" },
    { key: 'rls', icon: Shield, wrap: "bg-emerald-500/10 border-emerald-500/20", icon_: "text-emerald-400" },
    { key: 'notifications', icon: Bell, wrap: "bg-orange-500/10 border-orange-500/20", icon_: "text-orange-400" },
    { key: 'analytics', icon: BarChart3, wrap: "bg-violet-500/10 border-violet-500/20", icon_: "text-violet-400" },
    { key: 'i18n', icon: Globe2, wrap: "bg-pink-500/10 border-pink-500/20", icon_: "text-pink-400" },
  ] as const
  const steps = [
    { key: 'create', step: "01", icon: Rocket },
    { key: 'build', step: "02", icon: BookOpen },
    { key: 'enroll', step: "03", icon: Users },
  ] as const
  const tenantItems = ['subdomain', 'branding', 'students', 'payments', 'roles'] as const
  const tiers = [
    { key: 'free', features: ['f1', 'f2', 'f3'], highlight: false },
    { key: 'starter', features: ['f1', 'f2', 'f3'], highlight: false },
    { key: 'pro', features: ['f1', 'f2', 'f3', 'f4'], highlight: true },
    { key: 'business', features: ['f1', 'f2', 'f3', 'f4'], highlight: false },
  ] as const

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0A] overflow-hidden selection:bg-blue-500/30">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden="true">
        <div className="absolute top-[-10%] right-[-10%] w-[700px] h-[700px] bg-blue-500/8 rounded-full blur-[140px]" />
        <div className="absolute bottom-[30%] left-[-10%] w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-5%] right-[20%] w-[400px] h-[400px] bg-emerald-500/4 rounded-full blur-[100px]" />
      </div>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-36" aria-labelledby="home-hero-title">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="flex flex-col items-center text-center max-w-5xl mx-auto space-y-8">
            <Badge
              variant="secondary"
              className="bg-blue-900/20 text-blue-400 border-blue-800/50 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase flex items-center gap-2"
            >
              <Zap className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              {t('hero.badge')}
            </Badge>

            <h1
              id="home-hero-title"
              className="text-6xl lg:text-8xl font-black tracking-tight text-white leading-[1.05] bg-clip-text text-transparent bg-gradient-to-b from-white via-zinc-200 to-zinc-500"
              style={{ textWrap: "balance" }}
            >
              {t('hero.titleLead')}&nbsp;
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                {t('hero.titleHighlight')}
              </span>
            </h1>

            <p className="text-xl text-zinc-400 max-w-2xl leading-relaxed font-medium" style={{ textWrap: "pretty" }}>
              {t('hero.subtitle')}
            </p>

            <div className="flex flex-wrap gap-4 justify-center pt-2">
              <Link href="/create-school">
                <Button
                  size="lg"
                  className="h-14 px-10 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-lg shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:shadow-[0_0_45px_rgba(37,99,235,0.45)] transition-[box-shadow,background-color] duration-200 active:scale-95"
                >
                  {t('hero.ctaPrimary')}
                  <ArrowRight className="ml-2 w-5 h-5" aria-hidden="true" />
                </Button>
              </Link>
              <Link href="/courses">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 px-10 bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-xl text-lg backdrop-blur-sm transition-[background-color,color] duration-200"
                >
                  {t('hero.ctaSecondary')}
                </Button>
              </Link>
            </div>

            {/* Trust chips — only statements the product actually backs */}
            <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 pt-6 border-t border-white/5 w-full" role="list">
              {trustChips.map((chip) => (
                <li key={chip} className="flex items-center gap-2 text-sm text-zinc-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span>{chip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── For Whom ─────────────────────────────────────────── */}
      <section className="py-28 relative border-t border-white/5" aria-labelledby="home-audience-title">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <Badge variant="outline" className="border-zinc-800 text-zinc-400 rounded-full px-4 py-1">
              {t('audience.badge')}
            </Badge>
            <h2 id="home-audience-title" className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
              {t('audience.title')}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Schools */}
            <div className="bg-gradient-to-br from-blue-900/20 to-blue-900/5 border border-blue-800/30 rounded-3xl p-8 space-y-6">
              <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                <GraduationCap className="w-6 h-6 text-blue-400" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">{t('audience.schools.title')}</h3>
                <p className="text-zinc-400 leading-relaxed">{t('audience.schools.description')}</p>
              </div>
              <ul className="space-y-2" role="list">
                {schoolItems.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-zinc-300">
                    <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{t(`audience.schools.items.${item}`)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/create-school">
                <Button className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors duration-200">
                  {t('audience.schools.cta')}
                  <ArrowRight className="ml-2 w-4 h-4" aria-hidden="true" />
                </Button>
              </Link>
            </div>

            {/* Students */}
            <div className="bg-gradient-to-br from-purple-900/20 to-purple-900/5 border border-purple-800/30 rounded-3xl p-8 space-y-6">
              <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20">
                <BookOpen className="w-6 h-6 text-purple-400" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">{t('audience.learners.title')}</h3>
                <p className="text-zinc-400 leading-relaxed">{t('audience.learners.description')}</p>
              </div>
              <ul className="space-y-2" role="list">
                {learnerItems.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-zinc-300">
                    <CheckCircle2 className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{t(`audience.learners.items.${item}`)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/courses">
                <Button variant="outline" className="border-purple-800/50 bg-purple-900/20 text-purple-300 hover:text-white hover:bg-purple-800/40 rounded-xl transition-colors duration-200">
                  {t('audience.learners.cta')}
                  <ArrowRight className="ml-2 w-4 h-4" aria-hidden="true" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI Features ──────────────────────────────────────── */}
      <section className="py-28 relative bg-zinc-900/20" aria-labelledby="home-ai-title">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <Badge variant="secondary" className="bg-purple-900/20 text-purple-400 border-purple-800/50 rounded-full px-4 py-1">
              <Brain className="w-3.5 h-3.5 mr-1.5 inline" aria-hidden="true" />
              {t('ai.badge')}
            </Badge>
            <h2 id="home-ai-title" className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
              {t('ai.title')}
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed">{t('ai.subtitle')}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <article className="bg-purple-900/10 border border-purple-800/30 p-8 rounded-3xl space-y-4">
              <div className="w-11 h-11 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20">
                <Brain className="w-5 h-5 text-purple-400" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white">{t('ai.grading.title')}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{t('ai.grading.description')}</p>
              <p className="text-xs font-semibold text-purple-400">{t('ai.grading.note')}</p>
            </article>

            <article className="bg-blue-900/10 border border-blue-800/30 p-8 rounded-3xl space-y-4">
              <div className="w-11 h-11 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
                <MessageSquare className="w-5 h-5 text-blue-400" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white">{t('ai.tutor.title')}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{t('ai.tutor.description')}</p>
              <p className="text-xs font-semibold text-blue-400">{t('ai.tutor.note')}</p>
            </article>

            <article className="bg-amber-900/10 border border-amber-800/30 p-8 rounded-3xl space-y-4">
              <div className="w-11 h-11 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
                <Sparkles className="w-5 h-5 text-amber-400" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white">{t('ai.templates.title')}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{t('ai.templates.description')}</p>
              <p className="text-xs font-semibold text-amber-400">{t('ai.templates.note')}</p>
            </article>
          </div>
        </div>
      </section>

      {/* ── Gamification ─────────────────────────────────────── */}
      <section className="py-28 relative overflow-hidden" aria-labelledby="home-gamification-title">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <Badge variant="secondary" className="bg-amber-900/20 text-amber-400 border-amber-800/50 rounded-full px-4 py-1">
                <Trophy className="w-3.5 h-3.5 mr-1.5 inline" aria-hidden="true" />
                {t('gamification.badge')}
              </Badge>
              <h2 id="home-gamification-title" className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
                {t('gamification.title')}
              </h2>
              <p className="text-zinc-400 text-lg leading-relaxed">{t('gamification.subtitle')}</p>
              <ul className="space-y-4" role="list">
                {perks.map(({ key, icon: Icon }) => (
                  <li key={key} className="flex items-start gap-4">
                    <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20 shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-amber-400" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{t(`gamification.perks.${key}.title`)}</p>
                      <p className="text-zinc-500 text-sm">{t(`gamification.perks.${key}.description`)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Visual preview (illustrative mock UI) */}
            <div className="relative">
              <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-3xl p-6 space-y-4 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-400 text-sm font-medium">{t('gamification.preview.title')}</p>
                  <Badge variant="outline" className="border-amber-800/50 text-amber-400 text-xs">
                    {t('gamification.preview.level', { level: 7 })}
                  </Badge>
                </div>
                {/* XP bar */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                    <span>{t('gamification.preview.xpProgress')}</span>
                    <span>{t('gamification.preview.xpValue', { current: PREVIEW_XP.current, total: PREVIEW_XP.total })}</span>
                  </div>
                  <div
                    className="h-2.5 bg-zinc-800 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={PREVIEW_XP.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t('gamification.preview.xpProgress')}
                  >
                    <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full" style={{ width: `${PREVIEW_XP.percent}%` }} />
                  </div>
                </div>
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: `🔥 ${t('gamification.preview.streak')}`, value: t('gamification.preview.streakValue', { count: 12 }) },
                    { label: `🪙 ${t('gamification.preview.coins')}`, value: "840" },
                    { label: `🏆 ${t('gamification.preview.rank')}`, value: "#3" },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-zinc-800/50 rounded-xl p-3 text-center">
                      <p className="text-xs text-zinc-500 mb-1">{stat.label}</p>
                      <p className="text-white font-bold text-sm tabular-nums">{stat.value}</p>
                    </div>
                  ))}
                </div>
                {/* Recent achievements */}
                <div>
                  <p className="text-xs text-zinc-500 mb-2 font-medium">{t('gamification.preview.recent')}</p>
                  <div className="flex flex-wrap gap-2">
                    {previewBadges.map((badge) => (
                      <span key={badge} className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full border border-zinc-700/50">
                        {previewBadgeIcons[badge]} {t(`gamification.preview.badges.${badge}`)}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Leaderboard mini */}
                <div className="border-t border-zinc-800 pt-4">
                  <p className="text-xs text-zinc-500 mb-2 font-medium">{t('gamification.preview.leaders')}</p>
                  {[
                    ...PREVIEW_LEADERS.map((row) => ({ ...row, highlight: false })),
                    { rank: 3, name: t('gamification.preview.you'), xp: PREVIEW_XP.current, highlight: true },
                  ].map((row) => (
                    <div
                      key={row.rank}
                      className={`flex items-center justify-between py-1.5 text-sm ${row.highlight ? "text-amber-400 font-semibold" : "text-zinc-400"}`}
                    >
                      <span className="tabular-nums">#{row.rank} {row.name}</span>
                      <span className="tabular-nums">{t('gamification.preview.xp', { count: row.xp })}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Glow */}
              <div className="absolute -inset-8 bg-amber-600/5 rounded-full blur-[80px] -z-10" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Full Feature Grid ─────────────────────────────────── */}
      <section className="py-28 bg-zinc-900/20 relative" aria-labelledby="home-features-title">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <Badge variant="outline" className="border-zinc-800 text-zinc-400 rounded-full px-4 py-1">
              {t('features.badge')}
            </Badge>
            <h2 id="home-features-title" className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
              {t('features.title')}
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed">{t('features.subtitle')}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {features.map((f) => (
              <article
                key={f.key}
                className="bg-zinc-900/40 border border-zinc-800/50 p-6 rounded-2xl hover:bg-zinc-800/40 hover:border-zinc-700/50 transition-[background-color,border-color] duration-200 group"
              >
                <div className={`w-10 h-10 ${f.wrap} rounded-xl flex items-center justify-center mb-4 border group-hover:scale-110 transition-transform duration-200`}>
                  <f.icon className={`w-5 h-5 ${f.icon_}`} aria-hidden="true" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">{t(`features.items.${f.key}.title`)}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors duration-200">
                  {t(`features.items.${f.key}.description`)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────── */}
      <section className="py-28 relative" aria-labelledby="home-how-title">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <Badge variant="outline" className="border-zinc-800 text-zinc-400 rounded-full px-4 py-1">
              {t('howItWorks.badge')}
            </Badge>
            <h2 id="home-how-title" className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
              {t('howItWorks.title')}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto relative">
            <div className="hidden md:block absolute top-10 left-[33%] right-[33%] h-px bg-gradient-to-r from-blue-500/50 to-blue-500/50 via-blue-500/10" aria-hidden="true" />
            {steps.map((step) => (
              <article key={step.key} className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <div className="w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center ring-1 ring-zinc-700/50">
                    <step.icon className="w-8 h-8 text-blue-400" aria-hidden="true" />
                  </div>
                  <span className="absolute -top-2 -right-2 text-xs font-black text-zinc-600 bg-zinc-900 border border-zinc-800 rounded-full w-6 h-6 flex items-center justify-center" aria-hidden="true">
                    {step.step}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white">{t(`howItWorks.steps.${step.key}.title`)}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{t(`howItWorks.steps.${step.key}.description`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Multi-Tenant Callout ──────────────────────────────── */}
      <section className="py-28 bg-zinc-900/20" aria-labelledby="home-tenant-title">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center max-w-5xl mx-auto">
            <div className="space-y-6">
              <Badge variant="secondary" className="bg-blue-900/20 text-blue-400 border-blue-800/50 rounded-full px-4 py-1">
                <Globe2 className="w-3.5 h-3.5 mr-1.5 inline" aria-hidden="true" />
                {t('multiTenant.badge')}
              </Badge>
              <h2 id="home-tenant-title" className="text-4xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
                {t('multiTenant.title')}
              </h2>
              <p className="text-zinc-400 leading-relaxed">{t('multiTenant.description')}</p>
              <ul className="space-y-3" role="list">
                {tenantItems.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-zinc-300">
                    <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
                    {t(`multiTenant.items.${item}`)}
                  </li>
                ))}
              </ul>
            </div>

            {/* Visual (illustrative mock schools) */}
            <div className="grid grid-cols-2 gap-4" aria-hidden="true">
              {MOCK_SCHOOLS.map((school) => {
                const tone = MOCK_SCHOOL_TONES[school.tone]
                return (
                  <div key={school.key} className={`${tone.wrap} border rounded-2xl p-4 space-y-3`}>
                    <div className="flex items-center justify-between">
                      <div className={`w-8 h-8 ${tone.icon} rounded-lg flex items-center justify-center`}>
                        <GraduationCap className="w-4 h-4" />
                      </div>
                      <Badge variant="outline" className={`${tone.badge} text-xs`}>{t(`multiTenant.cards.${school.key}.plan`)}</Badge>
                    </div>
                    <p className="text-white font-semibold text-sm">{t(`multiTenant.cards.${school.key}.name`)}</p>
                    <div className="flex gap-3 text-xs text-zinc-500">
                      <span className="tabular-nums">{t('multiTenant.cards.students', { count: school.students })}</span>
                      <span>·</span>
                      <span className="tabular-nums">{t('multiTenant.cards.courses', { count: school.courses })}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing Teaser ───────────────────────────────────── */}
      <section className="py-28 relative" aria-labelledby="home-pricing-title">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <h2 id="home-pricing-title" className="text-4xl md:text-5xl font-bold text-white tracking-tight" style={{ textWrap: "balance" }}>
              {t('pricing.title')}
            </h2>
            <p className="text-zinc-400 text-lg">{t('pricing.subtitle')}</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
            {tiers.map((tier) => (
              <article
                key={tier.key}
                className={`rounded-2xl p-6 space-y-4 ${
                  tier.highlight
                    ? "bg-blue-600 border border-blue-500 shadow-[0_0_40px_rgba(37,99,235,0.2)]"
                    : "bg-zinc-900/40 border border-zinc-800"
                }`}
              >
                <div>
                  <p className={`text-sm font-semibold mb-1 ${tier.highlight ? "text-blue-100" : "text-zinc-400"}`}>
                    {t(`pricing.plans.${tier.key}.name`)}
                  </p>
                  <p className="text-3xl font-black tabular-nums text-white">
                    {t(`pricing.plans.${tier.key}.price`)}
                  </p>
                </div>
                <ul className="space-y-2" role="list">
                  {tier.features.map((f) => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${tier.highlight ? "text-blue-100" : "text-zinc-400"}`}>
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${tier.highlight ? "text-white" : "text-zinc-600"}`} aria-hidden="true" />
                      {t(`pricing.plans.${tier.key}.${f}`)}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link href="/platform-pricing">
              <Button variant="ghost" className="text-zinc-400 hover:text-white transition-colors duration-200">
                {t('pricing.seeAll')}
                <ArrowRight className="ml-2 w-4 h-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="py-24 relative overflow-hidden" aria-labelledby="home-cta-title">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 rounded-[2.5rem] p-12 md:p-20 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" aria-hidden="true" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" aria-hidden="true" />

            <div className="max-w-3xl mx-auto space-y-8 relative z-10">
              <h2 id="home-cta-title" className="text-4xl md:text-6xl font-black text-white tracking-tight" style={{ textWrap: "balance" }}>
                {t('cta.title')}
              </h2>
              <p className="text-blue-100 text-xl max-w-2xl mx-auto font-medium">{t('cta.subtitle')}</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Link href="/create-school">
                  <Button
                    size="lg"
                    className="h-14 px-10 bg-white text-blue-600 hover:bg-blue-50 font-bold rounded-xl text-lg transition-colors duration-200 shadow-xl shadow-black/10 active:scale-95"
                  >
                    {t('cta.primary')}
                    <ArrowRight className="ml-2 w-5 h-5" aria-hidden="true" />
                  </Button>
                </Link>
                <Link href="/creators">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 px-10 border-white/20 bg-white/10 text-white hover:bg-white/20 rounded-xl text-lg backdrop-blur-md transition-colors duration-200"
                  >
                    {t('cta.secondary')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="h-20" aria-hidden="true" />
    </div>
  );
}
