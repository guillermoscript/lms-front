import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import type { CtaSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: CtaSectionData
  accentColor?: string
}

export function CtaSection({ data, accentColor = '#3B82F6' }: Props) {
  const wrapperClass =
    data.style === 'gradient'
      ? 'bg-gradient-to-br rounded-[2rem] p-12 md:p-20 text-center text-white'
      : data.style === 'outline'
        ? 'border-2 rounded-[2rem] p-12 md:p-20 text-center'
        : 'rounded-[2rem] p-12 md:p-20 text-center text-white'

  return (
    <section className="py-20">
      <div className="container mx-auto px-4 md:px-6">
        <div
          className={wrapperClass}
          style={
            data.style === 'gradient'
              ? { background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` }
              : data.style === 'solid'
                ? { backgroundColor: accentColor }
                : { borderColor: accentColor, color: accentColor }
          }
        >
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight" style={{ textWrap: 'balance' } as React.CSSProperties}>
              {data.title}
            </h2>
            {data.subtitle && (
              <p className="text-lg opacity-90 max-w-xl mx-auto">{data.subtitle}</p>
            )}
            {data.ctaText && data.ctaLink && (
              <Link href={data.ctaLink}>
                <Button size="lg" className="h-12 px-8 font-bold rounded-xl bg-white text-zinc-900 hover:bg-zinc-100 mt-4">
                  {data.ctaText}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
