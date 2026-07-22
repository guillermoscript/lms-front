import { c, type PuckTemplate } from './_shared'

// ─── Design / Creative School ────────────────────────────────────────────────
// Multi-page pack for design schools and creative course creators (UX/UI,
// graphic design, illustration, motion). Pages: Home, About, FAQ, Contact.

const LOGO = '🎨 Canvas'
const FOOTER_COLUMNS = [
  { title: 'Learn', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Learning Paths', href: '#paths' }, { label: 'Pricing', href: '/pricing' }] },
  { title: 'Studio', links: [{ label: 'About', href: '#about' }, { label: 'Student Work', href: '#work' }, { label: 'Contact', href: '#contact' }] },
  { title: 'Legal', links: [{ label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
]

function header(navLinks: { label: string; href: string }[]) {
  return c('Header', {
    logo: '', logoText: LOGO, navLinks,
    ctaLabel: 'Start Creating', ctaHref: '/courses',
    showLogin: true, sticky: true, transparent: false,
  })
}

function footer() {
  return c('Footer', {
    description: 'Learn design by making real work. Project-based courses in UX/UI, graphic design, illustration, and motion.',
    columns: FOOTER_COLUMNS,
    socialLinks: [{ platform: 'Instagram', url: '#' }, { platform: 'Dribbble', url: '#' }, { platform: 'Behance', url: '#' }],
    copyright: '© 2026 Canvas Design School. All rights reserved.',
  })
}

const homeTemplate: PuckTemplate = {
  name: 'Design School — Home',
  description: 'Landing page for design schools and creative course creators (UX/UI, graphic, illustration).',
  category: 'design',
  sort_order: 60,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      header([
        { label: 'Courses', href: '/courses' },
        { label: 'Paths', href: '#paths' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'About', href: '#about' },
        { label: 'FAQ', href: '#faq' },
      ]),
      c('HeroBlock', {
        title: 'Design Work You’ll Be Proud to Show',
        subtitle: 'Project-based courses in UX/UI, graphic design, illustration, and motion. Build a real portfolio while you learn the craft.',
        primaryCtaLabel: 'Start Creating',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'Explore Paths',
        secondaryCtaHref: '#paths',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '520px',
      }),
      c('StatsCounter', {
        useLiveStats: true,
        items: [
          { value: '14,000', label: 'Designers Trained', prefix: '', suffix: '+' },
          { value: '120', label: 'Hands-On Projects', prefix: '', suffix: '+' },
          { value: '40', label: 'Industry Mentors', prefix: '', suffix: '+' },
          { value: '4.9', label: 'Student Rating', prefix: '', suffix: '/5' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'Why Design With Us',
        subtitle: 'Everything you need to build skills and a standout portfolio.',
        items: [
          { icon: '🖌️', title: 'Learn by Making', description: 'Every course is built around real projects. You finish with portfolio pieces, not just notes.' },
          { icon: '🔍', title: 'Mentor Critiques', description: 'Submit your work and get detailed feedback from practicing designers.' },
          { icon: '🧰', title: 'Industry Tools', description: 'Master Figma, the Adobe suite, and the workflows real studios use every day.' },
          { icon: '🗺️', title: 'Clear Learning Paths', description: 'Follow guided paths from fundamentals to job-ready specialization.' },
          { icon: '💼', title: 'Portfolio & Career', description: 'Build a portfolio that gets noticed, with guidance on landing your first design role.' },
          { icon: '👥', title: 'Creative Community', description: 'Share work, get inspired, and grow alongside thousands of fellow designers.' },
        ],
        columns: '3',
      }),
      c('FeaturesGrid', {
        title: 'Choose Your Path',
        subtitle: 'Specialize in the craft that excites you most.',
        items: [
          { icon: '📱', title: 'UX/UI Design', description: 'Research, wireframes, prototypes, and polished interfaces in Figma.' },
          { icon: '🎨', title: 'Graphic Design', description: 'Branding, layout, typography, and visual systems that communicate.' },
          { icon: '✏️', title: 'Illustration', description: 'Digital drawing, character design, and a signature visual style.' },
          { icon: '🎬', title: 'Motion Design', description: 'Animation, transitions, and motion graphics that bring work to life.' },
        ],
        columns: '4',
      }),
      c('CourseGrid', {
        courseIds: [],
        title: 'Popular Courses',
        subtitle: 'Start with our most popular courses, chosen by thousands of designers.',
        maxItems: 6, columns: '3', showPrice: true, showDescription: true,
      }),
      c('PricingTable', {
        title: 'Simple Pricing',
        subtitle: 'Buy a course or unlock everything. Cancel anytime.',
        items: [
          { name: 'Single Course', price: '$59', period: 'one-time', description: 'Buy any course', features: 'Lifetime access to one course\nProject files & assets\nMentor critique\nCertificate\nCommunity access', highlighted: false, ctaLabel: 'Browse Courses', ctaHref: '/courses' },
          { name: 'All-Access', price: '$29', period: '/month', description: 'Unlock the full library', features: 'All courses included\nNew courses monthly\nMonthly portfolio reviews\nAll learning paths\nPriority support', highlighted: true, ctaLabel: 'Get All-Access', ctaHref: '#' },
          { name: 'Mentorship', price: '$129', period: '/month', description: 'Guided 1-on-1 support', features: 'Everything in All-Access\nBiweekly 1-on-1 mentor calls\nPersonal portfolio plan\nCareer & interview prep\nDirect messaging', highlighted: false, ctaLabel: 'Apply Now', ctaHref: '#contact' },
        ],
      }),
      c('TestimonialGrid', {
        title: 'From Our Students',
        subtitle: 'Designers who built portfolios and careers here.',
        items: [
          { name: 'Elena V.', role: 'UX Designer at a startup', quote: 'I came in with zero design background. The project-based courses gave me a portfolio that landed my first UX role in five months.', rating: 5 },
          { name: 'Kwame A.', role: 'Freelance Illustrator', quote: 'The mentor critiques pushed my work to a level I did not think I could reach. I am now taking paid client commissions.', rating: 5 },
          { name: 'Yuki T.', role: 'Brand Designer', quote: 'Clear paths, real projects, honest feedback. I finally have a portfolio I am genuinely proud to show.', rating: 5 },
        ],
      }),
      c('FaqAccordion', {
        title: 'Common Questions',
        subtitle: '',
        items: [
          { question: 'Do I need design experience?', answer: 'No. Our beginner courses start with the fundamentals — no prior experience or art degree required.' },
          { question: 'What software do I need?', answer: 'Mostly Figma (free) and the Adobe Creative Suite for some courses. Each course lists exactly what you need, with free alternatives where possible.' },
          { question: 'Will I build a portfolio?', answer: 'Yes. Every course is project-based, so you finish with real, portfolio-ready work you can show to clients or employers.' },
          { question: 'Do I get feedback on my work?', answer: 'Yes. You can submit projects for mentor critiques, and All-Access and Mentorship members get regular portfolio reviews.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Start Building Your Portfolio Today',
        subtitle: 'Join 14,000+ designers learning the craft by making real work.',
        primaryCtaLabel: 'Start Creating',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'View Pricing',
        secondaryCtaHref: '#pricing',
        style: 'gradient',
      }),
      footer(),
    ],
    zones: {},
  },
}

const aboutTemplate: PuckTemplate = {
  name: 'Design School — About',
  description: 'About page for a design school: mission, teaching approach, and mentors.',
  category: 'design',
  sort_order: 61,
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
        title: 'We Teach Design the Way It’s Actually Practiced',
        subtitle: 'Not theory dumps and isolated exercises — real briefs, real critiques, and a real portfolio. The way you learn to design is by designing.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '400px',
      }),
      c('TextBlock', {
        content: 'Canvas was founded by designers who were tired of seeing talented people stall out in tutorials that never added up to anything. You can watch a hundred videos and still freeze when faced with a blank artboard.\n\nSo we built a school around doing. Every course is a real project with a real brief. You design, you get critiqued by working professionals, and you walk away with portfolio pieces — not just a completion badge. Since 2019 we have helped 14,000+ designers across 40 countries build the skills and the portfolios that launch creative careers.',
        alignment: 'center', color: '', maxWidth: '768px', fontSize: '1.125rem',
      }),
      c('StatsCounter', {
        useLiveStats: true,
        items: [
          { value: '14,000', label: 'Designers Trained', prefix: '', suffix: '+' },
          { value: '40', label: 'Countries', prefix: '', suffix: '+' },
          { value: '120', label: 'Real Projects', prefix: '', suffix: '+' },
          { value: '2019', label: 'Founded', prefix: '', suffix: '' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'How We Teach',
        subtitle: 'The principles behind every course.',
        items: [
          { icon: '🧱', title: 'Real Briefs', description: 'You work on projects modeled on actual client and product work — not toy exercises.' },
          { icon: '🗣️', title: 'Honest Critique', description: 'Practicing designers review your work and tell you what will make it better.' },
          { icon: '🎯', title: 'Craft & Process', description: 'We teach the why behind the what, so your decisions hold up in any project.' },
          { icon: '🚀', title: 'Career-Ready', description: 'From portfolio to interview prep, we help you turn skills into a design career.' },
        ],
        columns: '2',
      }),
      c('TeamGrid', {
        title: 'Meet Your Mentors',
        subtitle: 'Working designers who love to teach.',
        members: [
          { name: 'Priya Nair', role: 'Founder & UX Lead', bio: 'Former product designer at a major tech company. 12 years shipping real products.', avatar: '' },
          { name: 'Tomás Herrera', role: 'Graphic Design Mentor', bio: 'Brand and identity designer with an award-winning studio background.', avatar: '' },
          { name: 'Hana Kim', role: 'Illustration Mentor', bio: 'Freelance illustrator whose work has appeared in major publications.', avatar: '' },
          { name: 'Felix Bauer', role: 'Motion Mentor', bio: 'Motion designer for studios and brands, specializing in UI animation.', avatar: '' },
        ],
      }),
      c('CtaBlock', {
        title: 'Come Make Something Great',
        subtitle: 'Start a project-based course and build a portfolio you’re proud of.',
        primaryCtaLabel: 'Start Creating',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'Contact Us',
        secondaryCtaHref: '#contact',
        style: 'gradient',
      }),
      footer(),
    ],
    zones: {},
  },
}

const faqTemplate: PuckTemplate = {
  name: 'Design School — FAQ',
  description: 'FAQ page for a design school covering courses, tools, portfolio, and pricing.',
  category: 'design',
  sort_order: 62,
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
        subtitle: 'Everything you need to know about courses, tools, and building your portfolio.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '300px',
      }),
      c('FaqAccordion', {
        title: 'Getting Started',
        subtitle: '',
        items: [
          { question: 'Do I need prior design experience?', answer: 'Not at all. Our beginner courses start from the fundamentals. No art degree or prior experience required — just curiosity and a willingness to make things.' },
          { question: 'What software and tools do I need?', answer: 'Mostly Figma (free) for UX/UI and the Adobe Creative Suite for graphic and motion courses. Each course lists exactly what is needed, with free alternatives where possible.' },
          { question: 'What can I specialize in?', answer: 'We offer learning paths in UX/UI design, graphic design, illustration, and motion design. You can focus on one or explore several.' },
          { question: 'How are courses structured?', answer: 'Each course is project-based: short lessons followed by hands-on work, building toward a finished, portfolio-ready piece.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Portfolio & Feedback',
        subtitle: '',
        items: [
          { question: 'Will I actually build a portfolio?', answer: 'Yes. Because every course is built around a real project, you finish with polished work you can show to clients or employers.' },
          { question: 'How do critiques work?', answer: 'You submit your project and a practicing designer reviews it with specific, actionable feedback. All-Access and Mentorship members get recurring portfolio reviews.' },
          { question: 'Do you help with getting a job?', answer: 'We provide portfolio guidance, resume and case-study help, and interview prep. Mentorship members get personalized career support.' },
          { question: 'Can I share my work with the community?', answer: 'Absolutely. Our community is a place to post work, get inspired, exchange feedback, and grow alongside other designers.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Pricing & Plans',
        subtitle: '',
        items: [
          { question: 'How much does it cost?', answer: 'Individual courses start at $59 (one-time). All-Access is $29/month for the full library, and Mentorship with 1-on-1 calls is $129/month.' },
          { question: 'Is there a free trial?', answer: 'Several courses include free preview lessons so you can experience our teaching style before committing.' },
          { question: 'Can I cancel anytime?', answer: 'Yes. Subscriptions have no contract — cancel with one click and keep access until your billing period ends.' },
          { question: 'Do you offer refunds?', answer: 'We offer a 30-day money-back guarantee on all purchases. If it is not the right fit, contact us for a full refund.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Still Have Questions?',
        subtitle: 'Our team is happy to help you choose the right path and plan.',
        primaryCtaLabel: 'Contact Us',
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
  name: 'Design School — Contact',
  description: 'Contact page for a design school with form and quick answers.',
  category: 'design',
  sort_order: 63,
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
        title: 'Get in Touch',
        subtitle: 'Questions about courses, mentorship, or your portfolio? We would love to help you start creating.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '300px',
      }),
      c('ContactForm', {
        title: 'Send Us a Message',
        subtitle: 'Tell us what you want to design and your experience level — we will recommend the right path.',
        email: 'hello@canvas.design',
        showPhone: false, showMessage: true,
      }),
      c('FaqAccordion', {
        title: 'Quick Answers',
        subtitle: '',
        items: [
          { question: 'How do I get started?', answer: 'Browse the course catalog, pick a project that excites you, and enroll. You will be designing within your first lesson.' },
          { question: 'Can I get 1-on-1 mentorship?', answer: 'Yes. Our Mentorship plan includes biweekly 1-on-1 calls, a personal portfolio plan, and career support.' },
          { question: 'Do you work with teams or studios?', answer: 'We do. Reach out for team plans with group pricing and progress tracking for agencies and in-house design teams.' },
        ],
      }),
      footer(),
    ],
    zones: {},
  },
}

export const designSchoolTemplates: PuckTemplate[] = [
  homeTemplate,
  aboutTemplate,
  faqTemplate,
  contactTemplate,
]
