import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import type { HeroSectionData, SectionColors } from '@/lib/landing-pages/types'

interface Props {
  data: HeroSectionData
  accentColor?: string
  colors?: SectionColors
}

export function HeroSection({ data, accentColor = '#3B82F6', colors }: Props) {
  const alignClass = data.alignment === 'left' ? 'items-start text-left' : data.alignment === 'right' ? 'items-end text-right' : 'items-center text-center'
  const headingColor = colors?.heading ?? 'text-white'
  const bodyColor = colors?.body ?? 'text-white/80'

  return (
    <div
      className="relative bg-cover bg-center overflow-hidden"
      style={data.backgroundImage ? { backgroundImage: `url(${data.backgroundImage})` } : {}}
    >
      {!data.backgroundImage && (
        <div className="absolute inset-0 pointer-events-none -z-10">
          <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full blur-[130px]"
            style={{ backgroundColor: `${accentColor}18` }} />
        </div>
      )}
      {data.backgroundImage && <div className="absolute inset-0 bg-black/50" />}
      <div className="container relative z-10 mx-auto px-4 md:px-6 py-24 md:py-36">
        <div className={`flex flex-col max-w-3xl gap-6 ${alignClass} ${data.alignment === 'center' ? 'mx-auto' : ''}`}>
          <h1 className={`text-5xl md:text-7xl font-black tracking-tight ${headingColor}`} style={{ textWrap: 'balance' } as React.CSSProperties}>
            {data.title}
          </h1>
          {data.subtitle && (
            <p className={`text-xl ${bodyColor} max-w-2xl leading-relaxed`}>{data.subtitle}</p>
          )}
          <div className="flex flex-wrap gap-4">
            {data.ctaText && data.ctaLink && (
              <Link href={data.ctaLink}>
                <Button size="lg" className="h-12 px-8 font-bold rounded-xl" style={{ backgroundColor: accentColor }}>
                  {data.ctaText}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            )}
            {data.secondaryCtaText && data.secondaryCtaLink && (
              <Link href={data.secondaryCtaLink}>
                <Button size="lg" variant="outline" className={`h-12 px-8 rounded-xl ${colors?.cardBorder ?? 'border-white/20'} ${colors?.cardBg ?? 'bg-white/10'} ${headingColor} hover:bg-white/20`}>
                  {data.secondaryCtaText}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
