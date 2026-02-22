import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import type { CoursesSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: CoursesSectionData
  accentColor?: string
}

export async function CoursesSection({ data, accentColor = '#3B82F6' }: Props) {
  const tenantId = await getCurrentTenantId()
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('product_id, name, description, price, currency, image')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(data.maxItems ?? 6)

  if (!products || products.length === 0) return null

  return (
    <section className="py-20">
      <div className="container mx-auto px-4 md:px-6">
        {(data.title || data.subtitle) && (
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            {data.title && <h2 className="text-3xl md:text-4xl font-bold text-white">{data.title}</h2>}
            {data.subtitle && <p className="text-zinc-400 text-lg">{data.subtitle}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {products.map((product) => (
            <article key={product.product_id} className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors">
              {product.image && (
                <div className="aspect-video bg-zinc-800 overflow-hidden">
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-5 space-y-3">
                <h3 className="font-bold text-white">{product.name}</h3>
                {product.description && (
                  <p className="text-zinc-400 text-sm leading-relaxed line-clamp-2">{product.description}</p>
                )}
                <div className="flex items-center justify-between">
                  {data.showPrice && product.price != null && (
                    <span className="font-bold text-white">
                      {product.price === 0 ? 'Free' : `${(product.price / 100).toFixed(2)} ${(product.currency ?? 'USD').toUpperCase()}`}
                    </span>
                  )}
                  <Link href={`/courses`}>
                    <Button size="sm" variant="outline" className="rounded-lg">
                      View
                      <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
