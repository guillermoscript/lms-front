import type { Data, Config } from '@measured/puck'

// The Puck data stored in the DB
export type PuckData = Data

// Props types for our custom components. Section style tokens (tone, align,
// anchorId, hideOn) live on the shared section layer: lib/puck/utils/section-style.ts.
export interface LinkProps {
  label: string
  href: string
}

export interface CtaProps extends LinkProps {
  variant?: 'solid' | 'outline' | 'ghost'
}

export type PuckConfig = Config

// Live tenant data resolved server-side and handed to dynamic components
// (CourseGrid, PricingTable, StatsBand, TestimonialGrid, TeamGrid, …) through
// Puck's `metadata`. Every shape below is a STABLE exposed contract — the
// resolver (lib/puck/utils/landing-data.ts) maps DB rows onto these.

// A course card (CourseGrid, CatalogBrowser, EnrollCta).
export interface LandingCourse {
  id: string
  title: string
  description: string | null
  image: string | null
  price: number | null // null = free (no active priced product)
  currency: string | null
  // 'draft' only ever reaches the editor / AI tools (includeDrafts). A draft
  // binding renders nothing publicly; the editor shows a notice instead.
  status: 'published' | 'draft'
}

// A lesson title row for CourseCurriculum. Never carries lesson content.
export interface LandingLesson {
  id: string
  title: string
  sequence: number | null
  isPreview: boolean
}

// The course author, from `profiles` (real data only — no invented credentials).
export interface LandingAuthor {
  id: string
  name: string | null
  avatar: string | null
  bio: string | null
}

// Base course fields + the extras the course blocks need. Resolved only for the
// ids a page actually references (lib/puck/utils/collect-bound-ids.ts).
export interface LandingCourseDetails extends LandingCourse {
  objectives: string[]
  lessons: LandingLesson[]
  lessonCount: number
  author: LandingAuthor | null
  rating: { avg: number | null; count: number }
  reviews: LandingTestimonial[]
  // Whether the school lets logged-out visitors open preview lessons (#799).
  previewEnabled: boolean
}

// An active product (ProductGrid, CoursePricingCard).
export interface LandingProduct {
  id: string
  name: string
  description: string | null
  image: string | null
  price: number | null
  currency: string | null
  courseIds: string[] // linked courses (product_courses), as strings
  href: string // /checkout?courseId= for a one-course product, else /products/{id}
}

// A subscription plan (PricingTable).
export interface LandingPlan {
  id: string
  name: string
  price: number | null
  currency: string | null
  interval: string | null // 'month' | 'year' | null (one-off)
  features: string[]
  description: string | null
  href: string // where the CTA sends the buyer
  highlighted: boolean
}

// Aggregate counts for the tenant (StatsBand / AnimatedStats / StatsCounter).
export interface LandingStats {
  students: number
  courses: number
  completions: number
}

// A course review (TestimonialGrid / SocialProof).
export interface LandingTestimonial {
  id: string
  name: string
  avatar: string | null
  rating: number | null
  quote: string
  courseTitle: string | null
}

// A tenant instructor (TeamGrid).
export interface LandingTeacher {
  id: string
  name: string
  avatar: string | null
  bio: string | null
}

// The full live-data bundle resolved once per page render.
export interface LandingData {
  courses: LandingCourse[]
  plans: LandingPlan[]
  stats: LandingStats
  testimonials: LandingTestimonial[]
  teachers: LandingTeacher[]
  products: LandingProduct[]
  // Keyed by course id (string). Only the ids the page references.
  courseDetails: Record<string, LandingCourseDetails>
}

// Shared metadata passed to <Puck> / <Render>, readable in a component's
// render via `puck.metadata`. Superset of LandingData plus tenant context.
export interface PuckMetadata extends Partial<LandingData> {
  tenantId?: string
}
