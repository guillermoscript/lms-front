import type { Data, Config } from '@measured/puck'

// The Puck data stored in the DB
export type PuckData = Data

// Props types for our custom components
export interface StyleProps {
  backgroundColor?: string
  backgroundImage?: string
  backgroundGradient?: string
  overlayOpacity?: number
  paddingTop?: string
  paddingBottom?: string
  paddingLeft?: string
  paddingRight?: string
  marginTop?: string
  marginBottom?: string
  borderRadius?: string
  borderWidth?: string
  borderColor?: string
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  hideOnMobile?: boolean
  hideOnDesktop?: boolean
}

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
}

// A subscription plan (PricingTable).
export interface LandingPlan {
  id: string
  name: string
  price: number | null
  currency: string | null
  interval: string | null // 'month' | 'year' | null (one-off)
  features: string[]
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
}

// Shared metadata passed to <Puck> / <Render>, readable in a component's
// render via `puck.metadata`. Superset of LandingData plus tenant context.
export interface PuckMetadata extends Partial<LandingData> {
  tenantId?: string
}
