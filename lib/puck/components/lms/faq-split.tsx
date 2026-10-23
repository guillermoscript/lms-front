import type { ComponentConfig } from '@measured/puck'
import { safeHref } from '../../utils/safe-href'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterProps,
  sectionInnerProps,
} from '../../utils/section-spacing'

type FaqItem = {
  question: string
  answer: string
}

export type FaqSplitProps = {
  heading: string
  subtitle: string
  contactLabel: string
  contactHref: string
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
    subtitle: { type: 'textarea', label: 'Subtitle' },
    contactLabel: { type: 'text', label: 'Contact Link Label' },
    contactHref: { type: 'text', label: 'Contact Link URL' },
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
    subtitle: '',
    contactLabel: '',
    contactHref: '/p/contact',
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
  render: ({ paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn, heading, subtitle, contactLabel, contactHref, items }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }
    const list = items ?? []
    return (
      <div {...sectionOuterProps(spacing)}>
        <div {...sectionInnerProps(spacing)}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              {heading && (
                <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{heading}</h2>
              )}
              {subtitle && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{subtitle}</p>}
              {contactLabel && (
                <a
                  href={safeHref(contactHref)}
                  className="mt-6 inline-block font-medium underline underline-offset-4 hover:text-muted-foreground"
                >
                  {contactLabel}
                </a>
              )}
            </div>
            <div className="divide-y divide-border border-y border-border">
              {list.map((faq, i) => (
                <details key={i} className="group" open={i === 0}>
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-lg font-medium [&::-webkit-details-marker]:hidden">
                    <span className="break-words">{faq.question}</span>
                    <span
                      aria-hidden="true"
                      className="mt-1 text-muted-foreground transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                    >
                      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </summary>
                  <p className="pb-6 pr-10 leading-relaxed text-muted-foreground whitespace-pre-line text-pretty">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  },
}
