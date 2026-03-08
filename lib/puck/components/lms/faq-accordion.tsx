import type { ComponentConfig } from '@measured/puck'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'

type FaqItem = {
  question: string
  answer: string
}

export type FaqAccordionProps = {
  title: string
  subtitle: string
  items: FaqItem[]
} & SectionSpacingProps

export const FaqAccordion: ComponentConfig<FaqAccordionProps> = {
  label: 'FAQ',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    items: {
      type: 'array',
      label: 'Questions',
      arrayFields: {
        question: { type: 'text', label: 'Question' },
        answer: { type: 'textarea', label: 'Answer' },
      },
      defaultItemProps: { question: 'Question?', answer: 'Answer here.' },
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    title: 'Frequently Asked Questions',
    subtitle: '',
    items: [
      { question: 'How do I get started?', answer: 'Simply create an account and browse our course catalog. You can start learning immediately with our free courses.' },
      { question: 'Do I get a certificate?', answer: 'Yes! Upon completing a course, you receive a verifiable digital certificate that you can share on your resume or LinkedIn.' },
      { question: 'Can I learn at my own pace?', answer: 'Absolutely. All courses are self-paced, so you can learn whenever and wherever works best for you.' },
    ],
    ...sectionSpacingDefaults,
  },
  render: ({ title, subtitle, items, paddingY, paddingX, maxWidth, marginY }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    if (!items.length) return <></>

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <div className="max-w-3xl mx-auto">
            {title && (
              <h2 className="text-3xl font-bold text-center text-foreground mb-3">{title}</h2>
            )}
            {subtitle && (
              <p className="text-center text-muted-foreground mb-10">{subtitle}</p>
            )}
            <div className="flex flex-col gap-2">
              {items.map((item, i) => (
                <details
                  key={i}
                  className="group border border-border rounded-xl overflow-hidden"
                >
                  <summary className="flex items-center justify-between gap-4 p-4 px-5 font-semibold text-[0.9375rem] text-foreground cursor-pointer list-none hover:bg-muted/50 transition-colors [&::-webkit-details-marker]:hidden">
                    <span className="break-words">{item.question}</span>
                    <svg
                      className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </summary>
                  <div className="px-5 pb-4 text-muted-foreground leading-relaxed text-[0.9375rem]">
                    {item.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  },
}
