import type { LandingSection, LandingPageTemplate } from './types'
import { createSection } from './section-defaults'

function makeTemplate(
  overrides: Omit<LandingPageTemplate, 'id' | 'created_at'> & { id?: string }
): Omit<LandingPageTemplate, 'id' | 'created_at'> {
  return overrides
}

// ─── Template definitions (used for seeding & client-side preview) ────────────

export const BUILT_IN_TEMPLATES: Array<Omit<LandingPageTemplate, 'id' | 'created_at'>> = [
  makeTemplate({
    name: 'Modern Academy',
    description: 'A sleek, complete layout with all essential sections.',
    thumbnail_url: null,
    category: 'education',
    sort_order: 1,
    settings: {},
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
    sections: [
      createSection('hero'),
      { ...createSection('courses'), data: { ...createSection('courses').data, layout: 'carousel' } },
      createSection('pricing'),
      createSection('testimonials'),
      createSection('faq'),
      createSection('cta'),
    ],
  }),

  makeTemplate({
    name: 'Blank',
    description: 'Start from scratch with just a hero section.',
    thumbnail_url: null,
    category: 'general',
    sort_order: 0,
    settings: {},
    sections: [createSection('hero')],
  }),
]

export function getSectionCount(sections: LandingSection[]): number {
  return sections.filter(s => s.visible).length
}
