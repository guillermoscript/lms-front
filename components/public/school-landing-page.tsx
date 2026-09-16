import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen, GraduationCap } from "lucide-react"
import { type Tenant } from "@/lib/supabase/tenant"
import { getTranslations } from "next-intl/server"

interface Product {
  product_id: string
  name: string
  description: string | null
  price: number | null
  currency: string | null
  image: string | null
}

interface Props {
  tenant: Tenant
  products: Product[]
}

export async function SchoolLandingPage({ tenant, products }: Props) {
  const t = await getTranslations('schoolLanding')
  // The school's theme reaches this page as `--primary`: the root layout has
  // already resolved the stored kit theme against the plan (#763), so there is
  // no colour to look up here — and never a hardcoded hue (#730). `color-mix()`
  // below derives the tints from the var.
  const accentColor = 'var(--primary)'

  return (
    <div className="flex flex-col min-h-screen bg-background overflow-hidden">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden="true">
        <div
          className="absolute top-[-10%] right-[-10%] w-[700px] h-[700px] rounded-full blur-[140px]"
          style={{ backgroundColor: `color-mix(in oklch, ${accentColor} 8%, transparent)` }}
        />
        <div className="absolute bottom-[30%] left-[-10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
      </div>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-36" aria-label="School hero">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-8">

            {/* School Logo */}
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-primary-foreground text-3xl font-black shadow-lg overflow-hidden"
              style={{ backgroundColor: accentColor }}
            >
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.name} className="w-full h-full object-cover" />
              ) : (
                tenant.name[0]?.toUpperCase()
              )}
            </div>

            <h1
              className="text-5xl lg:text-7xl font-black tracking-tight text-foreground leading-[1.05]"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              {tenant.name}
            </h1>

            <p className="text-xl text-muted-foreground max-w-xl leading-relaxed font-medium">
              {t('tagline')}
            </p>

            <div className="flex flex-wrap gap-4 justify-center pt-2">
              <Button
                size="lg"
                className="h-14 px-10 text-primary-foreground font-bold text-lg transition-all duration-200 active:scale-95 border-0"
                style={{ backgroundColor: accentColor }}
                render={<Link href="/auth/sign-up?next=/join-school" />}
              >
                {t('join', { name: tenant.name })}
                <ArrowRight className="ml-2 w-5 h-5" aria-hidden="true" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 px-10 text-lg backdrop-blur-sm transition-all duration-200"
                render={<Link href="/auth/login" />}
              >
                {t('alreadyMember')}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Courses Grid ─────────────────────────────────────── */}
      <section className="py-24 relative" aria-label="Available courses">
        <div className="container mx-auto px-4 md:px-6">
          <h2 className="text-3xl font-bold text-foreground text-center mb-12">{t('availableCourses')}</h2>

          {products.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
              <p className="text-muted-foreground text-lg">{t('coursesComingSoon')}</p>
              <p className="text-muted-foreground/70 text-sm mt-2">{t('checkBackLater')}</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {products.map((product) => (
                <article
                  key={product.product_id}
                  className="bg-card border border-border rounded-2xl overflow-hidden hover:bg-muted/50 hover:border-primary/25 transition-all duration-200 group flex flex-col"
                >
                  {product.image ? (
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  ) : (
                    <div
                      className="aspect-video flex items-center justify-center"
                      style={{ backgroundColor: `color-mix(in oklch, ${accentColor} 13%, transparent)` }}
                    >
                      <GraduationCap className="w-12 h-12" style={{ color: accentColor }} aria-hidden="true" />
                    </div>
                  )}

                  <div className="p-6 flex flex-col flex-1">
                    <h3 className="text-card-foreground font-bold text-base mb-2 line-clamp-2">{product.name}</h3>
                    {product.description && (
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-3 flex-1">
                        {product.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                      <span className="text-card-foreground font-bold">
                        {product.price === 0 || product.price === null
                          ? t('free')
                          : `${product.currency?.toUpperCase() ?? 'USD'} $${parseFloat(String(product.price)).toFixed(2)}`
                        }
                      </span>
                      <Link
                        href={`/courses/${product.product_id}`}
                        className="text-sm font-semibold flex items-center gap-1 text-brand-text transition-colors duration-200"
                      >
                        {t('view')} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Join CTA Strip ───────────────────────────────────── */}
      <section className="py-20 relative overflow-hidden" aria-label="Join call to action">
        <div className="container mx-auto px-4 md:px-6">
          {/* A solid brand fill with its own ink: every theme swatch picks
              --primary-foreground for AA on --primary, which a translucent
              gradient over the page behind it would not keep for light brands. */}
          <div
            className="rounded-[2.5rem] p-12 md:p-16 text-center relative overflow-hidden bg-primary"
          >
            <div
              className="absolute top-0 right-0 w-80 h-80 bg-primary-foreground/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"
              aria-hidden="true"
            />
            <div className="relative z-10 max-w-2xl mx-auto space-y-6">
              <h2
                className="text-3xl md:text-4xl font-black text-primary-foreground tracking-tight"
                style={{ textWrap: "balance" } as React.CSSProperties}
              >
                {t('ctaTitle', { name: tenant.name })}
              </h2>
              {/* The drop shadow below stays a black tint: a shadow is neither a
                  surface nor a foreground, and 20% black reads correctly under
                  any brand fill, so it must not follow the theme. */}
              <Button
                size="lg"
                className="h-14 px-10 bg-primary-foreground hover:bg-primary-foreground/90 font-bold text-lg shadow-xl shadow-black/20 active:scale-95 transition-all duration-200 border-0"
                style={{ color: accentColor }}
                render={<Link href="/auth/sign-up?next=/join-school" />}
              >
                {t('ctaButton', { name: tenant.name })}
                <ArrowRight className="ml-2 w-5 h-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="h-20" aria-hidden="true" />
    </div>
  )
}
