/**
 * Data-bound course / product blocks (Page Architect WP3). They store ids only
 * and resolve from the server-fetched Puck `metadata` (lib/puck/utils/landing-data.ts).
 * Registered in lib/puck/config.ts with one spread.
 */
import { CourseHero } from './course-hero'
import { CourseCurriculum } from './course-curriculum'
import { CourseOutcomes } from './course-outcomes'
import { CoursePricingCard } from './course-pricing-card'
import { ProductGrid } from './product-grid'
import { InstructorCard } from './instructor-card'

export { CourseHero, CourseCurriculum, CourseOutcomes, CoursePricingCard, ProductGrid, InstructorCard }

export const courseBlocks = {
  CourseHero,
  CourseCurriculum,
  CourseOutcomes,
  CoursePricingCard,
  ProductGrid,
  InstructorCard,
}

/** Names for the `lms` category list in config.ts. */
export const COURSE_BLOCK_NAMES = Object.keys(courseBlocks) as (keyof typeof courseBlocks)[]
