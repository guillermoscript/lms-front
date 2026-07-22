import { c, type PuckTemplate } from './_shared'

// ─── Language School ─────────────────────────────────────────────────────────
// Multi-page pack for language academies (English, Spanish, French…). LATAM-
// and English-market friendly. Pages: Home, About, FAQ, Contact.

const LOGO = '🗣️ LinguaSchool'
const FOOTER_COLUMNS = [
  { title: 'Learn', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Pricing', href: '/pricing' }, { label: 'Placement Test', href: '#' }] },
  { title: 'School', links: [{ label: 'About', href: '#about' }, { label: 'Our Teachers', href: '#about' }, { label: 'Contact', href: '#contact' }] },
  { title: 'Legal', links: [{ label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
]

function header(navLinks: { label: string; href: string }[]) {
  return c('Header', {
    logo: '', logoText: LOGO, navLinks,
    ctaLabel: 'Start Free Trial', ctaHref: '/courses',
    showLogin: true, sticky: true, transparent: false,
  })
}

function footer() {
  return c('Footer', {
    description: 'Speak a new language with confidence. Live classes, native teachers, real conversation practice.',
    columns: FOOTER_COLUMNS,
    socialLinks: [{ platform: 'Instagram', url: '#' }, { platform: 'YouTube', url: '#' }, { platform: 'Facebook', url: '#' }],
    copyright: '© 2026 LinguaSchool. All rights reserved.',
  })
}

const homeTemplate: PuckTemplate = {
  name: 'Language School — Home',
  description: 'Landing page for language academies: levels, native teachers, conversation practice, and pricing.',
  category: 'language-school',
  sort_order: 20,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      header([
        { label: 'Courses', href: '/courses' },
        { label: 'Levels', href: '#levels' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'About', href: '#about' },
        { label: 'FAQ', href: '#faq' },
      ]),
      c('HeroBlock', {
        title: 'Speak a New Language. Sooner Than You Think.',
        subtitle: 'Live classes with native teachers, conversation practice from day one, and a path tailored to your level — from absolute beginner to fluent.',
        primaryCtaLabel: 'Take Free Placement Test',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'See Pricing',
        secondaryCtaHref: '#pricing',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '500px',
      }),
      c('StatsCounter', {
        useLiveStats: true,
        items: [
          { value: '8,000', label: 'Active Students', prefix: '', suffix: '+' },
          { value: '6', label: 'Languages', prefix: '', suffix: '' },
          { value: '120', label: 'Native Teachers', prefix: '', suffix: '+' },
          { value: '4.9', label: 'Average Rating', prefix: '', suffix: '/5' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'A Better Way to Learn a Language',
        subtitle: 'Everything you need to go from your first words to real conversations.',
        items: [
          { icon: '🌍', title: 'Native Teachers', description: 'Learn pronunciation, slang, and culture from teachers who grew up speaking the language.' },
          { icon: '💬', title: 'Conversation First', description: 'Speak from your very first class. We focus on real communication, not just grammar drills.' },
          { icon: '📈', title: 'CEFR Levels', description: 'Structured A1–C2 path aligned to international standards. Always know exactly where you stand.' },
          { icon: '🕐', title: 'Flexible Schedule', description: 'Morning, evening, and weekend classes. Learn on a schedule that fits your life.' },
          { icon: '👥', title: 'Small Groups', description: 'Maximum 6 students per class so everyone gets to speak and get feedback.' },
          { icon: '🏆', title: 'Official Certificates', description: 'Earn verifiable certificates at each level to prove your progress to employers and schools.' },
        ],
        columns: '3',
      }),
      c('FeaturesGrid', {
        title: 'Find Your Level',
        subtitle: 'Whether you are starting from zero or polishing fluency, there is a path for you.',
        items: [
          { icon: '🌱', title: 'Beginner (A1–A2)', description: 'Build a foundation: greetings, everyday vocabulary, and your first conversations.' },
          { icon: '🌿', title: 'Intermediate (B1–B2)', description: 'Express opinions, handle travel and work situations, and understand native speakers.' },
          { icon: '🌳', title: 'Advanced (C1–C2)', description: 'Master nuance, idioms, and professional fluency. Speak with confidence in any setting.' },
        ],
        columns: '3',
      }),
      c('CourseGrid', {
        courseIds: [],
        title: 'Popular Courses',
        subtitle: 'Start with our most popular language courses, chosen by thousands of learners.',
        maxItems: 6, columns: '3', showPrice: true, showDescription: true,
      }),
      c('PricingTable', {
        title: 'Simple, Flexible Pricing',
        subtitle: 'Pay as you go or save with a membership. Cancel anytime.',
        items: [
          { name: 'Group Classes', price: '$59', period: '/month', description: 'Learn with a small group', features: '4 live group classes per week\nNative teacher\nCourse materials included\nLevel certificate\nCommunity access', highlighted: false, ctaLabel: 'Join a Group', ctaHref: '/courses' },
          { name: 'Unlimited', price: '$99', period: '/month', description: 'Our most popular plan', features: 'Unlimited group classes\n2 private lessons per month\nConversation clubs\nAI pronunciation feedback\nPriority scheduling', highlighted: true, ctaLabel: 'Start Unlimited', ctaHref: '#' },
          { name: 'Private 1-on-1', price: '$29', period: '/lesson', description: 'Fully personalized', features: 'One-on-one with a native teacher\nCustom lesson plan\nFlexible scheduling\nFocus on your goals\nRecorded lessons', highlighted: false, ctaLabel: 'Book a Lesson', ctaHref: '#contact' },
        ],
      }),
      c('TestimonialGrid', {
        title: 'Loved by Learners Worldwide',
        subtitle: 'Real stories from students who found their voice in a new language.',
        items: [
          { name: 'Camila T.', role: 'Learned English', quote: 'After six months I went from silent in meetings to leading them in English. The conversation focus made all the difference.', rating: 5 },
          { name: 'Hiroshi N.', role: 'Learned Spanish', quote: 'The native teachers and small groups meant I actually spoke every class. I passed my B2 exam on the first try.', rating: 5 },
          { name: 'Sophie L.', role: 'Learned French', quote: 'Flexible evening classes fit around my job perfectly. I am finally having real conversations on my trips to Paris.', rating: 5 },
        ],
      }),
      c('FaqAccordion', {
        title: 'Common Questions',
        subtitle: '',
        items: [
          { question: 'I am a complete beginner. Can I still join?', answer: 'Absolutely. Our A1 courses assume zero prior knowledge. We start with the very basics and build up at a comfortable pace.' },
          { question: 'How do you decide my level?', answer: 'Take our free online placement test. It takes about 15 minutes and recommends the right course for your current level.' },
          { question: 'Are classes live or recorded?', answer: 'Classes are live with a native teacher so you get real conversation and instant feedback. Private lessons can also be recorded for review.' },
          { question: 'What if I miss a class?', answer: 'No problem. You can join another group at the same level that week, and unlimited members get access to recorded conversation clubs.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Your First Conversation Is One Click Away',
        subtitle: 'Take the free placement test and book a trial class today — no credit card required.',
        primaryCtaLabel: 'Start Free Trial',
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
  name: 'Language School — About',
  description: 'About page for a language academy: mission, teaching method, and teachers.',
  category: 'language-school',
  sort_order: 21,
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
        title: 'We Believe Everyone Can Become Fluent',
        subtitle: 'No memorizing endless grammar tables. Just real conversation, patient teachers, and a method built around how people actually learn to speak.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 50, minHeight: '400px',
      }),
      c('TextBlock', {
        content: 'LinguaSchool started with a simple frustration: people study a language for years and still freeze when it is time to speak. We knew there had to be a better way.\n\nSo we built a school around conversation. Every class is led by a native teacher, every group is small enough that you speak constantly, and every level follows the international CEFR standard so your progress is real and measurable. Today we help over 8,000 students across the world find the confidence to speak — at work, while traveling, and with the people they love.',
        alignment: 'center', color: '', maxWidth: '768px', fontSize: '1.125rem',
      }),
      c('StatsCounter', {
        useLiveStats: true,
        items: [
          { value: '8,000', label: 'Students Worldwide', prefix: '', suffix: '+' },
          { value: '6', label: 'Languages Taught', prefix: '', suffix: '' },
          { value: '50', label: 'Countries', prefix: '', suffix: '+' },
          { value: '2017', label: 'Founded', prefix: '', suffix: '' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'Our Teaching Method',
        subtitle: 'Four principles behind every class we teach.',
        items: [
          { icon: '💬', title: 'Speak From Day One', description: 'You start using the language immediately. We build confidence through practice, not perfection.' },
          { icon: '🎧', title: 'Immersive & Native', description: 'Classes are taught in the target language by native speakers, so your ear adapts naturally.' },
          { icon: '🧩', title: 'Real-Life Context', description: 'Learn vocabulary and grammar through scenarios you will actually use — ordering, traveling, working.' },
          { icon: '📊', title: 'Measurable Progress', description: 'Every level maps to CEFR standards, so you always know exactly how far you have come.' },
        ],
        columns: '2',
      }),
      c('TeamGrid', {
        title: 'Meet Our Teachers',
        subtitle: 'Native speakers and certified language educators who love what they do.',
        members: [
          { name: 'Emma Wilson', role: 'Head of English', bio: 'CELTA-certified, 10+ years teaching English to professionals across Latin America.', avatar: '' },
          { name: 'Diego Martínez', role: 'Head of Spanish', bio: 'Native from Madrid. Specializes in conversational fluency and exam preparation.', avatar: '' },
          { name: 'Claire Dubois', role: 'Head of French', bio: 'Paris-born teacher passionate about culture-driven language learning.', avatar: '' },
          { name: 'Marco Rossi', role: 'Curriculum Lead', bio: 'Applied linguist who designs our CEFR-aligned learning paths.', avatar: '' },
        ],
      }),
      c('CtaBlock', {
        title: 'Come Learn With Us',
        subtitle: 'Take the free placement test and meet your future teacher.',
        primaryCtaLabel: 'Start Free Trial',
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
  name: 'Language School — FAQ',
  description: 'FAQ page for a language academy covering levels, classes, pricing, and certificates.',
  category: 'language-school',
  sort_order: 22,
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
        subtitle: 'Everything you need to know about classes, levels, pricing, and certificates.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 50, minHeight: '300px',
      }),
      c('FaqAccordion', {
        title: 'Getting Started',
        subtitle: '',
        items: [
          { question: 'Do I need any prior knowledge?', answer: 'Not at all. Our A1 beginner courses assume zero knowledge. You will learn your first words and phrases in the very first class.' },
          { question: 'How do I know which level to join?', answer: 'Take our free 15-minute online placement test. It evaluates your reading, listening, and grammar and recommends the perfect starting course.' },
          { question: 'Which languages do you offer?', answer: 'We currently teach English, Spanish, French, Italian, German, and Portuguese, with new languages added regularly.' },
          { question: 'Can I switch languages later?', answer: 'Yes. Your membership lets you start a new language anytime — many students learn two at once.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Classes & Schedule',
        subtitle: '',
        items: [
          { question: 'Are classes live or self-paced?', answer: 'All group and private classes are live with a native teacher. We also offer self-paced practice materials and recorded conversation clubs.' },
          { question: 'How big are the groups?', answer: 'Group classes are capped at 6 students so everyone gets plenty of speaking time and personal feedback.' },
          { question: 'What times are classes available?', answer: 'We run classes across multiple time zones — mornings, evenings, and weekends — so you can always find a slot that fits.' },
          { question: 'What happens if I miss a class?', answer: 'You can join another group at your level the same week, and unlimited members get access to recorded sessions and conversation clubs.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Pricing & Certificates',
        subtitle: '',
        items: [
          { question: 'How much does it cost?', answer: 'Group memberships start at $59/month. Our most popular Unlimited plan is $99/month, and private 1-on-1 lessons are $29 each.' },
          { question: 'Is there a free trial?', answer: 'Yes. You can take the placement test and book a free trial class before committing to any plan — no credit card required.' },
          { question: 'Do I get a certificate?', answer: 'Yes. You earn a verifiable digital certificate at the end of each CEFR level (A1 through C2) that you can share on LinkedIn or your resume.' },
          { question: 'Can I get a refund?', answer: 'We offer a 14-day money-back guarantee on all memberships. If it is not the right fit, contact us for a full refund.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Still Have Questions?',
        subtitle: 'Our team is happy to help you choose the right plan and level.',
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
  name: 'Language School — Contact',
  description: 'Contact page for a language academy with form and quick answers.',
  category: 'language-school',
  sort_order: 23,
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
        subtitle: 'Questions about levels, scheduling, or private lessons? We would love to help you start speaking.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 50, minHeight: '300px',
      }),
      c('ContactForm', {
        title: 'Send Us a Message',
        subtitle: 'Tell us which language you want to learn and your goals — we will recommend the right path.',
        email: 'hello@linguaschool.com',
        showPhone: true, showMessage: true,
      }),
      c('FaqAccordion', {
        title: 'Quick Answers',
        subtitle: '',
        items: [
          { question: 'How do I book a free trial class?', answer: 'Take the placement test from the Courses page, then pick a trial slot at your recommended level. We will confirm by email.' },
          { question: 'Can I take private lessons only?', answer: 'Yes. Private 1-on-1 lessons are available for every language and level, fully scheduled around your availability.' },
          { question: 'Do you offer classes for companies?', answer: 'We do. Reach out for corporate language training with custom schedules, progress reports, and group pricing.' },
        ],
      }),
      footer(),
    ],
    zones: {},
  },
}

export const languageSchoolTemplates: PuckTemplate[] = [
  homeTemplate,
  aboutTemplate,
  faqTemplate,
  contactTemplate,
]
