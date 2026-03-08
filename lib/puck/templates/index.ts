import type { Data } from '@measured/puck'

export interface PuckTemplate {
  name: string
  description: string
  category: string
  puck_data: Data
  sort_order: number
  pageType: string
}

// Counter to generate unique-per-template IDs at module level.
// Fresh IDs are generated when templates are applied via deepCloneWithFreshIds().
let idCounter = 0
function c(type: string, props: Record<string, unknown>, id?: string) {
  return { type, props: { id: id || `${type}-tpl-${++idCounter}`, ...props } }
}

/** Deep-clone a template's puck_data and assign fresh random IDs to all components */
export function deepCloneWithFreshIds(data: Data): Data {
  const cloned = JSON.parse(JSON.stringify(data)) as Data
  for (const item of cloned.content) {
    if (item.props?.id) {
      item.props.id = `${item.type}-${Math.random().toString(36).slice(2, 10)}`
    }
  }
  for (const zoneItems of Object.values(cloned.zones || {})) {
    for (const item of zoneItems as Array<{ type: string; props: Record<string, unknown> }>) {
      if (item.props?.id) {
        item.props.id = `${item.type}-${Math.random().toString(36).slice(2, 10)}`
      }
    }
  }
  return cloned
}

// ─── Blank Template ──────────────────────────────────────────────────────────

const blankTemplate: PuckTemplate = {
  name: 'Blank',
  description: 'Start from scratch with an empty canvas.',
  category: 'general',
  sort_order: 0,
  pageType: 'all',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: 'Academy',
        navLinks: [{ label: 'Courses', href: '/courses' }],
        ctaLabel: 'Enroll Now',
        ctaHref: '/courses',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Welcome to Our Academy',
        subtitle: 'Start your learning journey today.',
        primaryCtaLabel: 'Get Started',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: '400px',
      }),
      c('Footer', {
        description: 'Welcome to our learning platform.',
        columns: [],
        socialLinks: [],
        copyright: '© 2026 Academy. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── Modern Academy ──────────────────────────────────────────────────────────

const modernAcademyTemplate: PuckTemplate = {
  name: 'Modern Academy',
  description: 'A polished landing page with features, courses, testimonials, and CTA.',
  category: 'education',
  sort_order: 1,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: 'Academy',
        navLinks: [
          { label: 'Courses', href: '/courses' },
          { label: 'About', href: '#about' },
          { label: 'Contact', href: '#contact' },
        ],
        ctaLabel: 'Enroll Now',
        ctaHref: '/courses',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Master New Skills, Transform Your Career',
        subtitle: 'Expert-led courses designed for professionals who want to level up. Learn at your own pace with hands-on projects and AI-powered tutoring.',
        primaryCtaLabel: 'Browse Courses',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'Learn More',
        secondaryCtaHref: '#features',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 60,
        minHeight: '500px',
      }),
      c('FeaturesGrid', {
        title: 'Why Choose Us',
        subtitle: 'Everything you need to succeed in your learning journey.',
        items: [
          { icon: '🎓', title: 'Expert Instructors', description: 'Learn from industry professionals with years of real-world experience.' },
          { icon: '📚', title: 'Structured Courses', description: 'Well-organized curriculum designed for effective, practical learning.' },
          { icon: '🤖', title: 'AI Tutor', description: 'Get personalized help from our AI tutor available 24/7.' },
          { icon: '🏆', title: 'Certificates', description: 'Earn verifiable certificates upon completing each course.' },
          { icon: '🎮', title: 'Gamification', description: 'Stay motivated with XP, achievements, and leaderboards.' },
          { icon: '💳', title: 'Flexible Pricing', description: 'Individual courses or subscription plans — you choose.' },
        ],
        columns: '3',
      }),
      c('CourseGrid', {
        title: 'Popular Courses',
        subtitle: 'Explore our most popular courses, chosen by students like you.',
        maxItems: 6,
        columns: '3',
        showPrice: true,
        showDescription: true,
      }),
      c('TestimonialGrid', {
        title: 'What Our Students Say',
        subtitle: 'Hear from learners who transformed their careers with us.',
        items: [
          { name: 'Maria S.', role: 'Web Developer', quote: 'The courses are incredibly well-structured. I went from beginner to professional in just 3 months.', rating: 5 },
          { name: 'Carlos R.', role: 'Data Analyst', quote: 'Best online learning platform I have used. The AI tutor is a game changer.', rating: 5 },
          { name: 'Ana L.', role: 'UX Designer', quote: 'The gamification keeps me motivated every day. Already on a 30-day streak!', rating: 5 },
        ],
      }),
      c('CtaBlock', {
        title: 'Ready to Start Learning?',
        subtitle: 'Join thousands of students and start your journey today.',
        primaryCtaLabel: 'Get Started',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        style: 'gradient',
      }),
      c('Footer', {
        description: 'Your online academy for professional development and personal growth.',
        columns: [
          { title: 'Courses', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Pricing', href: '/pricing' }] },
          { title: 'Company', links: [{ label: 'About', href: '#about' }, { label: 'Contact', href: '#contact' }] },
          { title: 'Legal', links: [{ label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
        ],
        socialLinks: [],
        copyright: '© 2026 Academy. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── Minimal ─────────────────────────────────────────────────────────────────

const minimalTemplate: PuckTemplate = {
  name: 'Minimal',
  description: 'A clean, simple landing page focused on courses.',
  category: 'general',
  sort_order: 2,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: 'Academy',
        navLinks: [{ label: 'Courses', href: '/courses' }],
        ctaLabel: 'Start Learning',
        ctaHref: '/courses',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Learn Without Limits',
        subtitle: 'High-quality courses for every skill level.',
        primaryCtaLabel: 'Explore Courses',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: '400px',
      }),
      c('CourseGrid', {
        title: 'Our Courses',
        subtitle: '',
        maxItems: 6,
        columns: '3',
        showPrice: true,
        showDescription: false,
      }),
      c('FaqAccordion', {
        title: 'FAQ',
        subtitle: '',
        items: [
          { question: 'How do I get started?', answer: 'Create an account and browse our course catalog.' },
          { question: 'Do I receive a certificate?', answer: 'Yes, every completed course earns you a verifiable digital certificate.' },
          { question: 'Can I learn at my own pace?', answer: 'Absolutely. All courses are self-paced.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Start Your Journey Today',
        subtitle: 'No credit card required.',
        primaryCtaLabel: 'Get Started Free',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        style: 'gradient',
      }),
      c('Footer', {
        description: 'Simple, focused online learning.',
        columns: [
          { title: 'Links', links: [{ label: 'Courses', href: '/courses' }, { label: 'About', href: '#about' }] },
        ],
        socialLinks: [],
        copyright: '© 2026 Academy. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── Bold Creator ────────────────────────────────────────────────────────────

const boldCreatorTemplate: PuckTemplate = {
  name: 'Bold Creator',
  description: 'A high-energy page for solo creators and small teams.',
  category: 'creative',
  sort_order: 3,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: 'Creator Academy',
        navLinks: [
          { label: 'Courses', href: '/courses' },
          { label: 'About', href: '#about' },
        ],
        ctaLabel: 'Join Now',
        ctaHref: '/courses',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Level Up Your Skills',
        subtitle: 'Join a community of driven learners and build real-world projects.',
        primaryCtaLabel: 'Start Learning',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'See Courses',
        secondaryCtaHref: '/courses',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 60,
        minHeight: '500px',
      }),
      c('StatsCounter', {
        items: [
          { value: '5,000', label: 'Students', prefix: '', suffix: '+' },
          { value: '200', label: 'Courses', prefix: '', suffix: '+' },
          { value: '50', label: 'Instructors', prefix: '', suffix: '+' },
          { value: '4.9', label: 'Rating', prefix: '', suffix: '/5' },
        ],
        alignment: 'center',
      }),
      c('CourseGrid', {
        title: 'Featured Courses',
        subtitle: 'Our most popular courses, hand-picked for you.',
        maxItems: 6,
        columns: '3',
        showPrice: true,
        showDescription: true,
      }),
      c('TeamGrid', {
        title: 'Meet Your Instructors',
        subtitle: 'Learn from industry experts with real-world experience.',
        members: [
          { name: 'Alex Johnson', role: 'Lead Instructor', bio: 'Full-stack developer with 10+ years of experience.', avatar: '' },
          { name: 'Sarah Chen', role: 'Course Designer', bio: 'Expert in curriculum development.', avatar: '' },
          { name: 'David Kim', role: 'AI Specialist', bio: 'Machine learning researcher and educator.', avatar: '' },
        ],
      }),
      c('CtaBlock', {
        title: 'Ready to Get Started?',
        subtitle: 'Join thousands of students building real-world skills.',
        primaryCtaLabel: 'Enroll Now',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        style: 'gradient',
      }),
      c('Footer', {
        description: 'Creator Academy — learn, build, grow.',
        columns: [
          { title: 'Courses', links: [{ label: 'All Courses', href: '/courses' }] },
          { title: 'Company', links: [{ label: 'About', href: '#about' }, { label: 'Contact', href: '#contact' }] },
        ],
        socialLinks: [],
        copyright: '© 2026 Creator Academy. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── Course Catalog ──────────────────────────────────────────────────────────

const courseCatalogTemplate: PuckTemplate = {
  name: 'Course Catalog',
  description: 'Showcase your full course catalog with pricing.',
  category: 'education',
  sort_order: 4,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: 'Academy',
        navLinks: [{ label: 'Courses', href: '/courses' }, { label: 'Pricing', href: '#pricing' }],
        ctaLabel: 'Enroll',
        ctaHref: '/courses',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Explore Our Complete Course Catalog',
        subtitle: 'Find the perfect course for your goals.',
        primaryCtaLabel: 'Browse All',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: '350px',
      }),
      c('CourseGrid', {
        title: 'All Courses',
        subtitle: 'Browse our full catalog and find the right fit for your goals.',
        maxItems: 12,
        columns: '3',
        showPrice: true,
        showDescription: true,
      }),
      c('PricingTable', {
        title: 'Pricing Plans',
        subtitle: 'Choose the plan that works for you.',
        items: [
          { name: 'Basic', price: '$19', period: '/month', description: 'For individuals', features: 'Access to all courses\nCommunity support\nCertificates', highlighted: false, ctaLabel: 'Start Free', ctaHref: '#' },
          { name: 'Pro', price: '$49', period: '/month', description: 'For professionals', features: 'Everything in Basic\nPriority support\n1-on-1 mentoring\nAdvanced courses', highlighted: true, ctaLabel: 'Get Pro', ctaHref: '#' },
          { name: 'Team', price: '$99', period: '/month', description: 'For organizations', features: 'Everything in Pro\nTeam management\nCustom integrations\nDedicated support', highlighted: false, ctaLabel: 'Contact Us', ctaHref: '#' },
        ],
      }),
      c('CtaBlock', {
        title: 'Start Learning Today',
        subtitle: 'Enroll in a course and begin building new skills right away.',
        primaryCtaLabel: 'Browse Courses',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        style: 'default',
      }),
      c('Footer', {
        description: 'Explore courses and start learning today.',
        columns: [],
        socialLinks: [],
        copyright: '© 2026 Academy. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── About ───────────────────────────────────────────────────────────────────

const aboutTemplate: PuckTemplate = {
  name: 'About Us',
  description: 'Tell your story with team profiles and stats.',
  category: 'general',
  sort_order: 5,
  pageType: 'about',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: 'Academy',
        navLinks: [{ label: 'Home', href: '/' }, { label: 'Courses', href: '/courses' }],
        ctaLabel: 'Enroll',
        ctaHref: '/courses',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'About Us',
        subtitle: 'Our mission is to make quality education accessible to everyone.',
        primaryCtaLabel: '',
        primaryCtaHref: '',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: '350px',
      }),
      c('TextBlock', {
        content: 'We started with a simple idea: everyone deserves access to high-quality education. Today, we serve thousands of students across the world with expert-led courses covering programming, design, data science, and more.\n\nOur team of experienced educators and technologists is passionate about building the best learning experience possible.',
        alignment: 'center',
        color: '',
        maxWidth: '768px',
        fontSize: '1.125rem',
      }),
      c('StatsCounter', {
        items: [
          { value: '10,000', label: 'Students', prefix: '', suffix: '+' },
          { value: '500', label: 'Courses', prefix: '', suffix: '+' },
          { value: '50', label: 'Countries', prefix: '', suffix: '' },
          { value: '4.9', label: 'Satisfaction', prefix: '', suffix: '/5' },
        ],
        alignment: 'center',
      }),
      c('TeamGrid', {
        title: 'Our Team',
        subtitle: 'The people behind the platform.',
        members: [
          { name: 'Alex Johnson', role: 'CEO & Founder', bio: 'Former Google engineer turned education evangelist.', avatar: '' },
          { name: 'Sarah Chen', role: 'Head of Content', bio: 'Curriculum designer with 15 years in EdTech.', avatar: '' },
          { name: 'David Kim', role: 'CTO', bio: 'Built scalable platforms at AWS and Stripe.', avatar: '' },
          { name: 'Maria Lopez', role: 'Community Lead', bio: 'Connecting students with mentors worldwide.', avatar: '' },
        ],
      }),
      c('CtaBlock', {
        title: 'Join Our Community',
        subtitle: 'Start learning with us today.',
        primaryCtaLabel: 'Get Started',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'Contact Us',
        secondaryCtaHref: '#contact',
        style: 'gradient',
      }),
      c('Footer', {
        description: 'Quality education, accessible to everyone.',
        columns: [],
        socialLinks: [],
        copyright: '© 2026 Academy. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── Contact ─────────────────────────────────────────────────────────────────

const contactTemplate: PuckTemplate = {
  name: 'Contact',
  description: 'Contact form with FAQ section.',
  category: 'general',
  sort_order: 6,
  pageType: 'contact',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: 'Academy',
        navLinks: [{ label: 'Home', href: '/' }, { label: 'Courses', href: '/courses' }],
        ctaLabel: '',
        ctaHref: '',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Get in Touch',
        subtitle: 'We would love to hear from you.',
        primaryCtaLabel: '',
        primaryCtaHref: '',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: '300px',
      }),
      c('ContactForm', {
        title: '',
        subtitle: 'Send us a message and we will get back to you within 24 hours.',
        email: 'hello@academy.com',
        showPhone: true,
        showMessage: true,
      }),
      c('FaqAccordion', {
        title: 'Common Questions',
        subtitle: '',
        items: [
          { question: 'What are your support hours?', answer: 'We respond to all inquiries within 24 hours, Monday through Friday.' },
          { question: 'Can I request a refund?', answer: 'Yes, we offer a 30-day money-back guarantee on all courses.' },
          { question: 'How do I report a technical issue?', answer: 'Use the contact form above or email us directly at support@academy.com.' },
        ],
      }),
      c('Footer', {
        description: 'We are here to help. Reach out anytime.',
        columns: [],
        socialLinks: [],
        copyright: '© 2026 Academy. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const faqTemplate: PuckTemplate = {
  name: 'FAQ',
  description: 'Comprehensive FAQ page with multiple categories.',
  category: 'general',
  sort_order: 7,
  pageType: 'faq',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: 'Academy',
        navLinks: [{ label: 'Home', href: '/' }, { label: 'Courses', href: '/courses' }],
        ctaLabel: '',
        ctaHref: '',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Frequently Asked Questions',
        subtitle: 'Find answers to common questions.',
        primaryCtaLabel: '',
        primaryCtaHref: '',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: '300px',
      }),
      c('FaqAccordion', {
        title: 'Getting Started',
        subtitle: '',
        items: [
          { question: 'How do I create an account?', answer: 'Click the "Sign Up" button and follow the prompts. You can sign up with your email or Google account.' },
          { question: 'Are the courses self-paced?', answer: 'Yes, all courses are fully self-paced. You can learn on your own schedule.' },
          { question: 'Do I need any prerequisites?', answer: 'Each course lists its prerequisites on the course page. Many beginner courses have no prerequisites.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Billing & Payments',
        subtitle: '',
        items: [
          { question: 'What payment methods do you accept?', answer: 'We accept all major credit cards, debit cards, and PayPal through our secure payment processor.' },
          { question: 'Can I get a refund?', answer: 'Yes, we offer a 30-day money-back guarantee on all course purchases.' },
          { question: 'Are there any hidden fees?', answer: 'No. The price you see is the price you pay. No hidden fees or recurring charges unless you choose a subscription plan.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Certificates & Completion',
        subtitle: '',
        items: [
          { question: 'Do I get a certificate?', answer: 'Yes! Upon completing a course, you receive a verifiable digital certificate.' },
          { question: 'How can I verify a certificate?', answer: 'Each certificate has a unique QR code and URL that can be used for verification.' },
          { question: 'Can I share my certificate?', answer: 'Absolutely. You can download your certificate as a PDF or share the verification link on your resume or LinkedIn.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Still have questions?',
        subtitle: 'Our support team is here to help.',
        primaryCtaLabel: 'Contact Support',
        primaryCtaHref: '#contact',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        style: 'bordered',
      }),
      c('Footer', {
        description: 'Answers to your questions, all in one place.',
        columns: [],
        socialLinks: [],
        copyright: '© 2026 Academy. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── Code School — Landing Page ──────────────────────────────────────────────

const codeSchoolHomeTemplate: PuckTemplate = {
  name: 'Code School — Home',
  description: 'Full landing page for coding bootcamps and programming schools.',
  category: 'code-school',
  sort_order: 10,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: '</> CodeSchool',
        navLinks: [
          { label: 'Courses', href: '/courses' },
          { label: 'Pricing', href: '#pricing' },
          { label: 'About', href: '#about' },
          { label: 'FAQ', href: '#faq' },
          { label: 'Contact', href: '#contact' },
        ],
        ctaLabel: 'Start Coding',
        ctaHref: '/courses',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Learn to Code. Build Real Projects. Launch Your Career.',
        subtitle: 'From your first line of code to your first job — structured, hands-on courses in web development, Python, data science, and more.',
        primaryCtaLabel: 'Browse Courses',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'View Pricing',
        secondaryCtaHref: '#pricing',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 60,
        minHeight: '520px',
      }),
      c('StatsCounter', {
        items: [
          { value: '12,000', label: 'Students Enrolled', prefix: '', suffix: '+' },
          { value: '95', label: 'Completion Rate', prefix: '', suffix: '%' },
          { value: '85', label: 'Job Placement', prefix: '', suffix: '%' },
          { value: '4.8', label: 'Student Rating', prefix: '', suffix: '/5' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'Why Developers Choose Us',
        subtitle: 'Everything you need to go from beginner to professional developer.',
        items: [
          { icon: '💻', title: 'Project-Based Learning', description: 'Build real applications from day one — portfolios, APIs, full-stack apps, and more.' },
          { icon: '🧑‍💻', title: 'Code Reviews', description: 'Get feedback on your code from experienced developers who review your pull requests.' },
          { icon: '🤖', title: 'AI Coding Tutor', description: 'Stuck on a bug? Our AI tutor explains concepts and helps you debug in real time.' },
          { icon: '📋', title: 'Structured Curriculum', description: 'Follow clear learning paths from fundamentals to advanced topics — no guesswork.' },
          { icon: '🏆', title: 'Certificates & Portfolio', description: 'Graduate with verifiable certificates and a portfolio of projects to show employers.' },
          { icon: '👥', title: 'Developer Community', description: 'Join a community of learners. Pair program, share projects, and grow together.' },
        ],
        columns: '3',
      }),
      c('CourseGrid', {
        title: 'Popular Courses',
        subtitle: 'Start with our most popular courses, chosen by thousands of students.',
        maxItems: 6,
        columns: '3',
        showPrice: true,
        showDescription: true,
      }),
      c('PricingTable', {
        title: 'Simple, Transparent Pricing',
        subtitle: 'No hidden fees. Cancel anytime.',
        items: [
          { name: 'Single Course', price: '$49', period: 'one-time', description: 'Buy any individual course', features: 'Lifetime access to one course\nProject files & source code\nCertificate of completion\nCommunity access', highlighted: false, ctaLabel: 'Browse Courses', ctaHref: '/courses' },
          { name: 'Pro Membership', price: '$29', period: '/month', description: 'For serious learners', features: 'Access to all courses\nNew courses every month\nCode reviews from mentors\nAI tutor unlimited access\nPriority support', highlighted: true, ctaLabel: 'Start Pro', ctaHref: '#' },
          { name: 'Team', price: '$79', period: '/month', description: 'For companies & teams', features: 'Everything in Pro\nUp to 10 team seats\nTeam progress dashboard\nCustom learning paths\nDedicated account manager', highlighted: false, ctaLabel: 'Contact Sales', ctaHref: '#contact' },
        ],
      }),
      c('TestimonialGrid', {
        title: 'What Our Graduates Say',
        subtitle: 'Real stories from developers who started their careers here.',
        items: [
          { name: 'Daniel M.', role: 'Frontend Developer at Shopify', quote: 'I had zero coding experience. Six months later, I landed a frontend role. The project-based approach made all the difference.', rating: 5 },
          { name: 'Priya K.', role: 'Full-Stack Developer', quote: 'The curriculum is incredibly well-structured. Each course builds on the last. I never felt lost or overwhelmed.', rating: 5 },
          { name: 'Lucas R.', role: 'Junior Backend Developer', quote: 'The AI tutor saved me hours of debugging. It is like having a senior developer on call 24/7.', rating: 5 },
        ],
      }),
      c('FaqAccordion', {
        title: 'Frequently Asked Questions',
        subtitle: '',
        items: [
          { question: 'Do I need prior coding experience?', answer: 'Not at all. Our beginner courses start from the very basics — variables, loops, and functions — and build up from there.' },
          { question: 'What programming languages do you teach?', answer: 'We offer courses in JavaScript, TypeScript, Python, React, Node.js, SQL, and more. Check our course catalog for the full list.' },
          { question: 'How long does it take to complete a learning path?', answer: 'Most learning paths take 3-6 months at 10 hours per week. All courses are self-paced, so you can go faster or slower.' },
          { question: 'Will I get a job after completing the courses?', answer: 'We can not guarantee employment, but 85% of our graduates who actively job search land a developer role within 6 months. We provide portfolio projects and career guidance.' },
          { question: 'Can I try before I buy?', answer: 'Yes! Several courses have free preview lessons. You can also start with our free introductory course to see if our teaching style works for you.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Write Your First Line of Code Today',
        subtitle: 'Join 12,000+ students building real-world projects and launching developer careers.',
        primaryCtaLabel: 'Start Learning Free',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'View Pricing',
        secondaryCtaHref: '#pricing',
        style: 'gradient',
      }),
      c('Footer', {
        description: 'Learn to code with structured, project-based courses. From beginner to professional developer.',
        columns: [
          { title: 'Learn', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Learning Paths', href: '/courses' }, { label: 'Pricing', href: '/pricing' }] },
          { title: 'Community', links: [{ label: 'About Us', href: '#about' }, { label: 'Blog', href: '#' }, { label: 'Student Projects', href: '#' }] },
          { title: 'Support', links: [{ label: 'FAQ', href: '#faq' }, { label: 'Contact', href: '#contact' }, { label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
        ],
        socialLinks: [
          { platform: 'GitHub', url: '#' },
          { platform: 'Twitter', url: '#' },
          { platform: 'Discord', url: '#' },
        ],
        copyright: '© 2026 CodeSchool. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── Code School — About Us ─────────────────────────────────────────────────

const codeSchoolAboutTemplate: PuckTemplate = {
  name: 'Code School — About',
  description: 'About page for a coding school with team, mission, and stats.',
  category: 'code-school',
  sort_order: 11,
  pageType: 'about',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: '</> CodeSchool',
        navLinks: [
          { label: 'Home', href: '/' },
          { label: 'Courses', href: '/courses' },
          { label: 'FAQ', href: '#faq' },
          { label: 'Contact', href: '#contact' },
        ],
        ctaLabel: 'Start Coding',
        ctaHref: '/courses',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Our Mission: Make Coding Accessible to Everyone',
        subtitle: 'We believe anyone can learn to code. No CS degree required, no bootcamp pressure — just clear, structured courses and a supportive community.',
        primaryCtaLabel: '',
        primaryCtaHref: '',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: '400px',
      }),
      c('TextBlock', {
        content: 'CodeSchool was founded by developers who were frustrated with the state of online coding education. Most courses were either too shallow, too theoretical, or too expensive. We set out to build something different: a platform where you learn by building real projects, get feedback from real developers, and graduate with a portfolio — not just a certificate.\n\nToday, we serve over 12,000 students across 40+ countries. Our graduates work at startups, agencies, and tech companies around the world. But our mission stays the same: make quality coding education accessible to everyone, regardless of background or budget.',
        alignment: 'center',
        color: '',
        maxWidth: '768px',
        fontSize: '1.125rem',
      }),
      c('StatsCounter', {
        items: [
          { value: '12,000', label: 'Students Worldwide', prefix: '', suffix: '+' },
          { value: '40', label: 'Countries', prefix: '', suffix: '+' },
          { value: '85', label: 'Job Placement Rate', prefix: '', suffix: '%' },
          { value: '2019', label: 'Founded', prefix: '', suffix: '' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'What Sets Us Apart',
        subtitle: '',
        items: [
          { icon: '🎯', title: 'Learn by Doing', description: 'Every course is built around real projects. No toy examples — you build apps you can actually use and show employers.' },
          { icon: '🔍', title: 'Code Reviews', description: 'Submit your code and get detailed feedback from experienced developers. Learn best practices from day one.' },
          { icon: '🤝', title: 'Community First', description: 'Learning alone is hard. Our Discord community connects you with fellow students for pair programming and support.' },
          { icon: '🚀', title: 'Career Support', description: 'Resume reviews, portfolio guidance, and interview prep to help you land your first (or next) developer role.' },
        ],
        columns: '2',
      }),
      c('TeamGrid', {
        title: 'Meet the Team',
        subtitle: 'Developers and educators building the future of coding education.',
        members: [
          { name: 'Marcus Chen', role: 'Founder & Lead Instructor', bio: 'Former senior engineer at GitHub. 12+ years building web applications.', avatar: '' },
          { name: 'Elena Rodriguez', role: 'Head of Curriculum', bio: 'CS professor turned EdTech builder. Designed curricula for 3 universities.', avatar: '' },
          { name: 'James Park', role: 'CTO', bio: 'Built scalable systems at Stripe and Vercel. Passionate about developer tools.', avatar: '' },
          { name: 'Sofia Andersen', role: 'Community Manager', bio: 'Connects students with mentors and runs our Discord community of 5,000+ developers.', avatar: '' },
        ],
      }),
      c('CtaBlock', {
        title: 'Ready to Start Your Coding Journey?',
        subtitle: 'Join our community of 12,000+ learners building real-world projects.',
        primaryCtaLabel: 'Browse Courses',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'View Pricing',
        secondaryCtaHref: '/pricing',
        style: 'gradient',
      }),
      c('Footer', {
        description: 'Learn to code with structured, project-based courses. From beginner to professional developer.',
        columns: [
          { title: 'Learn', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Pricing', href: '/pricing' }] },
          { title: 'Company', links: [{ label: 'About', href: '#about' }, { label: 'Contact', href: '#contact' }] },
          { title: 'Legal', links: [{ label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
        ],
        socialLinks: [
          { platform: 'GitHub', url: '#' },
          { platform: 'Twitter', url: '#' },
          { platform: 'Discord', url: '#' },
        ],
        copyright: '© 2026 CodeSchool. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── Code School — FAQ ──────────────────────────────────────────────────────

const codeSchoolFaqTemplate: PuckTemplate = {
  name: 'Code School — FAQ',
  description: 'FAQ page for a coding school covering courses, pricing, and career support.',
  category: 'code-school',
  sort_order: 12,
  pageType: 'faq',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: '</> CodeSchool',
        navLinks: [
          { label: 'Home', href: '/' },
          { label: 'Courses', href: '/courses' },
          { label: 'Pricing', href: '/pricing' },
          { label: 'Contact', href: '#contact' },
        ],
        ctaLabel: 'Start Coding',
        ctaHref: '/courses',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Frequently Asked Questions',
        subtitle: 'Everything you need to know about our courses, pricing, and platform.',
        primaryCtaLabel: '',
        primaryCtaHref: '',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: '300px',
      }),
      c('FaqAccordion', {
        title: 'Getting Started',
        subtitle: '',
        items: [
          { question: 'Do I need prior programming experience?', answer: 'No. Our beginner courses start from absolute zero — what a variable is, how to write your first function, etc. We assume no prior knowledge.' },
          { question: 'What programming languages do you teach?', answer: 'We currently offer courses in JavaScript, TypeScript, Python, React, Next.js, Node.js, SQL, and Git. We add new courses regularly.' },
          { question: 'How are the courses structured?', answer: 'Each course follows a project-based approach: short video lessons (5-15 min), followed by hands-on coding exercises. You build a real project throughout each course.' },
          { question: 'Can I learn at my own pace?', answer: 'Yes, all courses are fully self-paced. There are no deadlines, live sessions, or schedules to follow. Learn whenever it fits your life.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Courses & Learning Paths',
        subtitle: '',
        items: [
          { question: 'What is a learning path?', answer: 'A learning path is a curated sequence of courses designed to take you from beginner to job-ready in a specific area (e.g., Frontend Development, Full-Stack, Data Science).' },
          { question: 'How long does a typical course take?', answer: 'Most individual courses take 2-4 weeks at 5-10 hours per week. Full learning paths take 3-6 months depending on your pace.' },
          { question: 'Do I get access to source code and project files?', answer: 'Yes. Every course includes complete source code, starter files, and solution code. You can reference them anytime.' },
          { question: 'Is there an AI tutor?', answer: 'Yes! Our AI coding tutor can explain concepts, help you debug errors, and suggest improvements to your code. It is available 24/7 on Pro plans.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Pricing & Billing',
        subtitle: '',
        items: [
          { question: 'How much does it cost?', answer: 'Individual courses start at $49 (one-time). Our Pro membership is $29/month and gives you unlimited access to all courses, code reviews, and the AI tutor.' },
          { question: 'Is there a free trial?', answer: 'Several courses have free preview lessons you can try. We also offer a free introductory course so you can experience the platform before committing.' },
          { question: 'Can I get a refund?', answer: 'Yes. We offer a 30-day money-back guarantee on all purchases. If you are not satisfied, contact us for a full refund.' },
          { question: 'Do you offer team or student discounts?', answer: 'Yes. We offer team plans starting at $79/month for up to 10 seats. Students with a valid .edu email get 30% off Pro memberships.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Certificates & Career',
        subtitle: '',
        items: [
          { question: 'Do I get a certificate when I finish?', answer: 'Yes. Every completed course earns you a verifiable digital certificate with a unique QR code you can share on LinkedIn or your resume.' },
          { question: 'Do employers recognize these certificates?', answer: 'Our certificates demonstrate practical skills through real projects. Many employers value the portfolio of work you build during the courses as much as the certificate itself.' },
          { question: 'Do you help with job placement?', answer: 'We offer career support including resume reviews, portfolio feedback, and interview preparation. 85% of our graduates who actively job search land a role within 6 months.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Still Have Questions?',
        subtitle: 'Our team is happy to help. Reach out anytime.',
        primaryCtaLabel: 'Contact Us',
        primaryCtaHref: '#contact',
        secondaryCtaLabel: 'Browse Courses',
        secondaryCtaHref: '/courses',
        style: 'bordered',
      }),
      c('Footer', {
        description: 'Learn to code with structured, project-based courses.',
        columns: [
          { title: 'Learn', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Pricing', href: '/pricing' }] },
          { title: 'Support', links: [{ label: 'FAQ', href: '#faq' }, { label: 'Contact', href: '#contact' }] },
          { title: 'Legal', links: [{ label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
        ],
        socialLinks: [
          { platform: 'GitHub', url: '#' },
          { platform: 'Discord', url: '#' },
        ],
        copyright: '© 2026 CodeSchool. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── Code School — Contact ──────────────────────────────────────────────────

const codeSchoolContactTemplate: PuckTemplate = {
  name: 'Code School — Contact',
  description: 'Contact page for a coding school with form and common questions.',
  category: 'code-school',
  sort_order: 13,
  pageType: 'contact',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: '</> CodeSchool',
        navLinks: [
          { label: 'Home', href: '/' },
          { label: 'Courses', href: '/courses' },
          { label: 'FAQ', href: '#faq' },
        ],
        ctaLabel: 'Start Coding',
        ctaHref: '/courses',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Get in Touch',
        subtitle: 'Have a question about our courses, pricing, or team plans? We are here to help.',
        primaryCtaLabel: '',
        primaryCtaHref: '',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: '300px',
      }),
      c('ContactForm', {
        title: 'Send Us a Message',
        subtitle: 'We typically respond within 24 hours on business days.',
        email: 'hello@codeschool.com',
        showPhone: false,
        showMessage: true,
      }),
      c('FaqAccordion', {
        title: 'Before You Reach Out',
        subtitle: 'Quick answers to common questions.',
        items: [
          { question: 'How do I reset my password?', answer: 'Click "Forgot Password" on the login page and follow the email instructions. If you do not receive the email, check your spam folder.' },
          { question: 'I am having trouble accessing a course', answer: 'Make sure you are logged into the correct account. If the issue persists, email us with your account email and course name.' },
          { question: 'How do I cancel my subscription?', answer: 'You can cancel anytime from your account settings. Your access continues until the end of your current billing period.' },
          { question: 'Do you offer team or enterprise plans?', answer: 'Yes! Our team plan supports up to 10 seats at $79/month. For larger teams, reach out and we will create a custom plan.' },
        ],
      }),
      c('Footer', {
        description: 'Learn to code with structured, project-based courses.',
        columns: [
          { title: 'Learn', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Pricing', href: '/pricing' }] },
          { title: 'Support', links: [{ label: 'FAQ', href: '#faq' }, { label: 'Contact', href: '#contact' }] },
        ],
        socialLinks: [
          { platform: 'GitHub', url: '#' },
          { platform: 'Discord', url: '#' },
        ],
        copyright: '© 2026 CodeSchool. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── Code School — Course Catalog ───────────────────────────────────────────

const codeSchoolCatalogTemplate: PuckTemplate = {
  name: 'Code School — Courses',
  description: 'Course catalog page for a coding school with learning paths and pricing.',
  category: 'code-school',
  sort_order: 14,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      c('Header', {
        logo: '',
        logoText: '</> CodeSchool',
        navLinks: [
          { label: 'Home', href: '/' },
          { label: 'Pricing', href: '#pricing' },
          { label: 'About', href: '#about' },
          { label: 'FAQ', href: '#faq' },
        ],
        ctaLabel: 'Start Coding',
        ctaHref: '/courses',
        showLogin: true,
        sticky: true,
        transparent: false,
      }),
      c('HeroBlock', {
        title: 'Explore Our Courses',
        subtitle: 'From HTML basics to advanced system design — find the right course for your level and goals.',
        primaryCtaLabel: 'View All Courses',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        backgroundImage: '',
        alignment: 'center',
        overlayOpacity: 50,
        minHeight: '350px',
      }),
      c('FeaturesGrid', {
        title: 'Learning Paths',
        subtitle: 'Follow a structured path from beginner to job-ready.',
        items: [
          { icon: '🌐', title: 'Frontend Development', description: 'HTML, CSS, JavaScript, React, and Next.js. Build beautiful, responsive web applications.' },
          { icon: '⚙️', title: 'Backend Development', description: 'Node.js, Express, databases, REST APIs, and authentication. Power the server side.' },
          { icon: '🔄', title: 'Full-Stack Development', description: 'Combine frontend and backend skills. Build and deploy complete web applications.' },
          { icon: '📊', title: 'Data Science & Python', description: 'Python, pandas, SQL, data visualization, and machine learning fundamentals.' },
        ],
        columns: '2',
      }),
      c('CourseGrid', {
        title: 'All Courses',
        subtitle: 'Browse our complete catalog. New courses added every month.',
        maxItems: 12,
        columns: '3',
        showPrice: true,
        showDescription: true,
      }),
      c('PricingTable', {
        title: 'Choose Your Plan',
        subtitle: 'Buy individual courses or unlock everything with Pro.',
        items: [
          { name: 'Single Course', price: '$49', period: 'one-time', description: 'Buy any course individually', features: 'Lifetime access\nProject files & code\nCertificate\nCommunity access', highlighted: false, ctaLabel: 'Browse Courses', ctaHref: '/courses' },
          { name: 'Pro Membership', price: '$29', period: '/month', description: 'Unlimited access to everything', features: 'All courses included\nNew courses monthly\nCode reviews\nAI tutor\nPriority support', highlighted: true, ctaLabel: 'Go Pro', ctaHref: '#' },
        ],
      }),
      c('CtaBlock', {
        title: 'Start Building Today',
        subtitle: 'Pick a course, write your first line of code, and start building real projects.',
        primaryCtaLabel: 'Get Started',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: '',
        secondaryCtaHref: '',
        style: 'gradient',
      }),
      c('Footer', {
        description: 'Structured, project-based coding courses for every level.',
        columns: [
          { title: 'Learn', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Pricing', href: '/pricing' }] },
          { title: 'Company', links: [{ label: 'About', href: '#about' }, { label: 'Contact', href: '#contact' }] },
          { title: 'Legal', links: [{ label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
        ],
        socialLinks: [
          { platform: 'GitHub', url: '#' },
          { platform: 'Discord', url: '#' },
        ],
        copyright: '© 2026 CodeSchool. All rights reserved.',
      }),
    ],
    zones: {},
  },
}

// ─── Export all templates ─────────────────────────────────────────────────────

export const PUCK_TEMPLATES: PuckTemplate[] = [
  blankTemplate,
  modernAcademyTemplate,
  minimalTemplate,
  boldCreatorTemplate,
  courseCatalogTemplate,
  aboutTemplate,
  contactTemplate,
  faqTemplate,
  codeSchoolHomeTemplate,
  codeSchoolAboutTemplate,
  codeSchoolFaqTemplate,
  codeSchoolContactTemplate,
  codeSchoolCatalogTemplate,
]
