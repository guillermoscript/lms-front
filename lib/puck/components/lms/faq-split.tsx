import type { ComponentConfig } from '@measured/puck'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterClass,
  sectionInnerClass,
} from '../../utils/section-spacing'

type FaqItem = {
  question: string
  answer: string
}

export type FaqSplitProps = {
  heading: string
  items: FaqItem[]
} & SectionSpacingProps

/**
 * Puck wrapper for the Tailark `faqs-1` block (installed to components/faqs.tsx via
 * `npx shadcn add @tailark/faqs-1`). Pattern B — the Tailark block ships hardcoded Q&A
 * with no props, so the two-column split layout is ported here and the questions become
 * an editable array. components/faqs.tsx is kept as the design reference.
 */
export const FaqSplit: ComponentConfig<FaqSplitProps> = {
  label: 'FAQ Split',
  fields: {
    heading: { type: 'text', label: 'Heading' },
    items: {
      type: 'array',
      label: 'Questions',
      arrayFields: {
        question: { type: 'text', label: 'Question' },
        answer: { type: 'textarea', label: 'Answer' },
      },
      defaultItemProps: { question: 'New question?', answer: 'Answer goes here.' },
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    heading: 'Frequently Asked Questions',
    items: [
      {
        question: 'What is the refund policy?',
        answer:
          'We offer a 30-day money back guarantee. If you are not satisfied, request a refund within 30 days of purchase.',
      },
      {
        question: 'How do I cancel my subscription?',
        answer:
          'You can cancel at any time from your account settings — your access continues until the end of the current billing period.',
      },
      {
        question: 'Can I upgrade my plan?',
        answer:
          'Yes. Upgrade any time from your account; the price difference is prorated and the new plan takes effect immediately.',
      },
    ],
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, heading, items }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <div className="grid gap-y-12 lg:[grid-template-columns:1fr_auto] lg:gap-x-16">
            {heading && (
              <div className="text-center lg:text-left">
                <h2 className="mb-4 text-3xl font-semibold md:text-4xl">{heading}</h2>
              </div>
            )}
            <div className="divide-y divide-dashed sm:mx-auto sm:max-w-lg lg:mx-0">
              {items.map((faq, i) => (
                <div key={i} className={i === 0 ? 'pb-6' : 'py-6'}>
                  <h3 className="font-medium">{faq.question}</h3>
                  <p className="text-muted-foreground mt-4 whitespace-pre-line">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  },
}
