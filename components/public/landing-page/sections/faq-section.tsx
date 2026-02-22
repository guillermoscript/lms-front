import type { FaqSectionData } from '@/lib/landing-pages/types'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

interface Props {
  data: FaqSectionData
}

export function FaqSection({ data }: Props) {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4 md:px-6">
        {(data.title || data.subtitle) && (
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            {data.title && <h2 className="text-3xl md:text-4xl font-bold text-white">{data.title}</h2>}
            {data.subtitle && <p className="text-zinc-400 text-lg">{data.subtitle}</p>}
          </div>
        )}
        <div className="max-w-2xl mx-auto">
          <Accordion className="space-y-2 border-0 rounded-none">
            {(data.items ?? []).map((item, idx) => (
              <AccordionItem key={idx} value={String(idx)} className="border border-zinc-800 rounded-xl px-4 bg-zinc-900/30">
                <AccordionTrigger className="text-white font-medium text-left py-4">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-zinc-400 leading-relaxed">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
