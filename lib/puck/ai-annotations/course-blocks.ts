/**
 * AI annotations for the data-bound course/product blocks (Page Architect WP3).
 *
 * These blocks store ids only; every fact (title, price, lessons, author,
 * reviews) renders from the school's live data. The model sets the binding and
 * writes copy fields only. A missing or draft binding renders nothing publicly.
 * Merged over base.ts by index.ts (EnrollCta / PricingTable / TestimonialGrid
 * gain fields here). Pure data only; keep it short (prompt-doc budget).
 */
import type { AiAnnotations } from './types'

const FACTS = 'Facts come from the course; write no prices, counts or names.'

export const COURSE_BLOCK_ANNOTATIONS: AiAnnotations = {
  CourseHero: {
    instructions: `Hero for one course page: title, cover, price, rating, instructor. ${FACTS}`,
    fields: {
      courseId: { ref: 'course', required: true },
      titleOverride: { instructions: 'Usually empty: the course title shows.' },
      subtitleOverride: { instructions: 'Optional sharper pitch; empty shows the description.' },
    },
  },
  CourseCurriculum: {
    instructions: "The course's real lesson list with free-preview links.",
    fields: { courseId: { ref: 'course', required: true } },
  },
  CourseOutcomes: {
    instructions: "What you'll learn. The course's objectives win; items are the fallback.",
    fields: {
      courseId: { ref: 'course' },
      'items.text': { instructions: 'One concrete skill per item, from get_course.' },
    },
  },
  CoursePricingCard: {
    instructions: 'Price card for one course or product (productId wins). Price is live.',
    fields: {
      courseId: { ref: 'course' },
      productId: { ref: 'product' },
      'features.text': { instructions: 'Only benefits the school stated.' },
      guarantee: { instructions: 'Empty unless the user stated a guarantee.' },
    },
  },
  ProductGrid: {
    instructions: 'Cards for active products/bundles. Empty productIds shows the newest.',
    fields: { productIds: { ref: 'productList' } },
  },
  InstructorCard: {
    instructions: "The course author's real name, photo and bio. Never write credentials.",
    fields: {
      courseId: { ref: 'course' },
      teacherUserId: { instructions: 'Leave empty; use source "course" with courseId.' },
    },
  },
  EnrollCta: {
    instructions: 'Single-course enroll band; the label shows the price or "free".',
    fields: { courseId: { ref: 'course' } },
  },
  PricingTable: {
    instructions: "The school's real plans. planIds pins a subset; empty shows all.",
    fields: { planIds: { ref: 'planList' } },
  },
  TestimonialGrid: {
    instructions: 'Real reviews (source "live"). "manual" only for quotes the user gave.',
    fields: {
      courseId: { ref: 'course' },
      source: { instructions: 'Use "live" unless the user supplied quotes.' },
    },
  },
}

/** camelCase alias for callers that expect it. */
export const courseBlockAnnotations = COURSE_BLOCK_ANNOTATIONS
