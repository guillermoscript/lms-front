import { c, type PuckTemplate } from './_shared'

/**
 * Course templates (Page Architect WP5, design §5). Each one sells ONE course and is bound to
 * it through `{{courseId}}`: the picker asks for the course, the AI's `apply_template` passes
 * it, and every fact on the page (title, description, image, price, lessons, author, rating,
 * reviews) comes from that course at render time — never from the template.
 *
 * Copy rules:
 * - Fact-bearing text is left EMPTY so the block reads it from the course (hero title and
 *   subtitle overrides, CTA labels that the blocks derive as "Enroll for $49" / "Enroll for
 *   free" in the visitor's locale).
 * - What remains is short section headings and editor prompts ("Replace with…"), never an
 *   invented guarantee, figure or person. The AI rewrites them into the page locale after
 *   `apply_template` (critique D4).
 * - Header nav links point at the `anchorId`s set below, so they scroll on any locale.
 * - Tones alternate (default / muted / brand-tint / brand) for rhythm; colours still come from
 *   the school's theme.
 * - No school-wide blocks under the course hero (SocialProof reads every review in the
 *   school): the hero already shows THIS course's rating and review count.
 */

const COURSE = '{{courseId}}'

function header(navLinks: { label: string; href: string }[], ctaLabel: string, ctaHref: string) {
  return c('Header', {
    logo: '{{logoUrl}}',
    logoText: '{{schoolName}}',
    navLinks,
    ctaLabel,
    ctaHref,
    showLogin: true,
    showLanguageSwitcher: true,
    sticky: true,
    transparent: false,
  })
}

function footer() {
  return c('Footer', {
    description: '',
    columns: [
      {
        title: '{{schoolName}}',
        // No legal links: /terms and /privacy are not routes, and a school's own legal pages
        // live at /p/<slug> only once it creates them.
        links: [{ label: 'All courses', href: '/courses' }],
      },
    ],
    socialLinks: [],
    copyright: '© {{year}} {{schoolName}}',
  })
}

/** Placeholder FAQ for a single course: questions every buyer asks, answers the school fills. */
const COURSE_FAQ = [
  {
    question: 'How long do I have access?',
    answer: 'Replace with your access policy, for example how long the lessons stay available after you enroll.',
  },
  {
    question: 'Do I need any prior experience?',
    answer: 'Replace with who the course is for and what a student should know before starting.',
  },
  {
    question: 'How is the course delivered?',
    answer: 'Replace with the format: video lessons, exercises, live sessions, at your own pace or on a schedule.',
  },
  {
    question: 'What if I have questions while learning?',
    answer: 'Replace with how students get help: comments on each lesson, a community, or email.',
  },
]

const PRICE_FEATURES = [
  { text: 'Every lesson in the course' },
  { text: 'Learn at your own pace' },
  { text: 'Replace with anything else the price includes' },
]

// ─── Course landing (flagship) ───────────────────────────────────────────────

const courseLandingTemplate: PuckTemplate = {
  id: 'course-landing',
  name: 'Course Landing',
  description: 'A full sales page for one course: hero, outcomes, curriculum, instructor, reviews, price and FAQ.',
  category: 'course',
  sort_order: 70,
  pageType: 'course',
  puck_data: {
    root: { props: {} },
    content: [
      header(
        [
          { label: 'Curriculum', href: '#curriculum' },
          { label: 'Instructor', href: '#instructor' },
          { label: 'Pricing', href: '#pricing' },
          { label: 'FAQ', href: '#faq' },
        ],
        'Enroll',
        '#pricing'
      ),
      c('CourseHero', {
        courseId: COURSE,
        variant: 'split',
        eyebrow: '',
        titleOverride: '',
        subtitleOverride: '',
        showPrice: true,
        showStats: true,
        ctaLabel: '',
        paddingY: 'xl',
        anchorId: 'top',
      }),
      c('CourseOutcomes', {
        courseId: COURSE,
        title: 'What you’ll learn',
        subtitle: '',
        items: [
          { text: 'Replace with the first thing a student will be able to do' },
          { text: 'A second concrete skill, in plain words' },
          { text: 'A third outcome: the result, not the topic' },
        ],
        tone: 'muted',
        anchorId: 'outcomes',
      }),
      c('CourseCurriculum', {
        courseId: COURSE,
        title: 'Curriculum',
        subtitle: '',
        maxLessons: 12,
        showPreviewBadges: true,
        maxWidth: 'md',
        anchorId: 'curriculum',
      }),
      c('InstructorCard', {
        source: 'course',
        courseId: COURSE,
        teacherUserId: '',
        title: 'Your instructor',
        tone: 'muted',
        maxWidth: 'md',
        anchorId: 'instructor',
      }),
      c('TestimonialGrid', {
        title: 'What students say',
        subtitle: '',
        source: 'live',
        courseId: COURSE,
        minRating: 4,
        limit: 6,
        items: [],
        anchorId: 'reviews',
      }),
      c('CoursePricingCard', {
        courseId: COURSE,
        productId: '',
        title: 'Start today',
        subtitle: '',
        features: PRICE_FEATURES,
        guarantee: '',
        ctaLabel: '',
        tone: 'brand-tint',
        anchorId: 'pricing',
      }),
      c('FaqAccordion', {
        title: 'Frequently asked questions',
        subtitle: '',
        items: COURSE_FAQ,
        accentColor: '',
        maxWidth: 'md',
        anchorId: 'faq',
      }),
      c('EnrollCta', {
        courseId: COURSE,
        headline: 'Ready to start?',
        subtext: 'Enroll now and open the first lesson today.',
        buttonLabel: '',
        accentColor: '',
        tone: 'brand',
        anchorId: 'enroll',
      }),
      footer(),
    ],
    zones: {},
  },
}

// ─── Course launch (short) ───────────────────────────────────────────────────

const courseLaunchShortTemplate: PuckTemplate = {
  id: 'course-launch-short',
  name: 'Course Launch',
  description: 'A short launch page for one course: centered hero, outcomes, price and FAQ.',
  category: 'course',
  sort_order: 71,
  pageType: 'course',
  puck_data: {
    root: { props: {} },
    content: [
      header(
        [
          { label: 'What you’ll learn', href: '#outcomes' },
          { label: 'Pricing', href: '#pricing' },
          { label: 'FAQ', href: '#faq' },
        ],
        'Enroll',
        '#pricing'
      ),
      c('CourseHero', {
        courseId: COURSE,
        variant: 'centered',
        eyebrow: '',
        titleOverride: '',
        subtitleOverride: '',
        showPrice: true,
        showStats: true,
        ctaLabel: '',
        paddingY: 'xl',
        anchorId: 'top',
      }),
      c('CourseOutcomes', {
        courseId: COURSE,
        title: 'What you’ll learn',
        subtitle: '',
        items: [
          { text: 'Replace with the first thing a student will be able to do' },
          { text: 'A second concrete skill, in plain words' },
          { text: 'A third outcome: the result, not the topic' },
        ],
        tone: 'muted',
        anchorId: 'outcomes',
      }),
      c('CoursePricingCard', {
        courseId: COURSE,
        productId: '',
        title: 'Join the launch',
        subtitle: '',
        features: PRICE_FEATURES,
        guarantee: '',
        ctaLabel: '',
        tone: 'default',
        anchorId: 'pricing',
      }),
      c('FaqSplit', {
        heading: 'Questions',
        items: COURSE_FAQ.slice(0, 3),
        tone: 'muted',
        anchorId: 'faq',
      }),
      footer(),
    ],
    zones: {},
  },
}

// ─── Free course lead magnet ─────────────────────────────────────────────────

const freeCourseLeadTemplate: PuckTemplate = {
  id: 'free-course-lead',
  name: 'Free Course',
  description: 'A lead page for a free course: hero, the lesson list and an enroll band.',
  category: 'course',
  sort_order: 72,
  pageType: 'course',
  puck_data: {
    root: { props: {} },
    content: [
      header([{ label: 'Lessons', href: '#curriculum' }], 'Start free', '#enroll'),
      c('CourseHero', {
        courseId: COURSE,
        variant: 'split',
        eyebrow: '',
        titleOverride: '',
        subtitleOverride: '',
        showPrice: true,
        showStats: true,
        ctaLabel: '',
        paddingY: 'xl',
        anchorId: 'top',
      }),
      c('CourseCurriculum', {
        courseId: COURSE,
        title: 'Lessons',
        subtitle: '',
        maxLessons: 20,
        showPreviewBadges: true,
        tone: 'muted',
        maxWidth: 'md',
        anchorId: 'curriculum',
      }),
      c('EnrollCta', {
        courseId: COURSE,
        headline: 'Start learning today',
        subtext: 'Create your account and open the first lesson.',
        buttonLabel: '',
        accentColor: '',
        tone: 'brand',
        anchorId: 'enroll',
      }),
      footer(),
    ],
    zones: {},
  },
}

export const courseTemplates: PuckTemplate[] = [
  courseLandingTemplate,
  courseLaunchShortTemplate,
  freeCourseLeadTemplate,
]

export { header as courseHeader, footer as courseFooter }
