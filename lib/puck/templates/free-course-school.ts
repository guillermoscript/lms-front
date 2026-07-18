import { c, type PuckTemplate } from './_shared'

/**
 * "Free Course School" — a conversion-focused landing for a school that leads
 * with a free course. Every data section is a LIVE widget: StatsBand, CourseGrid,
 * EnrollCta, CatalogBrowser, TestimonialGrid, TeamGrid and PricingTable all fill
 * from the tenant's real courses / reviews / instructors / plans at render time.
 *
 * Kept GENERIC so any tenant can apply it: no hard-coded course ids. CourseGrid
 * shows the latest courses (curate specific ones in the editor), and EnrollCta
 * has no course set so it degrades to a "Browse courses" CTA until the admin
 * picks the free course to feature. Extracted from the Free Academy demo page.
 */
const freeCourseSchool: PuckTemplate = {
  name: 'Free Course School',
  description: 'Lead with a free course. Live stats, courses, reviews, instructors and pricing — all auto-filled from your data.',
  category: 'education',
  sort_order: 5,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logoText: 'Academy',
        navLinks: [
          { label: 'Free course', href: '/courses' },
          { label: 'Catalog', href: '#catalog' },
          { label: 'Pricing', href: '#pricing' },
        ],
        ctaLabel: 'Start free',
        ctaHref: '/courses',
        showLogin: true,
        showLanguageSwitcher: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Learn something new — completely free',
        subtitle: 'Start with our free, beginner-friendly course. No credit card, no catch — just enroll and start today.',
        primaryCtaLabel: 'Start the free course',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'Browse catalog',
        secondaryCtaHref: '#catalog',
        backgroundImage: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1600&q=80',
        backgroundColor: '',
        alignment: 'center',
        overlayOpacity: 60,
        minHeight: '560px',
      }),
      c('StatsBand', {
        heading: 'Our school in numbers',
        subtitle: 'Real learners, real progress — updated live from our catalog.',
        useLiveStats: true,
        items: [
          { value: '+1200', label: 'Lessons completed' },
          { value: '22,000', label: 'Active students' },
          { value: '+50', label: 'Courses published' },
        ],
      }),
      c('CourseGrid', {
        title: 'Start with a free course',
        subtitle: 'Hand-picked to get you from zero to your first win.',
        courseIds: [],
        maxItems: 3,
        columns: '3',
        showPrice: true,
        showDescription: true,
      }),
      c('EnrollCta', {
        courseId: '',
        headline: 'Ready to start learning?',
        subtext: 'Enroll in our free course right now — no cost, no credit card required.',
        buttonLabel: '',
        accentColor: '',
      }),
      c('CatalogBrowser', {
        title: 'Explore the full catalog',
        subtitle: 'Free and premium courses, all in one place.',
        columns: '3',
        pageSize: 9,
        showSearch: true,
        showPriceFilter: true,
      }),
      c('TestimonialGrid', {
        title: 'What our learners say',
        subtitle: 'Straight from students who took our courses.',
        items: [],
      }),
      c('TeamGrid', {
        title: 'Meet your instructors',
        subtitle: 'Learn from people who have done the work.',
        accentColor: '',
        members: [],
      }),
      c('PricingTable', {
        title: 'Simple, honest pricing',
        subtitle: 'Start free. Upgrade only when you are ready.',
        items: [],
      }),
      c('CtaBanner', {
        heading: 'Your next skill is one course away',
        subtitle: 'Join today — the first course is on us.',
        primaryLabel: 'Start the free course',
        primaryHref: '/courses',
        secondaryLabel: 'See all courses',
        secondaryHref: '#catalog',
      }),
      c('Footer', {
        description: 'Practical skills for the independent professional. Start free, learn for life.',
        columns: [
          { title: 'Courses', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Pricing', href: '#pricing' }] },
          { title: 'Company', links: [{ label: 'About', href: '#team' }, { label: 'Contact', href: '#contact' }] },
          { title: 'Legal', links: [{ label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
        ],
        socialLinks: [],
        copyright: '© 2026 Academy. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

export const freeCourseSchoolTemplates: PuckTemplate[] = [freeCourseSchool]
