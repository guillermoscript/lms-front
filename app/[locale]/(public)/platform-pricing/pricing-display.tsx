'use client'

import { useState } from 'react'
import { IconCheck, IconX, IconArrowRight, IconSchool, IconSparkles } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface PlanData {
  plan_id: string
  slug: string
  name: string
  description: string
  price_monthly: number
  price_yearly: number
  transaction_fee_percent: number
  features: Record<string, boolean | string>
  limits: { max_courses: number; max_students: number }
}

const FEATURE_CONFIG: { key: string; label: string; icon?: string }[] = [
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'achievements', label: 'Achievements' },
  { key: 'store', label: 'Point Store' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'ai_grading', label: 'AI Auto-Grading' },
  { key: 'custom_branding', label: 'Custom Branding' },
  { key: 'custom_domain', label: 'Custom Domain' },
  { key: 'api_access', label: 'API Access' },
  { key: 'white_label', label: 'White-Label' },
  { key: 'priority_support', label: 'Priority Support' },
]

const PLAN_ACCENTS: Record<string, { gradient: string; glow: string; badge: string; ring: string }> = {
  free: {
    gradient: 'from-zinc-400 to-zinc-600',
    glow: 'bg-zinc-500/5',
    badge: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    ring: 'ring-zinc-700/50',
  },
  starter: {
    gradient: 'from-emerald-400 to-teal-500',
    glow: 'bg-emerald-500/5',
    badge: 'bg-emerald-950 text-emerald-400 border-emerald-800',
    ring: 'ring-emerald-500/30',
  },
  pro: {
    gradient: 'from-blue-400 via-indigo-400 to-violet-500',
    glow: 'bg-blue-500/8',
    badge: 'bg-blue-950 text-blue-400 border-blue-800',
    ring: 'ring-blue-500/40',
  },
  business: {
    gradient: 'from-amber-400 to-orange-500',
    glow: 'bg-amber-500/5',
    badge: 'bg-amber-950 text-amber-400 border-amber-800',
    ring: 'ring-amber-500/30',
  },
  enterprise: {
    gradient: 'from-rose-400 via-pink-400 to-fuchsia-500',
    glow: 'bg-rose-500/5',
    badge: 'bg-rose-950 text-rose-400 border-rose-800',
    ring: 'ring-rose-500/30',
  },
}

function formatLimit(value: number) {
  if (value === -1) return 'Unlimited'
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`
  return value.toString()
}

export function PlatformPricingDisplay({ plans }: { plans: PlanData[] }) {
  const [yearly, setYearly] = useState(false)
  const proIndex = plans.findIndex((p) => p.slug === 'pro')

  return (
    <div className="relative">
      {/* === HERO === */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Atmospheric grid */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }} />
        {/* Hero glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/8 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 left-1/3 -translate-x-1/2 w-[300px] h-[300px] bg-violet-600/6 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-zinc-400 mb-8 backdrop-blur-sm">
            <IconSparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Transparent pricing for every stage</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[0.95] mb-6">
            Launch your school.
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              Scale without limits.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed mb-12">
            Start free, upgrade when you're ready. No hidden fees, no surprises.
            Every plan includes the core LMS &mdash; just unlock more as you grow.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center rounded-2xl bg-zinc-900/80 border border-zinc-800 p-1 backdrop-blur-sm">
            <button
              onClick={() => setYearly(false)}
              className={cn(
                'px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300',
                !yearly
                  ? 'bg-white text-black shadow-lg'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              className={cn(
                'px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2',
                yearly
                  ? 'bg-white text-black shadow-lg'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              Yearly
              <span className={cn(
                'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full transition-colors',
                yearly
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
              )}>
                Save 17%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* === PLAN CARDS === */}
      <section className="relative px-4 sm:px-6 pb-32 max-w-[1400px] mx-auto">
        {/* Plans grid — 3 featured in first row, 2 below */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {plans.map((plan, index) => {
            const accent = PLAN_ACCENTS[plan.slug] || PLAN_ACCENTS.free
            const isPopular = index === proIndex
            const price = yearly ? plan.price_yearly : plan.price_monthly
            const monthlyEquiv = yearly ? Math.round(plan.price_yearly / 12) : plan.price_monthly

            return (
              <div
                key={plan.plan_id}
                className={cn(
                  'group relative',
                  // Make enterprise span full width on 3-col layout when it's the 5th item
                  index === 3 && plans.length === 5 && 'lg:col-start-1',
                  index === 4 && plans.length === 5 && 'lg:col-start-2',
                  isPopular && 'lg:scale-[1.03] z-10',
                )}
              >
                {/* Popular glow */}
                {isPopular && (
                  <div className="absolute -inset-[1px] rounded-[2rem] bg-gradient-to-b from-blue-500/30 via-violet-500/20 to-transparent blur-sm" />
                )}

                <div
                  className={cn(
                    'relative h-full flex flex-col rounded-[2rem] border transition-all duration-500',
                    'bg-zinc-950/60 backdrop-blur-xl',
                    isPopular
                      ? 'border-blue-500/30 shadow-2xl shadow-blue-500/5'
                      : 'border-zinc-800/80 hover:border-zinc-700/80',
                  )}
                >
                  {/* Popular badge */}
                  {isPopular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20">
                      <div className="bg-gradient-to-r from-blue-600 to-violet-600 text-white text-[10px] font-black px-5 py-1.5 rounded-full uppercase tracking-[0.15em] shadow-xl shadow-blue-600/25">
                        Most Popular
                      </div>
                    </div>
                  )}

                  {/* Card body */}
                  <div className="p-7 pt-8 flex-1 flex flex-col">
                    {/* Header */}
                    <div className="mb-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={cn(
                          'w-2.5 h-2.5 rounded-full bg-gradient-to-br',
                          accent.gradient
                        )} />
                        <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                      </div>
                      <p className="text-sm text-zinc-500 leading-relaxed pl-[22px]">
                        {plan.description}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="mb-7">
                      <div className="flex items-baseline gap-1">
                        <span className="text-5xl font-black text-white tracking-tighter">
                          ${monthlyEquiv}
                        </span>
                        {plan.slug !== 'free' && (
                          <span className="text-zinc-500 font-medium">/mo</span>
                        )}
                      </div>
                      {yearly && plan.slug !== 'free' && (
                        <p className="text-xs text-zinc-600 mt-1.5 font-medium">
                          ${price} billed annually
                        </p>
                      )}
                      {plan.slug === 'free' && (
                        <p className="text-xs text-zinc-600 mt-1.5 font-medium">
                          Free forever
                        </p>
                      )}
                    </div>

                    {/* CTA */}
                    <Link href="/create-school" className="block mb-7">
                      <Button
                        className={cn(
                          'w-full h-12 rounded-xl font-bold text-sm transition-all duration-300',
                          isPopular
                            ? 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-lg shadow-blue-600/20 border-0'
                            : plan.slug === 'enterprise'
                              ? 'bg-white hover:bg-zinc-100 text-black'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700/50'
                        )}
                      >
                        {plan.slug === 'free' ? 'Start Free' : plan.slug === 'enterprise' ? 'Contact Sales' : 'Get Started'}
                        <IconArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>

                    {/* Divider */}
                    <div className="h-px bg-zinc-800/80 mb-6" />

                    {/* Limits */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <div className="text-center p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/50">
                        <div className="text-base font-black text-white">{formatLimit(plan.limits.max_courses)}</div>
                        <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mt-0.5">Courses</div>
                      </div>
                      <div className="text-center p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/50">
                        <div className="text-base font-black text-white">{formatLimit(plan.limits.max_students)}</div>
                        <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mt-0.5">Students</div>
                      </div>
                      <div className="text-center p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/50">
                        <div className="text-base font-black text-white">{plan.transaction_fee_percent}%</div>
                        <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mt-0.5">Tx Fee</div>
                      </div>
                    </div>

                    {/* Features */}
                    <div className="space-y-2.5 flex-1">
                      {FEATURE_CONFIG.map(({ key, label }) => {
                        const value = plan.features[key]
                        const has = value === true || (typeof value === 'string' && value !== 'false')
                        return (
                          <div key={key} className="flex items-center gap-2.5">
                            {has ? (
                              <div className={cn(
                                'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                                'bg-emerald-500/10 border border-emerald-500/20',
                              )}>
                                <IconCheck className="w-3 h-3 text-emerald-400" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-zinc-900 border border-zinc-800/50">
                                <IconX className="w-2.5 h-2.5 text-zinc-700" />
                              </div>
                            )}
                            <span className={cn(
                              'text-sm',
                              has ? 'text-zinc-300' : 'text-zinc-600',
                            )}>
                              {label}
                              {typeof value === 'string' && value !== 'true' && value !== 'false' && (
                                <span className="ml-1 text-xs text-zinc-500">({value})</span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* === COMPARISON TABLE (desktop) === */}
      <section className="relative px-6 pb-32 max-w-6xl mx-auto hidden lg:block">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-black text-white mb-3">Compare all features</h2>
          <p className="text-zinc-500">See exactly what you get with each plan.</p>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 overflow-hidden bg-zinc-950/40 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80">
                <th className="text-left py-4 px-6 text-zinc-500 font-medium w-[200px]">Feature</th>
                {plans.map((plan) => {
                  const accent = PLAN_ACCENTS[plan.slug] || PLAN_ACCENTS.free
                  return (
                    <th key={plan.plan_id} className="py-4 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className={cn('w-2 h-2 rounded-full bg-gradient-to-br', accent.gradient)} />
                        <span className="font-bold text-white">{plan.name}</span>
                      </div>
                      <div className="text-zinc-500 font-normal mt-0.5">
                        ${yearly ? Math.round(plan.price_yearly / 12) : plan.price_monthly}/mo
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {/* Limits rows */}
              {[
                { label: 'Courses', key: 'max_courses' as const },
                { label: 'Students', key: 'max_students' as const },
                { label: 'Transaction fee', key: 'fee' as const },
              ].map((row) => (
                <tr key={row.key} className="border-b border-zinc-800/40 hover:bg-zinc-900/30 transition-colors">
                  <td className="py-3 px-6 text-zinc-400">{row.label}</td>
                  {plans.map((plan) => (
                    <td key={plan.plan_id} className="py-3 px-4 text-center text-zinc-300 font-medium">
                      {row.key === 'fee'
                        ? `${plan.transaction_fee_percent}%`
                        : formatLimit(plan.limits[row.key as 'max_courses' | 'max_students'])
                      }
                    </td>
                  ))}
                </tr>
              ))}
              {/* Feature rows */}
              {FEATURE_CONFIG.map(({ key, label }) => (
                <tr key={key} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-900/30 transition-colors">
                  <td className="py-3 px-6 text-zinc-400">{label}</td>
                  {plans.map((plan) => {
                    const value = plan.features[key]
                    const has = value === true || (typeof value === 'string' && value !== 'false')
                    return (
                      <td key={plan.plan_id} className="py-3 px-4 text-center">
                        {has ? (
                          typeof value === 'string' && value !== 'true' ? (
                            <span className="text-zinc-300 text-xs font-medium bg-zinc-800 px-2 py-0.5 rounded-full">{value}</span>
                          ) : (
                            <IconCheck className="w-4 h-4 text-emerald-400 mx-auto" />
                          )
                        ) : (
                          <span className="text-zinc-700">&mdash;</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* === BOTTOM CTA === */}
      <section className="relative border-t border-zinc-800/60">
        {/* Subtle glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-violet-600/5 blur-[150px] rounded-full pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <IconSchool className="w-5 h-5 text-zinc-600" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
            Ready to build your school?
          </h2>
          <p className="text-zinc-500 text-lg mb-8 max-w-xl mx-auto">
            Join thousands of educators who trust our platform. Create your school in minutes and start teaching today.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/create-school">
              <Button className="h-13 px-8 rounded-xl font-bold bg-white text-black hover:bg-zinc-100 transition-all duration-300 text-base">
                Create Your School
                <IconArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/auth/login">
              <Button
                variant="outline"
                className="h-13 px-8 rounded-xl font-bold border-zinc-700 text-zinc-300 hover:bg-zinc-900 hover:text-white transition-all duration-300 text-base"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
