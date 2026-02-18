import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen, GraduationCap } from "lucide-react"
import { type Tenant } from "@/lib/supabase/tenant"

interface Product {
  product_id: string
  name: string
  description: string | null
  price: number | null
  currency: string | null
  thumbnail_url: string | null
}

interface Props {
  tenant: Tenant
  products: Product[]
}

export function SchoolLandingPage({ tenant, products }: Props) {
  const accentColor = tenant.primary_color || '#3B82F6'

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0A] overflow-hidden">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden="true">
        <div
          className="absolute top-[-10%] right-[-10%] w-[700px] h-[700px] rounded-full blur-[140px]"
          style={{ backgroundColor: `${accentColor}14` }}
        />
        <div className="absolute bottom-[30%] left-[-10%] w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px]" />
      </div>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-36" aria-label="School hero">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-8">

            {/* School Logo */}
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-lg overflow-hidden"
              style={{ backgroundColor: accentColor }}
            >
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.name} className="w-full h-full object-cover" />
              ) : (
                tenant.name[0]?.toUpperCase()
              )}
            </div>

            <h1
              className="text-5xl lg:text-7xl font-black tracking-tight text-white leading-[1.05]"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              {tenant.name}
            </h1>

            <p className="text-xl text-zinc-400 max-w-xl leading-relaxed font-medium">
              Learn with us. Enroll in courses and grow your skills.
            </p>

            <div className="flex flex-wrap gap-4 justify-center pt-2">
              <Link href="/auth/sign-up?next=/join-school">
                <Button
                  size="lg"
                  className="h-14 px-10 text-white font-bold rounded-xl text-lg transition-all duration-200 active:scale-95 border-0"
                  style={{ backgroundColor: accentColor }}
                >
                  Join {tenant.name}
                  <ArrowRight className="ml-2 w-5 h-5" aria-hidden="true" />
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 px-10 bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-xl text-lg backdrop-blur-sm transition-all duration-200"
                >
                  Already a member? Log in
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Courses Grid ─────────────────────────────────────── */}
      <section className="py-24 relative" aria-label="Available courses">
        <div className="container mx-auto px-4 md:px-6">
          <h2 className="text-3xl font-bold text-white text-center mb-12">Available Courses</h2>

          {products.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 text-zinc-700 mx-auto mb-4" aria-hidden="true" />
              <p className="text-zinc-500 text-lg">Courses coming soon</p>
              <p className="text-zinc-600 text-sm mt-2">Check back later for new content.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {products.map((product) => (
                <article
                  key={product.product_id}
                  className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl overflow-hidden hover:bg-zinc-800/40 hover:border-zinc-700/50 transition-all duration-200 group flex flex-col"
                >
                  {product.thumbnail_url ? (
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={product.thumbnail_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  ) : (
                    <div
                      className="aspect-video flex items-center justify-center"
                      style={{ backgroundColor: `${accentColor}22` }}
                    >
                      <GraduationCap className="w-12 h-12" style={{ color: accentColor }} aria-hidden="true" />
                    </div>
                  )}

                  <div className="p-6 flex flex-col flex-1">
                    <h3 className="text-white font-bold text-base mb-2 line-clamp-2">{product.name}</h3>
                    {product.description && (
                      <p className="text-zinc-500 text-sm leading-relaxed mb-4 line-clamp-3 flex-1">
                        {product.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-zinc-800">
                      <span className="text-white font-bold">
                        {product.price === 0 || product.price === null
                          ? 'Free'
                          : `${product.currency?.toUpperCase() ?? 'USD'} $${parseFloat(String(product.price)).toFixed(2)}`
                        }
                      </span>
                      <Link
                        href={`/courses/${product.product_id}`}
                        className="text-sm font-semibold flex items-center gap-1 transition-colors duration-200"
                        style={{ color: accentColor }}
                      >
                        View <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
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
          <div
            className="rounded-[2.5rem] p-12 md:p-16 text-center relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${accentColor}dd, ${accentColor}88)` }}
          >
            <div
              className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"
              aria-hidden="true"
            />
            <div className="relative z-10 max-w-2xl mx-auto space-y-6">
              <h2
                className="text-3xl md:text-4xl font-black text-white tracking-tight"
                style={{ textWrap: "balance" } as React.CSSProperties}
              >
                Ready to start learning at {tenant.name}?
              </h2>
              <Link href="/auth/sign-up?next=/join-school">
                <Button
                  size="lg"
                  className="h-14 px-10 bg-white font-bold rounded-xl text-lg shadow-xl shadow-black/20 active:scale-95 transition-all duration-200 border-0"
                  style={{ color: accentColor }}
                >
                  Join {tenant.name} Now
                  <ArrowRight className="ml-2 w-5 h-5" aria-hidden="true" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="h-20" aria-hidden="true" />
    </div>
  )
}
