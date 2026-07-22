import { c, type PuckTemplate } from './_shared'

// ─── Business / Marketing Coaching ───────────────────────────────────────────
// Multi-page pack for solo creators, consultants, and coaching businesses
// (marketing, entrepreneurship, freelancing). Pages: Home, About, FAQ, Contact.

const LOGO = '🚀 Momentum'
const FOOTER_COLUMNS = [
  { title: 'Programs', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Coaching', href: '#pricing' }, { label: 'Pricing', href: '/pricing' }] },
  { title: 'Company', links: [{ label: 'About', href: '#about' }, { label: 'Results', href: '#results' }, { label: 'Contact', href: '#contact' }] },
  { title: 'Legal', links: [{ label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
]

function header(navLinks: { label: string; href: string }[]) {
  return c('Header', {
    logo: '', logoText: LOGO, navLinks,
    ctaLabel: 'Book a Free Call', ctaHref: '#contact',
    showLogin: true, sticky: true, transparent: false,
  })
}

function footer() {
  return c('Footer', {
    description: 'Practical coaching and courses to grow your business, land clients, and build a brand that sells.',
    columns: FOOTER_COLUMNS,
    socialLinks: [{ platform: 'LinkedIn', url: '#' }, { platform: 'YouTube', url: '#' }, { platform: 'Twitter', url: '#' }],
    copyright: '© 2026 Momentum. All rights reserved.',
  })
}

const homeTemplate: PuckTemplate = {
  name: 'Business Coaching — Home',
  description: 'High-conversion landing page for business, marketing, and entrepreneurship coaches.',
  category: 'business',
  sort_order: 50,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      header([
        { label: 'Courses', href: '/courses' },
        { label: 'Results', href: '#results' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'About', href: '#about' },
        { label: 'FAQ', href: '#faq' },
      ]),
      c('HeroBlock', {
        title: 'Build the Business You Actually Want',
        subtitle: 'Proven frameworks for getting clients, growing revenue, and reclaiming your time. Courses and 1-on-1 coaching for founders, freelancers, and creators.',
        primaryCtaLabel: 'Book a Free Strategy Call',
        primaryCtaHref: '#contact',
        secondaryCtaLabel: 'See Programs',
        secondaryCtaHref: '/courses',
        backgroundImage: '', alignment: 'center', overlayOpacity: 60, minHeight: '520px',
      }),
      c('SocialProof', {
        text: 'Trusted by 3,500+ founders and creators worldwide',
        rating: 5,
        reviewCount: 'Based on 900+ reviews',
        avatarCount: 5,
      }),
      c('StatsCounter', {
        useLiveStats: true,
        items: [
          { value: '3,500', label: 'Clients Coached', prefix: '', suffix: '+' },
          { value: '40', label: 'Avg. Revenue Growth', prefix: '', suffix: '%' },
          { value: '12', label: 'Years Experience', prefix: '', suffix: '+' },
          { value: '4.9', label: 'Client Rating', prefix: '', suffix: '/5' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'What You Will Master',
        subtitle: 'The exact systems behind sustainable, profitable growth.',
        items: [
          { icon: '🎯', title: 'Find Your Niche', description: 'Position yourself so the right clients find you — and happily pay premium rates.' },
          { icon: '🧲', title: 'Attract Clients', description: 'Build a marketing engine that brings in leads consistently, without burnout.' },
          { icon: '💰', title: 'Sell With Confidence', description: 'Close deals without feeling pushy using a clear, repeatable sales process.' },
          { icon: '⚙️', title: 'Systemize & Scale', description: 'Turn chaos into systems so your business runs without you in every detail.' },
          { icon: '📈', title: 'Grow Revenue', description: 'Pricing, offers, and upsells that increase income without more hours.' },
          { icon: '⏳', title: 'Reclaim Your Time', description: 'Delegate, automate, and focus on the work that actually moves the needle.' },
        ],
        columns: '3',
      }),
      c('CourseGrid', {
        courseIds: [],
        title: 'Programs & Courses',
        subtitle: 'Self-paced programs to build skills on your schedule.',
        maxItems: 6, columns: '3', showPrice: true, showDescription: true,
      }),
      c('PricingTable', {
        title: 'Ways to Work Together',
        subtitle: 'Start with a course or go all-in with private coaching.',
        items: [
          { name: 'Courses', price: '$199', period: 'one-time', description: 'Self-paced programs', features: 'Lifetime course access\nTemplates & frameworks\nWorkbooks & checklists\nCommunity access\nCertificate', highlighted: false, ctaLabel: 'Browse Courses', ctaHref: '/courses' },
          { name: 'Group Coaching', price: '$299', period: '/month', description: 'Learn with a cohort', features: 'All courses included\nWeekly group calls\nHot-seat coaching\nAccountability pods\nPrivate community', highlighted: true, ctaLabel: 'Join the Group', ctaHref: '#contact' },
          { name: 'Private 1-on-1', price: 'Custom', period: '', description: 'Fully tailored coaching', features: 'Everything in Group\nBiweekly 1-on-1 calls\nCustom growth plan\nDirect message access\nDone-with-you strategy', highlighted: false, ctaLabel: 'Apply Now', ctaHref: '#contact' },
        ],
      }),
      c('TestimonialGrid', {
        title: 'Results That Speak',
        subtitle: 'What clients achieved after working together.',
        items: [
          { name: 'Sara D.', role: 'Freelance Designer', quote: 'I doubled my rates and filled my calendar in 90 days. The positioning work alone was worth every penny.', rating: 5 },
          { name: 'Marcus L.', role: 'Agency Founder', quote: 'We went from feast-or-famine to predictable revenue. The client-attraction system completely changed our business.', rating: 5 },
          { name: 'Aisha K.', role: 'Online Coach', quote: 'I finally have systems instead of chaos. I work fewer hours and earn more than ever. Game changer.', rating: 5 },
        ],
      }),
      c('FaqAccordion', {
        title: 'Common Questions',
        subtitle: '',
        items: [
          { question: 'Who is this for?', answer: 'Freelancers, consultants, coaches, and small business owners who want more clients, higher revenue, and better systems — without working themselves into the ground.' },
          { question: 'Do I need an established business?', answer: 'No. We have programs for people just starting out and advanced coaching for those ready to scale. We will help you find the right starting point.' },
          { question: 'How is coaching delivered?', answer: 'Through live group calls, private 1-on-1 sessions, and a community — plus on-demand courses you can work through anytime.' },
          { question: 'What if it does not work for me?', answer: 'Our courses come with a 30-day money-back guarantee, and coaching includes a satisfaction check-in. We only succeed when you do.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Ready to Build Momentum?',
        subtitle: 'Book a free strategy call and leave with a clear next step for your business — no pressure, no pitch.',
        primaryCtaLabel: 'Book Your Free Call',
        primaryCtaHref: '#contact',
        secondaryCtaLabel: 'View Programs',
        secondaryCtaHref: '/courses',
        style: 'gradient',
      }),
      footer(),
    ],
    zones: {},
  },
}

const aboutTemplate: PuckTemplate = {
  name: 'Business Coaching — About',
  description: 'About page for a business coach: story, philosophy, and credentials.',
  category: 'business',
  sort_order: 51,
  pageType: 'about',
  puck_data: {
    root: { props: {} },
    content: [
      header([
        { label: 'Home', href: '/' },
        { label: 'Courses', href: '/courses' },
        { label: 'FAQ', href: '#faq' },
        { label: 'Contact', href: '#contact' },
      ]),
      c('HeroBlock', {
        title: 'Hi, I Help Founders Build Businesses That Last',
        subtitle: 'After 12 years of building, scaling, and occasionally crashing my own companies, I distilled what actually works into frameworks anyone can follow.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '400px',
      }),
      c('TextBlock', {
        content: 'I started my first business at 24 with more ambition than strategy. I made every mistake in the book — undercharging, chasing the wrong clients, drowning in work that did not grow anything. Eventually I figured out the systems that turn hustle into a real, profitable business.\n\nSince then I have coached over 3,500 founders, freelancers, and creators to do the same: find their niche, attract clients consistently, charge what they are worth, and build a company that runs without burning them out. No hype, no get-rich-quick promises — just practical frameworks that work, delivered through courses and coaching that meet you where you are.',
        alignment: 'center', color: '', maxWidth: '768px', fontSize: '1.125rem',
      }),
      c('StatsCounter', {
        useLiveStats: true,
        items: [
          { value: '3,500', label: 'Clients Coached', prefix: '', suffix: '+' },
          { value: '$50M', label: 'Client Revenue Added', prefix: '', suffix: '' },
          { value: '12', label: 'Years Experience', prefix: '', suffix: '+' },
          { value: '30', label: 'Countries', prefix: '', suffix: '+' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'How I Work',
        subtitle: 'The principles behind every program and call.',
        items: [
          { icon: '🧭', title: 'Strategy Over Hacks', description: 'No fleeting tactics. We build durable systems that compound over years, not weeks.' },
          { icon: '🤝', title: 'Honest & Direct', description: 'You get real feedback, even when it is hard to hear. That is how you actually grow.' },
          { icon: '📐', title: 'Frameworks, Not Theory', description: 'Every concept comes with templates and steps you can apply the same day.' },
          { icon: '🌱', title: 'Sustainable Growth', description: 'We build a business that supports your life — not one that consumes it.' },
        ],
        columns: '2',
      }),
      c('TeamGrid', {
        title: 'The Team',
        subtitle: 'Coaches and specialists who support your growth.',
        members: [
          { name: 'Jordan Reyes', role: 'Founder & Lead Coach', bio: 'Built and sold two companies. Coached 3,500+ founders over 12 years.', avatar: '' },
          { name: 'Tara Mbeki', role: 'Marketing Coach', bio: 'Helps clients build lead engines that bring in customers on autopilot.', avatar: '' },
          { name: 'Sam Whitfield', role: 'Sales Coach', bio: 'Former enterprise sales leader. Teaches authentic, high-conversion selling.', avatar: '' },
          { name: 'Lily Chen', role: 'Operations Coach', bio: 'Systems specialist who turns busy founders into calm CEOs.', avatar: '' },
        ],
      }),
      c('CtaBlock', {
        title: 'Let’s Build Something That Lasts',
        subtitle: 'Book a free strategy call and see if we are a fit.',
        primaryCtaLabel: 'Book a Free Call',
        primaryCtaHref: '#contact',
        secondaryCtaLabel: 'See Programs',
        secondaryCtaHref: '/courses',
        style: 'gradient',
      }),
      footer(),
    ],
    zones: {},
  },
}

const faqTemplate: PuckTemplate = {
  name: 'Business Coaching — FAQ',
  description: 'FAQ page for a business coach covering programs, format, results, and pricing.',
  category: 'business',
  sort_order: 52,
  pageType: 'faq',
  puck_data: {
    root: { props: {} },
    content: [
      header([
        { label: 'Home', href: '/' },
        { label: 'Courses', href: '/courses' },
        { label: 'Pricing', href: '/pricing' },
        { label: 'Contact', href: '#contact' },
      ]),
      c('HeroBlock', {
        title: 'Frequently Asked Questions',
        subtitle: 'Everything you need to know about the programs, coaching, and results.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '300px',
      }),
      c('FaqAccordion', {
        title: 'Is This Right for Me?',
        subtitle: '',
        items: [
          { question: 'Who do you work with?', answer: 'Freelancers, consultants, coaches, agency owners, and creators who want more clients, higher revenue, and better systems without burning out.' },
          { question: 'I am just starting out. Is that okay?', answer: 'Yes. We have foundational programs for new businesses and advanced coaching for scaling. We help you start exactly where you are.' },
          { question: 'What industries do you cover?', answer: 'The frameworks are industry-agnostic and proven across services, coaching, creative, and digital businesses. The principles of positioning, marketing, and sales apply everywhere.' },
          { question: 'How much time does it take?', answer: 'Courses are self-paced. Group coaching is about 2–3 hours per week. Private coaching flexes around your schedule.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Format & Delivery',
        subtitle: '',
        items: [
          { question: 'How is the coaching delivered?', answer: 'Through live group calls, private 1-on-1 sessions, a member community, and on-demand courses you can work through anytime.' },
          { question: 'Are the calls recorded?', answer: 'Yes. All group calls are recorded and added to your library so you never miss anything.' },
          { question: 'Do I get templates and resources?', answer: 'Every program includes proven templates, scripts, checklists, and workbooks you can use immediately.' },
          { question: 'Can I upgrade from a course to coaching?', answer: 'Absolutely. Many clients start with a course and upgrade to group or private coaching as they grow. Your course investment can be credited toward coaching.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Results & Guarantee',
        subtitle: '',
        items: [
          { question: 'What kind of results can I expect?', answer: 'Results vary by effort and starting point, but clients commonly raise their rates, build consistent lead flow, and reclaim hours each week. Average revenue growth is around 40%.' },
          { question: 'Do you guarantee results?', answer: 'No ethical coach can guarantee revenue — too much depends on you. But our courses include a 30-day money-back guarantee, and coaching includes satisfaction check-ins.' },
          { question: 'How fast will I see progress?', answer: 'Most clients see early wins — clarity on positioning, a better offer, first new leads — within the first few weeks. Bigger results compound over months.' },
          { question: 'Can I get a refund?', answer: 'Courses come with a 30-day money-back guarantee. Coaching terms are covered in your agreement and discussed openly on your strategy call.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Still Have Questions?',
        subtitle: 'Book a free call and we will answer everything — and map your next step.',
        primaryCtaLabel: 'Book a Free Call',
        primaryCtaHref: '#contact',
        secondaryCtaLabel: 'Browse Courses',
        secondaryCtaHref: '/courses',
        style: 'bordered',
      }),
      footer(),
    ],
    zones: {},
  },
}

const contactTemplate: PuckTemplate = {
  name: 'Business Coaching — Contact',
  description: 'Contact / book-a-call page for a business coach with form and quick answers.',
  category: 'business',
  sort_order: 53,
  pageType: 'contact',
  puck_data: {
    root: { props: {} },
    content: [
      header([
        { label: 'Home', href: '/' },
        { label: 'Courses', href: '/courses' },
        { label: 'FAQ', href: '#faq' },
      ]),
      c('HeroBlock', {
        title: 'Book Your Free Strategy Call',
        subtitle: 'Tell us about your business and goals. We will map a clear next step on a no-pressure call — whether or not we work together.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '320px',
      }),
      c('ContactForm', {
        title: 'Apply for a Call',
        subtitle: 'Share where you are and where you want to go. We will be in touch within one business day.',
        email: 'hello@momentum.coach',
        showPhone: true, showMessage: true,
      }),
      c('FaqAccordion', {
        title: 'Before You Book',
        subtitle: '',
        items: [
          { question: 'Is the call really free?', answer: 'Yes. The strategy call is free and genuinely useful — you will leave with a clear next step even if we never work together.' },
          { question: 'Will this be a sales pitch?', answer: 'No hard pitch. We focus on your goals. If coaching is a fit, we will mention it; if not, we will point you to the right resource.' },
          { question: 'What should I prepare?', answer: 'Just come ready to talk about your business, your biggest challenge right now, and what success would look like for you.' },
        ],
      }),
      footer(),
    ],
    zones: {},
  },
}

export const businessCoachingTemplates: PuckTemplate[] = [
  homeTemplate,
  aboutTemplate,
  faqTemplate,
  contactTemplate,
]
