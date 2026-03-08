import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import type { PricingSectionData, SectionColors } from '@/lib/landing-pages/types'

interface Props {
  data: PricingSectionData
  accentColor?: string
  colors?: SectionColors
}

export async function PricingSection({ data, accentColor = '#3B82F6', colors }: Props) {
  const tenantId = await getCurrentTenantId()
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('product_id, name, description, price, currency')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('price', { ascending: true })
    .limit(6)

  if (!products || products.length === 0) return null

  const headingColor = colors?.heading ?? 'text-white'
  const bodyColor = colors?.body ?? 'text-zinc-400'
  const cardBg = colors?.cardBg ?? 'bg-zinc-900/40'
  const cardBorder = colors?.cardBorder ?? 'border-zinc-800'

  return (
    <div>
      <div className="container mx-auto px-4 md:px-6">
        {(data.title || data.subtitle) && (
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            {data.title && <h2 className={`text-3xl md:text-4xl font-bold ${headingColor}`}>{data.title}</h2>}
            {data.subtitle && <p className={`${bodyColor} text-lg`}>{data.subtitle}</p>}
          </div>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {products.map((product) => (
            <article key={product.product_id} className={`${cardBg} border ${cardBorder} rounded-2xl p-6 space-y-4`}>
              <div>
                <h3 className={`font-bold ${headingColor} text-lg`}>{product.name}</h3>
                {product.description && (
                  <p className={`${bodyColor} text-sm mt-1 leading-relaxed line-clamp-2`}>{product.description}</p>
                )}
              </div>
              <div className={`text-2xl font-black ${headingColor}`}>
                {product.price === 0 ? 'Free' : `$${(product.price / 100).toFixed(2)}`}
              </div>
              <Link href="/courses">
                <Button className="w-full rounded-xl" style={{ backgroundColor: accentColor }}>
                  Enroll Now
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
