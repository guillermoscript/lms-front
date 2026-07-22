import { c, type PuckTemplate } from './_shared'

// ─── Fitness / Wellness Studio ───────────────────────────────────────────────
// Multi-page pack for fitness coaches, yoga studios, and online wellness
// programs. Pages: Home, About, FAQ, Contact.

const LOGO = '💪 FitFlow'
const FOOTER_COLUMNS = [
  { title: 'Train', links: [{ label: 'All Programs', href: '/courses' }, { label: 'Pricing', href: '/pricing' }, { label: 'Free Class', href: '#' }] },
  { title: 'Studio', links: [{ label: 'About', href: '#about' }, { label: 'Our Coaches', href: '#about' }, { label: 'Contact', href: '#contact' }] },
  { title: 'Legal', links: [{ label: 'Terms', href: '/terms' }, { label: 'Privacy', href: '/privacy' }] },
]

function header(navLinks: { label: string; href: string }[]) {
  return c('Header', {
    logo: '', logoText: LOGO, navLinks,
    ctaLabel: 'Start Free Week', ctaHref: '/courses',
    showLogin: true, sticky: true, transparent: false,
  })
}

function footer() {
  return c('Footer', {
    description: 'Move better, feel stronger. On-demand and live workouts for every body and every level.',
    columns: FOOTER_COLUMNS,
    socialLinks: [{ platform: 'Instagram', url: '#' }, { platform: 'TikTok', url: '#' }, { platform: 'YouTube', url: '#' }],
    copyright: '© 2026 FitFlow. All rights reserved.',
  })
}

const homeTemplate: PuckTemplate = {
  name: 'Fitness Studio — Home',
  description: 'Landing page for fitness coaches, yoga studios, and online workout programs.',
  category: 'fitness',
  sort_order: 30,
  pageType: 'home',
  puck_data: {
    root: { props: {} },
    content: [
      header([
        { label: 'Programs', href: '/courses' },
        { label: 'How It Works', href: '#features' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'About', href: '#about' },
        { label: 'FAQ', href: '#faq' },
      ]),
      c('HeroBlock', {
        title: 'Stronger Every Day. On Your Schedule.',
        subtitle: 'Live and on-demand workouts led by expert coaches. Strength, yoga, HIIT, and mobility — all in one place, for every level.',
        primaryCtaLabel: 'Start Your Free Week',
        primaryCtaHref: '/courses',
        secondaryCtaLabel: 'See Programs',
        secondaryCtaHref: '#programs',
        backgroundImage: '', alignment: 'center', overlayOpacity: 60, minHeight: '520px',
      }),
      c('StatsCounter', {
        useLiveStats: true,
        items: [
          { value: '25,000', label: 'Members', prefix: '', suffix: '+' },
          { value: '600', label: 'Workouts', prefix: '', suffix: '+' },
          { value: '15', label: 'Expert Coaches', prefix: '', suffix: '' },
          { value: '4.9', label: 'App Rating', prefix: '', suffix: '/5' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'Why Train With Us',
        subtitle: 'Everything you need to build a habit that actually sticks.',
        items: [
          { icon: '🏋️', title: 'Programs for Every Level', description: 'From total beginner to advanced athlete. Follow a plan built for where you are today.' },
          { icon: '📅', title: 'Train Anytime', description: 'On-demand library plus daily live classes. Workout at 6am or 10pm — your call.' },
          { icon: '🧘', title: 'Mind & Body', description: 'Strength, HIIT, yoga, mobility, and recovery. Balance intensity with rest.' },
          { icon: '👟', title: 'No Equipment Needed', description: 'Most workouts need nothing but you and a mat. Upgrade with weights when ready.' },
          { icon: '📊', title: 'Track Your Progress', description: 'Log workouts, watch streaks grow, and celebrate every milestone.' },
          { icon: '🤝', title: 'Coaches in Your Corner', description: 'Form tips, modifications, and motivation from real coaches who care.' },
        ],
        columns: '3',
      }),
      c('FeaturesGrid', {
        title: 'Find Your Program',
        subtitle: 'Pick a path that matches your goals — or mix them all.',
        items: [
          { icon: '🔥', title: 'Fat Burn & HIIT', description: 'Short, intense sessions that torch calories and boost energy in 20–30 minutes.' },
          { icon: '💪', title: 'Strength & Tone', description: 'Progressive strength programs to build lean muscle and full-body power.' },
          { icon: '🌿', title: 'Yoga & Flexibility', description: 'Flow, stretch, and breathe. Improve mobility and melt away stress.' },
        ],
        columns: '3',
      }),
      c('CourseGrid', {
        courseIds: [],
        title: 'Popular Programs',
        subtitle: 'Start with our most popular programs, loved by thousands of members.',
        maxItems: 6, columns: '3', showPrice: true, showDescription: true,
      }),
      c('PricingTable', {
        title: 'Membership Plans',
        subtitle: 'Train as much as you want. Cancel anytime.',
        items: [
          { name: 'Monthly', price: '$19', period: '/month', description: 'Full access, no commitment', features: 'All on-demand workouts\nDaily live classes\nProgress tracking\nWorkout calendar\nCancel anytime', highlighted: false, ctaLabel: 'Start Monthly', ctaHref: '/courses' },
          { name: 'Annual', price: '$149', period: '/year', description: 'Best value — save 35%', features: 'Everything in Monthly\nPersonalized programs\nNutrition guides\n1 monthly coach check-in\nMember community', highlighted: true, ctaLabel: 'Go Annual', ctaHref: '#' },
          { name: 'Coaching', price: '$79', period: '/month', description: 'Personalized 1-on-1', features: 'Everything in Annual\nCustom training plan\nWeekly coach check-ins\nForm reviews\nDirect messaging', highlighted: false, ctaLabel: 'Get Coaching', ctaHref: '#contact' },
        ],
      }),
      c('TestimonialGrid', {
        title: 'Real Results, Real People',
        subtitle: 'See what members are achieving from home.',
        items: [
          { name: 'Jasmine R.', role: 'Lost 18 lbs', quote: 'The 25-minute workouts fit around my kids and my job. I have never been this consistent — or this strong.', rating: 5 },
          { name: 'Tom B.', role: 'Built strength', quote: 'I was intimidated by the gym. Training at home with real coaching changed everything. Down two belt sizes.', rating: 5 },
          { name: 'Priya S.', role: 'Found her flow', quote: 'The yoga and mobility classes fixed my back pain and my stress levels. I look forward to every session.', rating: 5 },
        ],
      }),
      c('FaqAccordion', {
        title: 'Common Questions',
        subtitle: '',
        items: [
          { question: 'I am a total beginner. Is this for me?', answer: 'Definitely. Every program has a beginner track with modifications, and coaches guide you through proper form every step of the way.' },
          { question: 'Do I need equipment?', answer: 'No. Most workouts use just your bodyweight and a mat. Some strength programs offer optional dumbbell variations.' },
          { question: 'How long are the workouts?', answer: 'Anywhere from 10 to 45 minutes. Filter by time, intensity, and type to find exactly what fits your day.' },
          { question: 'Can I cancel anytime?', answer: 'Yes. There are no lock-in contracts. Cancel with one click and keep access until the end of your billing period.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Your First Week Is On Us',
        subtitle: 'Join 25,000+ members getting stronger from home. No equipment, no excuses, no risk.',
        primaryCtaLabel: 'Start Free Week',
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
  name: 'Fitness Studio — About',
  description: 'About page for a fitness studio: mission, philosophy, and coaches.',
  category: 'fitness',
  sort_order: 31,
  pageType: 'about',
  puck_data: {
    root: { props: {} },
    content: [
      header([
        { label: 'Home', href: '/' },
        { label: 'Programs', href: '/courses' },
        { label: 'FAQ', href: '#faq' },
        { label: 'Contact', href: '#contact' },
      ]),
      c('HeroBlock', {
        title: 'Fitness That Fits Real Life',
        subtitle: 'We started FitFlow because getting healthy should not require a gym membership, a personal trainer budget, or perfect free time. Just press play.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '400px',
      }),
      c('TextBlock', {
        content: 'FitFlow began in a living room. Our founder, a former group-fitness instructor, watched talented coaches and motivated people kept apart by schedules, distance, and cost. So we brought the studio home.\n\nToday, 25,000+ members train with us from over 50 countries — before work, after the kids are asleep, on the road, anywhere. Our philosophy is simple: consistency beats intensity, every body is welcome, and progress is personal. We are not about punishing workouts or impossible standards. We are about showing up, feeling good, and getting a little stronger every day.',
        alignment: 'center', color: '', maxWidth: '768px', fontSize: '1.125rem',
      }),
      c('StatsCounter', {
        useLiveStats: true,
        items: [
          { value: '25,000', label: 'Members', prefix: '', suffix: '+' },
          { value: '50', label: 'Countries', prefix: '', suffix: '+' },
          { value: '1.2M', label: 'Workouts Completed', prefix: '', suffix: '' },
          { value: '2020', label: 'Founded', prefix: '', suffix: '' },
        ],
        alignment: 'center',
      }),
      c('FeaturesGrid', {
        title: 'What We Stand For',
        subtitle: 'The values behind every workout we make.',
        items: [
          { icon: '❤️', title: 'Every Body Welcome', description: 'All ages, sizes, and fitness levels. We meet you where you are — no judgment, ever.' },
          { icon: '🔁', title: 'Consistency Over Intensity', description: 'Sustainable habits beat burnout. We help you build a routine you can actually keep.' },
          { icon: '🧠', title: 'Mind & Body', description: 'True wellness includes recovery, rest, and mental health — not just sweat.' },
          { icon: '🎓', title: 'Coaches You Trust', description: 'Every coach is certified and trained to teach safe, effective movement for all levels.' },
        ],
        columns: '2',
      }),
      c('TeamGrid', {
        title: 'Meet Your Coaches',
        subtitle: 'Certified, encouraging, and genuinely in your corner.',
        members: [
          { name: 'Maya Torres', role: 'Founder & Head Coach', bio: 'Former group-fitness instructor with 12 years of experience and a passion for accessible fitness.', avatar: '' },
          { name: 'Andre Smith', role: 'Strength Coach', bio: 'NASM-certified. Specializes in progressive strength training for all levels.', avatar: '' },
          { name: 'Lena Park', role: 'Yoga & Mobility', bio: 'RYT-500 yoga teacher focused on flexibility, breath, and recovery.', avatar: '' },
          { name: 'Carlos Vega', role: 'HIIT & Conditioning', bio: 'High-energy coach who makes tough workouts feel fun and achievable.', avatar: '' },
        ],
      }),
      c('CtaBlock', {
        title: 'Train With Us This Week',
        subtitle: 'Your free week is waiting. Press play and feel the difference.',
        primaryCtaLabel: 'Start Free Week',
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
  name: 'Fitness Studio — FAQ',
  description: 'FAQ page for a fitness studio covering programs, equipment, pricing, and membership.',
  category: 'fitness',
  sort_order: 32,
  pageType: 'faq',
  puck_data: {
    root: { props: {} },
    content: [
      header([
        { label: 'Home', href: '/' },
        { label: 'Programs', href: '/courses' },
        { label: 'Pricing', href: '/pricing' },
        { label: 'Contact', href: '#contact' },
      ]),
      c('HeroBlock', {
        title: 'Frequently Asked Questions',
        subtitle: 'Everything you need to know before your first workout.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '300px',
      }),
      c('FaqAccordion', {
        title: 'Getting Started',
        subtitle: '',
        items: [
          { question: 'Is this suitable for beginners?', answer: 'Yes. Every program includes a beginner track with modifications, and our coaches walk you through proper form so you feel confident from day one.' },
          { question: 'What equipment do I need?', answer: 'For most workouts, just a mat and a bit of floor space. Some strength programs offer optional dumbbell or resistance-band variations.' },
          { question: 'How much space do I need?', answer: 'About the size of a yoga mat. All workouts are designed to fit small apartments and hotel rooms.' },
          { question: 'Do I get a personalized plan?', answer: 'Annual and Coaching members get personalized programs based on your goals, fitness level, and available time.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Workouts & Schedule',
        subtitle: '',
        items: [
          { question: 'Are classes live or on-demand?', answer: 'Both. We have a large on-demand library plus daily live classes you can join in real time with a coach.' },
          { question: 'How long are the workouts?', answer: 'From quick 10-minute sessions to full 45-minute classes. Filter by duration, intensity, and type to match your day.' },
          { question: 'What types of workouts are there?', answer: 'Strength, HIIT, yoga, mobility, low-impact, and recovery. There is something for every goal and energy level.' },
          { question: 'Can I work out if I am injured?', answer: 'We offer low-impact and recovery programs, but always consult your doctor first. Coaches can suggest modifications for common limitations.' },
        ],
      }),
      c('FaqAccordion', {
        title: 'Membership & Billing',
        subtitle: '',
        items: [
          { question: 'How much does membership cost?', answer: 'Monthly is $19, Annual is $149 (save 35%), and 1-on-1 Coaching is $79/month. All plans include full access to the workout library.' },
          { question: 'Is there a free trial?', answer: 'Yes — your first week is completely free. Explore every program and class before you pay anything.' },
          { question: 'Can I cancel anytime?', answer: 'Absolutely. No contracts, no cancellation fees. Cancel with one click and keep access until your billing period ends.' },
          { question: 'Do you offer refunds?', answer: 'We offer a 14-day money-back guarantee on paid plans. If FitFlow is not for you, contact us for a full refund.' },
        ],
      }),
      c('CtaBlock', {
        title: 'Still Have Questions?',
        subtitle: 'Reach out — our team is happy to help you get started.',
        primaryCtaLabel: 'Contact Us',
        primaryCtaHref: '#contact',
        secondaryCtaLabel: 'Browse Programs',
        secondaryCtaHref: '/courses',
        style: 'bordered',
      }),
      footer(),
    ],
    zones: {},
  },
}

const contactTemplate: PuckTemplate = {
  name: 'Fitness Studio — Contact',
  description: 'Contact page for a fitness studio with form and quick answers.',
  category: 'fitness',
  sort_order: 33,
  pageType: 'contact',
  puck_data: {
    root: { props: {} },
    content: [
      header([
        { label: 'Home', href: '/' },
        { label: 'Programs', href: '/courses' },
        { label: 'FAQ', href: '#faq' },
      ]),
      c('HeroBlock', {
        title: 'Get in Touch',
        subtitle: 'Questions about programs, coaching, or membership? We are here to help you start strong.',
        primaryCtaLabel: '', primaryCtaHref: '', secondaryCtaLabel: '', secondaryCtaHref: '',
        backgroundImage: '', alignment: 'center', overlayOpacity: 55, minHeight: '300px',
      }),
      c('ContactForm', {
        title: 'Send Us a Message',
        subtitle: 'Tell us your goals and we will recommend the right program for you.',
        email: 'hello@fitflow.com',
        showPhone: false, showMessage: true,
      }),
      c('FaqAccordion', {
        title: 'Quick Answers',
        subtitle: '',
        items: [
          { question: 'How do I start my free week?', answer: 'Click "Start Free Week" on any page and create your account. You will get full access for 7 days — no payment required upfront.' },
          { question: 'Can I get 1-on-1 coaching?', answer: 'Yes. Our Coaching plan pairs you with a dedicated coach for custom plans, weekly check-ins, and form reviews.' },
          { question: 'Do you offer corporate wellness?', answer: 'We do. Reach out for team plans with group pricing, challenges, and wellness reporting for your company.' },
        ],
      }),
      footer(),
    ],
    zones: {},
  },
}

export const fitnessStudioTemplates: PuckTemplate[] = [
  homeTemplate,
  aboutTemplate,
  faqTemplate,
  contactTemplate,
]
