import type React from "react"
import Link from "next/link"
import { Bricolage_Grotesque } from "next/font/google"
import { getTranslations } from "next-intl/server"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  display: "swap",
})

// Fixed "sun" accent, always paired with dark ink text (content colour, not a theme colour).
const SUN_VARS = { "--sun": "#FFC247", "--sun-ink": "#11142B" } as React.CSSProperties
const H2 = cn(display.className, "text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl")
const H3 = cn(display.className, "text-2xl font-bold leading-tight tracking-tight sm:text-3xl")

const PAY_METHODS = ["cards", "paypal", "binance", "solana", "transfer"] as const
const STEPS = ["create", "build", "share"] as const
const PLANS = [
  { key: "free", lines: ["f1", "f2", "f3"], featured: false },
  { key: "starter", lines: ["f1", "f2", "f3"], featured: false },
  { key: "pro", lines: ["f1", "f2", "f3", "f4"], featured: true },
  { key: "business", lines: ["f1", "f2", "f3", "f4"], featured: false },
] as const

/** Platform (root domain) home. Schools on subdomains render their own page instead. */
export async function PlatformLanding() {
  const t = await getTranslations("home")
  const pill = "inline-flex min-h-14 items-center gap-2.5 rounded-full px-7 text-base font-semibold transition-colors"

  return (
    <div className="overflow-x-clip" style={SUN_VARS}>
      {/* Hero */}
      <section className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-14 px-6 pb-24 pt-32 lg:pt-36" aria-labelledby="home-hero-title">
        <div className="min-w-0 flex-[1_1_480px]">
          <p className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-border bg-card py-2 pl-2.5 pr-4 text-sm font-medium text-muted-foreground">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{t("hero.tag")}</span>
            {t("hero.tagText")}
          </p>
          <h1
            id="home-hero-title"
            className={cn(display.className, "text-[clamp(2.9rem,7vw,5.4rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-foreground")}
          >
            {t("hero.titleLead")}
            <br />
            <span
              style={{ background: "linear-gradient(transparent 64%, color-mix(in oklch, var(--sun) 45%, transparent) 64%, color-mix(in oklch, var(--sun) 45%, transparent) 90%, transparent 90%)" }}
            >
              {t("hero.titleHighlight")}
            </span>
          </h1>
          <p className="mt-7 max-w-[520px] text-xl leading-relaxed text-muted-foreground">{t("hero.subtitle")}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/create-school" className={cn(pill, "bg-primary text-primary-foreground hover:bg-primary/90")}>
              {t("hero.cta")}
              <ArrowRight className="size-[18px]" aria-hidden="true" />
            </Link>
            <Link href="#how" className={cn(pill, "border-[1.5px] border-foreground text-foreground hover:bg-foreground hover:text-background")}>
              {t("hero.secondary")}
            </Link>
          </div>
        </div>

        {/* Illustrative mock, not real data */}
        <div aria-hidden="true" className="mx-auto flex min-w-0 max-w-[560px] flex-[1_1_420px] flex-col">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_30px_60px_-30px_rgba(17,20,43,0.25)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className={cn(display.className, "text-lg font-bold")}>{t("mock.course")}</span>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-[13px] font-semibold text-primary">{t("mock.published")}</span>
            </div>
            <div className="flex flex-col gap-2">
              {(["lesson1", "lesson2"] as const).map((k, i) => (
                <div key={k} className="flex items-center gap-3 rounded-2xl bg-muted px-3.5 py-3">
                  <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground">{i + 1}</span>
                  <span className="font-medium">{t(`mock.${k}`)}</span>
                  {i === 1 && <span className="ml-auto text-[13px] text-muted-foreground">{t("mock.exercise")}</span>}
                </div>
              ))}
              <div className="flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-border px-3.5 py-3 text-muted-foreground">
                <span className="inline-flex size-7 items-center justify-center rounded-lg border-[1.5px] border-dashed border-border">+</span>
                {t("mock.add")}
              </div>
            </div>
          </div>
          <div className="relative -mt-7 ml-9 flex flex-wrap gap-4">
            <div className="min-w-[180px] flex-1 rounded-[20px] bg-foreground px-5 py-[18px] text-background">
              <div className="text-[13px] opacity-70">{t("mock.paid")}</div>
              <div className={cn(display.className, "mt-0.5 text-3xl font-bold")}>$29.00</div>
              <div className="mt-0.5 text-[13px] opacity-70">{t("mock.paidVia")}</div>
            </div>
            <div className="min-w-[180px] flex-1 rounded-[20px] px-5 py-[18px] bg-[var(--sun)] text-[var(--sun-ink)]">
              <div className="text-[13px] font-semibold">{t("mock.graded")}</div>
              <div className={cn(display.className, "mt-0.5 text-3xl font-extrabold")}>9 / 10</div>
              <div className="mt-0.5 text-[13px]">{t("mock.gradedNote")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-[1200px] px-6 pb-24 pt-10" aria-labelledby="home-features-title">
        <h2 id="home-features-title" className={cn(H2, "mb-10 max-w-2xl")}>
          {t("features.title")}
        </h2>
        <div className="flex flex-wrap gap-4">
          <article className="flex min-w-0 flex-[2_1_540px] flex-wrap items-center gap-7 rounded-[28px] bg-foreground p-9 text-background">
            <div className="flex-[1_1_240px]">
              <h3 className={H3}>{t("features.ai.title")}</h3>
              <p className="mt-3.5 opacity-75">{t("features.ai.body")}</p>
            </div>
            <div aria-hidden="true" className="flex flex-[1_1_260px] flex-col gap-3 rounded-[18px] bg-background/10 p-[18px]">
              <div className="text-sm opacity-70">{t("features.ai.answerLabel")}</div>
              <div className="text-[15px] leading-snug">{t("features.ai.answer")}</div>
              <div className="h-px bg-background/20" />
              <div className="flex items-center gap-2.5">
                <span className="rounded-full px-2.5 py-1 text-[13px] font-bold bg-[var(--sun)] text-[var(--sun-ink)]">9 / 10</span>
                <span className="text-sm opacity-80">{t("features.ai.feedback")}</span>
              </div>
            </div>
          </article>

          <article className="min-w-0 flex-[1_1_320px] rounded-[28px] p-9 bg-[var(--sun)] text-[var(--sun-ink)]">
            <h3 className={H3}>{t("features.pay.title")}</h3>
            <div aria-hidden="true" className="mt-5 flex flex-wrap gap-2">
              {PAY_METHODS.map((m, i) => (
                <span key={m} className={cn("rounded-full px-3.5 py-2 text-sm font-semibold", i === 0 ? "bg-[var(--sun-ink)] text-background dark:text-foreground" : "bg-card text-card-foreground")}>
                  {t(`features.pay.${m}`)}
                </span>
              ))}
            </div>
          </article>

          <article className="min-w-0 flex-[1_1_320px] rounded-[28px] border border-border bg-card p-9">
            <h3 className={H3}>{t("features.brand.title")}</h3>
            <p className="mt-3.5 text-muted-foreground">{t("features.brand.body")}</p>
            <div aria-hidden="true" className="mt-5 rounded-xl border border-border bg-muted px-4 py-3 text-[15px] font-medium text-primary">
              {t("features.brand.url")}
            </div>
          </article>

          <article className="min-w-0 flex-[1_1_320px] rounded-[28px] bg-primary/10 p-9">
            <h3 className={H3}>{t("features.certs.title")}</h3>
            <p className="mt-3.5 text-muted-foreground">{t("features.certs.body")}</p>
          </article>

          <article className="min-w-0 flex-[1_1_320px] rounded-[28px] border border-border bg-card p-9">
            <h3 className={H3}>{t("features.oss.title")}</h3>
            <p className="mt-3.5 text-muted-foreground">{t("features.oss.body")}</p>
          </article>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1200px] scroll-mt-20 px-6 pb-24 pt-10" aria-labelledby="home-how-title">
        <h2 id="home-how-title" className={cn(H2, "mb-12")}>
          {t("how.title")}
        </h2>
        <ol className="flex flex-wrap gap-8">
          {STEPS.map((key, i) => (
            <li key={key} className="min-w-0 flex-[1_1_260px] border-t-2 border-foreground pt-5">
              <div className={cn(display.className, "text-6xl font-extrabold leading-none text-primary")}>{i + 1}</div>
              <h3 className={cn(display.className, "mb-2 mt-4 text-2xl font-bold")}>{t(`how.${key}.title`)}</h3>
              <p className="text-muted-foreground">{t(`how.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-[1200px] scroll-mt-20 px-6 pb-24 pt-10" aria-labelledby="home-pricing-title">
        <h2 id="home-pricing-title" className={H2}>
          {t("pricing.title")}
        </h2>
        <p className="mb-10 mt-4 text-muted-foreground">{t("pricing.subtitle")}</p>
        <div className="flex flex-wrap items-stretch gap-4">
          {PLANS.map((plan) => (
            <article
              key={plan.key}
              className={cn(
                "min-w-0 flex-[1_1_240px] rounded-3xl p-7",
                plan.featured ? "bg-foreground text-background" : "border border-border bg-card",
              )}
            >
              <div className={cn("font-semibold", plan.featured ? "text-[var(--sun)]" : "text-muted-foreground")}>
                {t(`pricing.plans.${plan.key}.name`)}
              </div>
              <div className={cn(display.className, "mb-5 mt-1.5 text-[44px] font-extrabold tracking-tight")}>
                {t(`pricing.plans.${plan.key}.price`)}
                {plan.key !== "free" && (
                  <span className="text-base font-medium opacity-70">{t("pricing.perMonth")}</span>
                )}
              </div>
              <ul className="flex flex-col gap-2.5" role="list">
                {plan.lines.map((l) => (
                  <li key={l}>{t(`pricing.plans.${plan.key}.${l}`)}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <Link href="/platform-pricing" className="mt-8 inline-flex items-center gap-2 font-semibold text-primary hover:underline">
          {t("pricing.seeAll")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-[1200px] px-6 pb-24" aria-labelledby="home-cta-title">
        <div className="rounded-[36px] bg-primary px-8 py-[72px] text-center text-primary-foreground">
          <h2
            id="home-cta-title"
            className={cn(display.className, "mx-auto max-w-3xl text-4xl font-extrabold leading-none tracking-[-0.035em] sm:text-6xl")}
          >
            {t("cta.title")}
          </h2>
          <p className="mt-5 text-lg opacity-85">{t("cta.subtitle")}</p>
          <Link href="/create-school" className={cn(pill, "mt-9 bg-[var(--sun)] text-[var(--sun-ink)] hover:brightness-95")}>
            {t("cta.primary")}
            <ArrowRight className="size-[18px]" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  )
}
