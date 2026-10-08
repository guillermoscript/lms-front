import { c, type PuckTemplate } from './_shared'
import { courseFooter, courseHeader } from './course-landing'

/**
 * Product templates (Page Architect WP5, design §5). Bound to ONE product through
 * `{{productId}}`; the bundle's courses come in through the `{{courseIds}}` list binding
 * (the picker / `apply_template` pass the product's linked course ids). Price, currency and
 * the included-course list are read from the product at render time; a multi-course product
 * checks out at `/products/{id}`.
 */

const bundleFaq = [
  {
    question: 'What is included in the bundle?',
    answer: 'Replace with a short summary. The full course list is shown above, straight from your catalog.',
  },
  {
    question: 'How long do I have access?',
    answer: 'Replace with your access policy for the courses in this bundle.',
  },
  {
    question: 'In what order should I take the courses?',
    answer: 'Replace with the path you recommend, or say they can be taken in any order.',
  },
]

const productBundleTemplate: PuckTemplate = {
  id: 'product-bundle',
  name: 'Course Bundle',
  description: 'Sell a product that bundles several courses: hero, price card, included courses, reviews and FAQ.',
  category: 'product',
  sort_order: 73,
  pageType: 'product',
  puck_data: {
    root: { props: {} },
    content: [
      courseHeader(
        [
          { label: 'Courses', href: '#courses' },
          { label: 'Pricing', href: '#pricing' },
          { label: 'FAQ', href: '#faq' },
        ],
        'Get the bundle',
        '#pricing'
      ),
      c('HeroBlock', {
        title: 'Everything you need, in one bundle',
        subtitle: 'Replace with who this bundle is for and what they will be able to do after finishing it.',
        primaryCtaLabel: 'See the price',
        primaryCtaHref: '#pricing',
        secondaryCtaLabel: 'What’s included',
        secondaryCtaHref: '#courses',
        backgroundImage: '',
        backgroundColor: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: '500px',
      }),
      c('CoursePricingCard', {
        courseId: '',
        productId: '{{productId}}',
        title: 'One price, every course',
        subtitle: '',
        features: [
          { text: 'Every course in the bundle' },
          { text: 'Learn at your own pace' },
          { text: 'Replace with anything else the price includes' },
        ],
        guarantee: '',
        ctaLabel: '',
        tone: 'brand-tint',
        anchorId: 'pricing',
      }),
      c('CourseGrid', {
        title: 'Courses in this bundle',
        subtitle: '',
        courseIds: [{ id: '{{courseIds}}' }],
        // Only the bundle's own courses: unbound (or all drafts) hides it, never the catalog.
        curatedOnly: true,
        maxItems: 12,
        columns: '3',
        showPrice: false,
        showDescription: true,
        anchorId: 'courses',
      }),
      c('TestimonialGrid', {
        title: 'What students say',
        subtitle: '',
        source: 'live',
        courseId: '',
        minRating: 4,
        limit: 6,
        items: [],
        tone: 'muted',
        anchorId: 'reviews',
      }),
      c('FaqAccordion', {
        title: 'Frequently asked questions',
        subtitle: '',
        items: bundleFaq,
        accentColor: '',
        maxWidth: 'md',
        anchorId: 'faq',
      }),
      c('CtaBanner', {
        heading: 'Ready to start?',
        subtitle: 'Get every course in the bundle with one purchase.',
        primaryLabel: 'Get the bundle',
        primaryHref: '#pricing',
        secondaryLabel: '',
        secondaryHref: '',
        tone: 'brand',
      }),
      courseFooter(),
    ],
    zones: {},
  },
}

export const productTemplates: PuckTemplate[] = [productBundleTemplate]
