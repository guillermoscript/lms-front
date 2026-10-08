/**
 * Base AI annotations for the landing-page block vocabulary (Page Architect WP0).
 *
 * Seeded from the old `lib/json-render/catalog-meta.ts` descriptions, which now re-export
 * from here. Keys must match component names in `puckConfig.components`, plus `'*'` for the
 * shared section fields described once in the prompt doc. Keep instructions short: the whole
 * catalog prompt doc has a ≤6.5k-character budget (tests/unit/page-builder-catalog.test.ts).
 *
 * PURE DATA: no React, no Puck, no runtime imports.
 */
import type { AiAnnotations } from './types'

// Colour fields (`color`, `accentColor`, `backgroundColor`) need no per-block note: the
// catalog doc says once that every `*Color` field stays empty so the school theme applies.

export const BASE_ANNOTATIONS: AiAnnotations = {
  // Shared section spacing (spread into most LMS blocks by sectionSpacingFields).
  '*': {
    instructions: 'Shared section fields. Leave them unset: the defaults are tuned.',
    fields: {
      paddingY: {},
      paddingX: {},
      maxWidth: {},
      marginY: {},
    },
  },

  // ── Structural/primitive blocks: for humans composing layouts, not AI sections ──
  // `zones` must match each block's <DropZone zone=…> names (lib/puck/components/layout/).
  Section: { instructions: 'Layout wrapper.', exclude: true, zones: ['content'] },
  Container: { instructions: 'Layout wrapper.', exclude: true, zones: ['content'] },
  Columns: { instructions: 'Column layout.', exclude: true, zones: ['col-*'] },
  Grid: { instructions: 'Grid layout.', exclude: true, zones: ['cell-*'] },
  Card: { instructions: 'Card wrapper.', exclude: true, zones: ['content'] },
  Spacer: { instructions: 'Vertical space.', exclude: true },
  Divider: { instructions: 'Horizontal rule.', exclude: true },
  IconBlock: { instructions: 'A single icon.', exclude: true },
  BadgeBlock: { instructions: 'A small badge.', exclude: true },
  Navbar: { instructions: 'Bare navigation bar; use Header instead.', exclude: true },
  BreadcrumbBlock: { instructions: 'Breadcrumb trail.', exclude: true },

  // ── Primitives (one-off touches between sections) ──
  Heading: { instructions: 'Standalone heading; sections carry their own.', exclude: true },
  TextBlock: {
    instructions: 'Standalone paragraph of body text.',
  },
  Image: { instructions: 'Standalone image (https URL).' },
  ButtonBlock: { instructions: 'Standalone button; sections carry their own CTAs.', exclude: true },
  Video: {
    instructions: 'Embedded YouTube/Vimeo video (https URL).',
    fields: { url: { urlKind: 'embed' } },
  },

  // ── Marketing / LMS sections (the AI mostly uses these) ──
  HeroBlock: {
    instructions: 'Hero: headline, subtitle, up to two CTAs. Opens most pages.',
    fields: { title: { required: true } },
  },
  FeaturesGrid: {
    instructions: 'Benefits grid: emoji icon, title, description each.',
  },
  CourseGrid: {
    instructions:
      "The school's real courses; empty courseIds = latest.",
    fields: { courseIds: { ref: 'courseList' } },
  },
  PricingTable: {
    instructions: 'Plans side by side; features one per line.',
  },
  TestimonialGrid: {
    instructions: 'Testimonials the user supplied; never invent people.',
  },
  FaqAccordion: {
    instructions: 'Expandable FAQ. Full, specific answers.',
  },
  FaqSplit: { instructions: 'Two-column FAQ: heading left, questions right.' },
  StatsCounter: {
    instructions: 'Statistics row. Prefer useLiveStats; never invent numbers.',
  },
  StatsBand: { instructions: 'Statistics band. Prefer useLiveStats.' },
  AnimatedStats: { instructions: 'Count-up statistics. Prefer useLiveStats.' },
  CtaBlock: {
    instructions: 'Call to action with buttons.',
  },
  CtaBanner: { instructions: 'Closing call to action, last before the Footer.' },
  ContactForm: { instructions: 'Contact form section.' },
  LogoCloud: { instructions: 'Partner logos the user supplied.' },
  LogoMarquee: { instructions: 'Scrolling partner logos the user supplied.' },
  Banner: {
    instructions: 'Thin announcement banner near the top.',
  },
  TeamGrid: {
    instructions: 'Live teachers; "manual" only for people the user named.',
  },
  ImageGallery: { instructions: 'Gallery of images.' },
  SocialProof: { instructions: 'Ratings/counts strip. Real figures only.' },
  EnrollCta: {
    instructions: 'Single-course enroll band; empty courseId links to the catalog.',
    fields: { courseId: { ref: 'course' } },
  },
  CatalogBrowser: { instructions: "Searchable browser over all courses." },
  ShinyEyebrow: { instructions: 'Small label above a hero headline.' },
  ContentFeature: { instructions: 'Text + image, optional pull-quote.' },

  // ── Navigation ──
  Header: {
    instructions: 'Logo, nav links, CTA. First block.',
    fields: { logo: { instructions: 'Empty shows logoText.' } },
  },
  Footer: { instructions: 'Link columns and copyright. Last block.' },
}
