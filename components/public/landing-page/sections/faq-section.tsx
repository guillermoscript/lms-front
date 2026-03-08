import type { FaqSectionData, SectionColors } from '@/lib/landing-pages/types'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

interface Props {
  data: FaqSectionData
  colors?: SectionColors
}

export function FaqSection({ data, colors }: Props) {
  const headingColor = colors?.heading ?? 'text-white'
  const bodyColor = colors?.body ?? 'text-zinc-400'
  const cardBg = colors?.cardBg ?? 'bg-zinc-900/30'
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
        <div className="max-w-2xl mx-auto">
          <Accordion className="space-y-2 border-0 rounded-none">
            {(data.items ?? []).map((item, idx) => (
              <AccordionItem key={idx} value={String(idx)} className={`border ${cardBorder} rounded-xl px-4 ${cardBg}`}>
                <AccordionTrigger className={`${headingColor} font-medium text-left py-4`}>
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className={`${bodyColor} leading-relaxed`}>
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  )
}
