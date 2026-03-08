import type { LandingSection, LandingPageTemplate } from './types'
import { createSection } from './section-defaults'

function makeTemplate(
  overrides: Omit<LandingPageTemplate, 'id' | 'created_at'> & { id?: string; pageType: PageType }
): BuiltInTemplate {
  return overrides
}

// ─── Template definitions (used for seeding & client-side preview) ────────────

export type PageType = 'home' | 'about' | 'contact' | 'faq' | 'terms' | 'events' | 'all'

export interface BuiltInTemplate extends Omit<LandingPageTemplate, 'id' | 'created_at'> {
  pageType: PageType
}

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  // ─── Home / Landing page templates ──────────────────────────────────────────
  makeTemplate({
    name: 'Modern Academy',
    description: 'A sleek, complete layout with all essential sections.',
    thumbnail_url: null,
    category: 'education',
    sort_order: 1,
    settings: {},
    pageType: 'home',
    sections: [
      { ...createSection('hero'), data: { ...createSection('hero').data, title: 'Launch Your Learning Journey', subtitle: 'World-class courses from expert instructors, on your schedule.' } },
      createSection('features'),
      createSection('courses'),
      createSection('testimonials'),
      createSection('cta'),
    ],
  }),

  makeTemplate({
    name: 'Minimal',
    description: 'Clean and simple — hero, courses, FAQ, and CTA.',
    thumbnail_url: null,
    category: 'general',
    sort_order: 2,
    settings: {},
    pageType: 'home',
    sections: [
      createSection('hero'),
      createSection('courses'),
      createSection('faq'),
      createSection('cta'),
    ],
  }),

  makeTemplate({
    name: 'Bold Creator',
    description: 'Perfect for personal brands with stats and team showcase.',
    thumbnail_url: null,
    category: 'creative',
    sort_order: 3,
    settings: {},
    pageType: 'home',
    sections: [
      { ...createSection('hero'), data: { ...createSection('hero').data, alignment: 'left', title: 'Level Up Your Skills' } },
      createSection('stats'),
      createSection('courses'),
      createSection('team'),
      createSection('cta'),
    ],
  }),

  makeTemplate({
    name: 'Course Focus',
    description: 'Sales-focused layout with pricing and testimonials.',
    thumbnail_url: null,
    category: 'business',
    sort_order: 4,
    settings: {},
    pageType: 'home',
    sections: [
      createSection('hero'),
      { ...createSection('courses'), data: { ...createSection('courses').data, layout: 'carousel' } },
      createSection('pricing'),
      createSection('testimonials'),
      createSection('faq'),
      createSection('cta'),
    ],
  }),

  // ─── About page templates ──────────────────────────────────────────────────
  makeTemplate({
    name: 'About Us',
    description: 'Tell your story with team, stats, and mission.',
    thumbnail_url: null,
    category: 'general',
    sort_order: 1,
    settings: {},
    pageType: 'about',
    sections: [
      { ...createSection('hero'), data: { ...createSection('hero').data, title: 'About Us', subtitle: 'Our mission is to make quality education accessible to everyone.', ctaText: 'Meet the Team', ctaLink: '#team' } },
      { ...createSection('text'), data: { title: 'Our Story', content: 'Founded with a passion for education, we believe everyone deserves access to world-class learning. Our platform brings together expert instructors and motivated students from around the world.' } },
      createSection('stats'),
      createSection('team'),
      createSection('cta'),
    ],
  }),

  // ─── Contact page templates ────────────────────────────────────────────────
  makeTemplate({
    name: 'Contact Us',
    description: 'Simple contact page with form and info.',
    thumbnail_url: null,
    category: 'general',
    sort_order: 1,
    settings: {},
    pageType: 'contact',
    sections: [
      { ...createSection('hero'), data: { ...createSection('hero').data, title: 'Get in Touch', subtitle: 'Have a question or want to work with us? We\'d love to hear from you.', ctaText: '', ctaLink: '' } },
      { ...createSection('contact'), data: { title: 'Contact Us', subtitle: 'Send us a message and we\'ll get back to you as soon as possible.', email: 'hello@example.com', showForm: true, socialLinks: [] } },
      { ...createSection('faq'), data: { title: 'Common Questions', subtitle: 'Quick answers before you reach out.', items: [
        { question: 'How fast do you respond?', answer: 'We typically respond within 24 hours on business days.' },
        { question: 'Do you offer refunds?', answer: 'Yes, we offer a 30-day money-back guarantee on all courses.' },
        { question: 'How can I become an instructor?', answer: 'Contact us with your expertise and we\'ll guide you through the process.' },
      ] } },
    ],
  }),

  // ─── FAQ page templates ────────────────────────────────────────────────────
  makeTemplate({
    name: 'FAQ Page',
    description: 'Frequently asked questions with categories.',
    thumbnail_url: null,
    category: 'general',
    sort_order: 1,
    settings: {},
    pageType: 'faq',
    sections: [
      { ...createSection('hero'), data: { ...createSection('hero').data, title: 'Frequently Asked Questions', subtitle: 'Find answers to the most common questions about our platform.', ctaText: '', ctaLink: '' } },
      { ...createSection('faq'), data: { title: 'General', subtitle: '', items: [
        { question: 'How do I create an account?', answer: 'Click the Sign Up button and follow the steps. You can use your email or social accounts.' },
        { question: 'Is there a free trial?', answer: 'Many of our courses offer free preview lessons so you can try before you buy.' },
        { question: 'Can I access courses on mobile?', answer: 'Yes! Our platform is fully responsive and works on all devices.' },
      ] } },
      { ...createSection('faq'), data: { title: 'Payments & Billing', subtitle: '', items: [
        { question: 'What payment methods do you accept?', answer: 'We accept credit cards, debit cards, and various local payment methods.' },
        { question: 'Can I get a refund?', answer: 'Yes, we offer a 30-day money-back guarantee if you\'re not satisfied.' },
        { question: 'Do you offer discounts for teams?', answer: 'Yes! Contact us for special pricing on group enrollments.' },
      ] } },
      { ...createSection('cta'), data: { title: 'Still Have Questions?', subtitle: 'Our support team is here to help you.', ctaText: 'Contact Us', ctaLink: '/p/contact', style: 'gradient' } },
    ],
  }),

  // ─── Terms / Legal page templates ──────────────────────────────────────────
  makeTemplate({
    name: 'Terms of Service',
    description: 'Legal page with terms and conditions.',
    thumbnail_url: null,
    category: 'general',
    sort_order: 1,
    settings: {},
    pageType: 'terms',
    sections: [
      { ...createSection('hero'), data: { ...createSection('hero').data, title: 'Terms of Service', subtitle: 'Please read these terms carefully before using our platform.', ctaText: '', ctaLink: '', alignment: 'left' } },
      { ...createSection('text'), data: { title: '1. Acceptance of Terms', content: 'By accessing and using this platform, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.' } },
      { ...createSection('text'), data: { title: '2. User Accounts', content: 'You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account.' } },
      { ...createSection('text'), data: { title: '3. Course Content', content: 'All course content is protected by copyright. You may not reproduce, distribute, or create derivative works without explicit permission from the content creator.' } },
      { ...createSection('text'), data: { title: '4. Payments & Refunds', content: 'All payments are processed securely. Refund requests must be submitted within 30 days of purchase. We reserve the right to deny refund requests that violate our policies.' } },
    ],
  }),

  // ─── Events page templates ─────────────────────────────────────────────────
  makeTemplate({
    name: 'Events & Workshops',
    description: 'Showcase upcoming events and workshops.',
    thumbnail_url: null,
    category: 'general',
    sort_order: 1,
    settings: {},
    pageType: 'events',
    sections: [
      { ...createSection('hero'), data: { ...createSection('hero').data, title: 'Events & Workshops', subtitle: 'Join our live sessions, workshops, and community events.', ctaText: 'View Schedule', ctaLink: '#events' } },
      { ...createSection('features'), data: { title: 'Upcoming Events', subtitle: 'Don\'t miss out on these learning opportunities.', columns: 3, items: [
        { icon: '🎤', title: 'Live Webinar: Intro to AI', description: 'March 15, 2026 · 2:00 PM EST — A beginner-friendly session on artificial intelligence fundamentals.' },
        { icon: '💻', title: 'Coding Workshop', description: 'March 22, 2026 · 10:00 AM EST — Hands-on workshop building a full-stack app from scratch.' },
        { icon: '🎯', title: 'Career Fair', description: 'April 5, 2026 · 9:00 AM EST — Connect with hiring companies and explore new opportunities.' },
      ] } },
      { ...createSection('cta'), data: { title: 'Want to Host an Event?', subtitle: 'We partner with instructors and organizations to bring great events to our community.', ctaText: 'Get in Touch', ctaLink: '/p/contact', style: 'gradient' } },
    ],
  }),

  // ─── Blank (available for all page types) ──────────────────────────────────
  makeTemplate({
    name: 'Blank',
    description: 'Start from scratch with just a hero section.',
    thumbnail_url: null,
    category: 'general',
    sort_order: 0,
    settings: {},
    pageType: 'all',
    sections: [createSection('hero')],
  }),
]

export function getSectionCount(sections: LandingSection[]): number {
  return sections.filter(s => s.visible).length
}
