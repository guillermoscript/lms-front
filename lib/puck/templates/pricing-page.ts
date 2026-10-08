import { c, type PuckTemplate } from './_shared'
import { courseFooter, courseHeader } from './course-landing'

/**
 * Pricing page (Page Architect WP5, design §5). Unbound: PricingTable shows every live plan
 * (`planIds: []`) and ProductGrid the newest active products, both from the school's own
 * data. The manual `items` are empty on purpose — a template must never publish invented
 * prices — so each section hides itself publicly until there is something real to show.
 */

const pricingFaq = [
  {
    question: 'What is the difference between a plan and a single course?',
    answer: 'Replace with how your school sells: a plan opens the courses it covers while it is active; a single course or bundle is bought once.',
  },
  {
    question: 'Can I cancel a plan?',
    answer: 'Replace with your cancellation policy.',
  },
  {
    question: 'Which payment methods do you accept?',
    answer: 'Replace with the payment methods your school accepts.',
  },
]

const pricingPageTemplate: PuckTemplate = {
  id: 'pricing-page',
  name: 'Pricing',
  description: 'All your plans and products on one page, with an FAQ and a closing call to action.',
  category: 'pricing',
  sort_order: 74,
  pageType: 'pricing',
  puck_data: {
    root: { props: {} },
    content: [
      courseHeader(
        [
          { label: 'Courses', href: '/courses' },
          { label: 'Plans', href: '#pricing' },
          { label: 'FAQ', href: '#faq' },
        ],
        'Browse courses',
        '/courses'
      ),
      c('HeroBlock', {
        title: 'Pricing',
        subtitle: 'Pick a plan for full access, or buy a single program.',
        primaryCtaLabel: 'See plans',
        primaryCtaHref: '#pricing',
        secondaryCtaLabel: 'See programs',
        secondaryCtaHref: '#programs',
        backgroundImage: '',
        backgroundColor: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: 'auto',
      }),
      c('PricingTable', {
        title: 'Plans',
        subtitle: '',
        planIds: [],
        showDescription: true,
        items: [],
        anchorId: 'pricing',
      }),
      c('ProductGrid', {
        title: 'Programs',
        subtitle: '',
        productIds: [],
        maxItems: 6,
        columns: '3',
        showDescription: true,
        tone: 'muted',
        anchorId: 'programs',
      }),
      c('FaqAccordion', {
        title: 'Frequently asked questions',
        subtitle: '',
        items: pricingFaq,
        accentColor: '',
        maxWidth: 'md',
        anchorId: 'faq',
      }),
      c('CtaBlock', {
        title: 'Not sure where to start?',
        subtitle: 'Browse the catalog and open a course to see what it covers.',
        primaryCtaLabel: 'Browse courses',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        style: 'default',
        accentColor: '',
        tone: 'brand-tint',
      }),
      courseFooter(),
    ],
    zones: {},
  },
}

export const pricingTemplates: PuckTemplate[] = [pricingPageTemplate]
