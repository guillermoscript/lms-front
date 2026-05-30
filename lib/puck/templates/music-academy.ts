import { c, type PuckTemplate } from './_shared'

// ─── Music Academy ───────────────────────────────────────────────────────────
// Multi-page pack for music schools and online instrument/vocal teachers.
// Pages: Home, About, FAQ, Contact.

const LOGO = '🎵 Crescendo'
const FOOTER_COLUMNS = [
  { title: 'Learn', links: [{ label: 'All Courses', href: '/courses' }, { label: 'Instruments', href: '#instruments' }, { label: 'Pricing', href: '/pricing' }] },
  { title: 'Academy', links: [{ label: 'About', href: '#about' }, { label: 'Our Teachers', href: '#about' }, { label: 'Contact', href: '#contact' }] },
  { title: 'Legal', links: [{ label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
]

function header(navLinks: { label: string; href: string }[]) {
  return c('Header', {
    logo: '', logoText: LOGO, navLinks,
    ctaLabel: 'Book Free Lesson', ctaHref: '/courses',
    showLogin: true, sticky: true, transparent: false,
  })
}

function footer() {
  return c('Footer', {
    description: 'Learn to play the music you love. Step-by-step courses and live lessons for every instrument and level.',
    columns: FOOTER_COLUMNS,
    socialLinks: [{ platform: 'YouTube', url: '#' }, { platform: 'Instagram', url: '#' }, { platform: 'Spotify', url: '#' }],
    copyright: '© 2026 Crescendo Music Academy. All rights reserved.',
  })
}

const homeTemplate: PuckTemplate = {
  name: 'Music Academy — Home',
  description: 'Landing page for music schools and online instrument or vocal teachers.',
  category: 'music',
  sort_order: 40,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      header([
        { label: 'Courses', href: '/courses' },
        { label: 'Instruments', href: '#instruments' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'About', href: '#about' },
        { label: 'FAQ', href: '#faq' },
      ]),
      c('HeroBlock', {
        title: 'Play the Music You Love',
        subtitle: 'Step-by-step courses and live lessons for guitar, piano, voice, and more. Go from your first note to your first song — faster than you think.',
        primaryCtaLabel: 'Book a Free Lesson',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'Explore Instruments',
        secondaryCtaHref: '#instruments',
        backgroundImage: '', alignment: 'center', overlayOpacity: 60, minHeight: '520px',
      }),
      c('StatsCounter', {
        items: [
          { value: '18,000', label: 'Students', prefix: '', suffix: '+' },
          { value: '10', label: 'Instruments', prefix: '', suffix: '+' },
          { value: '90', label: 'Pro Teachers', prefix: '', suffix: '+' },
          { value: '4.9', label: 'Student Rating', prefix: '', suffix: '/5' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'Why Learn With Us',
        subtitle: 'Everything you need to make real musical progress.',
        items: [
          { icon: '🎸', title: 'Learn by Playing', description: 'Play real songs from your first lesson. We teach through music you actually want to play.' },
          { icon: '🎹', title: 'Step-by-Step Path', description: 'Clear lesson sequences take you from absolute beginner to confident musician.' },
          { icon: '🎤', title: 'Live Feedback', description: 'Book live lessons with pro teachers who correct your technique and answer questions.' },
          { icon: '🎧', title: 'Play Along', description: 'Practice with backing tracks, slow-downs, and interactive sheet music.' },
          { icon: '⏱️', title: 'Learn at Your Pace', description: 'Self-paced courses you can replay anytime, on any device.' },
          { icon: '🏆', title: 'Track Your Growth', description: 'Hit milestones, earn certificates, and watch your skills build week by week.' },
        ],
        columns: '3',
      }),
      c('FeaturesGrid', {
        title: 'Choose Your Instrument',
        subtitle: 'Pick where you want to start — or learn several.',
        items: [
          { icon: '🎸', title: 'Guitar', description: 'Acoustic and electric. Chords, riffs, fingerstyle, and full songs.' },
          { icon: '🎹', title: 'Piano & Keys', description: 'Read music, play by ear, and master classical to modern pop.' },
          { icon: '🎤', title: 'Voice', description: 'Build range, control, and confidence with proven vocal technique.' },
          { icon: '🥁', title: 'Drums', description: 'Groove, timing, and fills across rock, funk, and beyond.' },
        ],
        columns: '4',
      }),
      c('CourseGrid', {
        title: 'Popular Courses',
        subtitle: 'Start with our most popular courses, chosen by thousands of students.',
        maxItems: 6, columns: '3', showPrice: true, showDescription: true,
      }),
      c('PricingTable', {
        title: 'Plans for Every Musician',
        subtitle: 'Self-paced or live lessons. Cancel anytime.',
        items: [
          { name: 'Self-Paced', price: '$15', period: '/month', description: 'Learn on your own time', features: 'All course library\nPlay-along tracks\nInteractive sheet music\nProgress tracking\nCertificates', highlighted: false, ctaLabel: 'Start Learning', ctaHref: '/courses' },
          { name: 'Premium', price: '$39', period: '/month', description: 'Courses + live lessons', features: 'Everything in Self-Paced\n2 live lessons per month\nPersonalized practice plan\nTechnique feedback\nPriority support', highlighted: true, ctaLabel: 'Go Premium', ctaHref: '#' },
          { name: 'Private', price: '$35', period: '/lesson', description: 'One-on-one coaching', features: 'Private lessons with a pro\nTailored to your goals\nFlexible scheduling\nRecorded sessions\nAny instrument or level', highlighted: false, ctaLabel: 'Book a Lesson', ctaHref: '#contact' },
        ],
      }),
      c('TestimonialGrid', {
        title: 'From Our Students',
        subtitle: 'Real progress from real musicians.',
        items: [
          { name: 'Olivia M.', role: 'Guitar student', quote: 'I always thought I was tone deaf. Three months later I am playing full songs at family gatherings. The play-along approach just works.', rating: 5 },
          { name: 'Raj P.', role: 'Piano student', quote: 'The step-by-step path kept me from giving up. Live feedback fixed bad habits I did not even know I had.', rating: 5 },
          { name: 'Grace K.', role: 'Voice student', quote: 'My range and confidence have grown so much. I finally sang in front of people — and loved it.', rating: 5 },
        ],
      }),
      c('FaqAccordion', {
        title: 'Common Questions',
        subtitle: '',
        items: [
          { question: 'I have never played before. Can I start here?', answer: 'Yes! Our beginner courses assume zero experience. You will learn how to hold the instrument, read along, and play your first notes right away.' },
          { question: 'Do I need my own instrument?', answer: 'Yes, you will need access to your instrument to practice. We offer buying guides for affordable starter options.' },
          { question: 'How quickly will I learn a song?', answer: 'Most beginners play a recognizable song within their first two weeks of regular practice.' },
          { question: 'Are live lessons available for my instrument?', answer: 'We offer live lessons for guitar, piano, voice, drums, bass, ukulele, and more. Check the course page for availability.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Your First Song Is Waiting',
        subtitle: 'Book a free lesson and start playing the music you love today.',
        primaryCtaLabel: 'Book Free Lesson',
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
  name: 'Music Academy — About',
  description: 'About page for a music academy: mission, approach, and teachers.',
  category: 'music',
  sort_order: 41,
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
        title: 'Music Belongs to Everyone',
        subtitle: 'We built Crescendo because learning an instrument should be joyful, not intimidating — and you should be playing real music from the very first lesson.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '400px',
      }),
      c('TextBlock', {
        content: 'Too many people quit an instrument in the first month — buried in boring exercises before they ever play a song they love. We knew there was a better way.\n\nCrescendo teaches through real music. Every course is built around songs, every lesson gives you something you can actually play, and every student can book live feedback from a professional teacher. Since 2018 we have helped over 18,000 students pick up guitars, sit at pianos, and find their voice. Whether you are seven or seventy, a total beginner or returning after years away, there is a place for you here.',
        alignment: 'center', color: '', maxWidth: '768px', fontSize: '1.125rem',
      }),
      c('StatsCounter', {
        items: [
          { value: '18,000', label: 'Students', prefix: '', suffix: '+' },
          { value: '10', label: 'Instruments', prefix: '', suffix: '+' },
          { value: '45', label: 'Countries', prefix: '', suffix: '+' },
          { value: '2018', label: 'Founded', prefix: '', suffix: '' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'Our Approach',
        subtitle: 'What makes learning with us different.',
        items: [
          { icon: '🎶', title: 'Songs First', description: 'You learn theory and technique through real music — not endless scales in isolation.' },
          { icon: '🧑‍🏫', title: 'Pro Teachers', description: 'Every live lesson is with a working, performing musician who knows how to teach.' },
          { icon: '🪜', title: 'Clear Progression', description: 'Structured paths mean you always know your next step and never feel lost.' },
          { icon: '🎉', title: 'Joyful Practice', description: 'We make practice something you look forward to, with play-alongs and quick wins.' },
        ],
        columns: '2',
      }),
      c('TeamGrid', {
        title: 'Meet Your Teachers',
        subtitle: 'Performing musicians who love to teach.',
        members: [
          { name: 'Nina Alvarez', role: 'Founder & Guitar', bio: 'Touring guitarist turned educator with 15 years of teaching experience.', avatar: '' },
          { name: 'David Okafor', role: 'Piano & Theory', bio: 'Conservatory-trained pianist who makes music theory finally make sense.', avatar: '' },
          { name: 'Mia Sørensen', role: 'Voice', bio: 'Professional vocalist specializing in technique, range, and stage confidence.', avatar: '' },
          { name: 'Leo Bianchi', role: 'Drums & Rhythm', bio: 'Session drummer who has played hundreds of shows across every genre.', avatar: '' },
        ],
      }),
      c('CtaBlock', {
        title: 'Start Making Music Today',
        subtitle: 'Book a free lesson and discover how good it feels to play.',
        primaryCtaLabel: 'Book Free Lesson',
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
  name: 'Music Academy — FAQ',
  description: 'FAQ page for a music academy covering instruments, lessons, pricing, and equipment.',
  category: 'music',
  sort_order: 42,
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
        subtitle: 'Everything you need to know about lessons, instruments, and pricing.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '300px',
      }),
      c('FaqAccordion', {
        title: 'Getting Started',
        subtitle: '',
        items: [
          { question: 'Do I need any musical experience?', answer: 'None at all. Our beginner courses start from the very basics — how to hold your instrument, read along, and play your first notes.' },
          { question: 'Which instruments can I learn?', answer: 'Guitar, piano, voice, drums, bass, ukulele, violin, and more. New instruments and courses are added regularly.' },
          { question: 'Do I need my own instrument?', answer: 'Yes — you will need access to your instrument to practice. We provide buying guides for affordable, quality starter options.' },
          { question: 'How long until I can play a song?', answer: 'Most beginners play a recognizable song within two weeks of regular practice. Quick wins keep you motivated from the start.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Lessons & Practice',
        subtitle: '',
        items: [
          { question: 'Are lessons live or self-paced?', answer: 'Both. Self-paced courses are available 24/7, and Premium and Private members can book live lessons with professional teachers.' },
          { question: 'How do live lessons work?', answer: 'You book a time slot, join a video call with your teacher, and get real-time feedback on your playing and technique. Sessions can be recorded for review.' },
          { question: 'How much should I practice?', answer: 'Even 15–20 minutes a day makes a big difference. Our practice plans help you build a consistent, enjoyable routine.' },
          { question: 'Can I learn more than one instrument?', answer: 'Yes! Your membership gives you access to courses across all instruments, so you can explore as many as you like.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Pricing & Plans',
        subtitle: '',
        items: [
          { question: 'How much does it cost?', answer: 'Self-Paced is $15/month, Premium (courses + live lessons) is $39/month, and Private 1-on-1 lessons are $35 each.' },
          { question: 'Is there a free lesson?', answer: 'Yes. You can book a free introductory lesson to experience our teaching style before choosing a plan.' },
          { question: 'Can I cancel anytime?', answer: 'Absolutely. There are no contracts. Cancel with one click and keep access until your billing period ends.' },
          { question: 'Do you offer family or group plans?', answer: 'We do. Reach out for family memberships and discounts for music schools or community groups.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Still Have Questions?',
        subtitle: 'Our team is happy to help you find the right instrument and plan.',
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
  name: 'Music Academy — Contact',
  description: 'Contact page for a music academy with form and quick answers.',
  category: 'music',
  sort_order: 43,
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
        subtitle: 'Questions about instruments, live lessons, or plans? We would love to help you start playing.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '300px',
      }),
      c('ContactForm', {
        title: 'Send Us a Message',
        subtitle: 'Tell us what you want to play and your experience level — we will point you to the perfect course.',
        email: 'hello@crescendo.com',
        showPhone: false, showMessage: true,
      }),
      c('FaqAccordion', {
        title: 'Quick Answers',
        subtitle: '',
        items: [
          { question: 'How do I book my free lesson?', answer: 'Click "Book Free Lesson" on any page, pick your instrument, and choose an available time. We will confirm by email.' },
          { question: 'Can I take private lessons only?', answer: 'Yes. Private 1-on-1 lessons are available for every instrument and level, scheduled around your availability.' },
          { question: 'Do you teach children?', answer: 'We do. Many of our courses and teachers specialize in young learners, with parent-friendly progress updates.' },
        ],
      }),
      footer(),
    ],
    zones: {},
  },
}

export const musicAcademyTemplates: PuckTemplate[] = [
  homeTemplate,
  aboutTemplate,
  faqTemplate,
  contactTemplate,
]
