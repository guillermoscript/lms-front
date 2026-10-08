import type { Data } from '@measured/puck'
// Deep import on purpose: the barrel pulls in the generated files, and the codegen script
// that writes them imports these templates (bindings.ts has no generated imports).
import {
  cloneWithFreshIds,
  type TemplateBindings,
} from '@lms/core/src/page-builder/bindings'
import type { PageData } from '@lms/core/src/page-builder/types'
import { sectionSpacingDefaults } from '../utils/section-spacing'

export type { TemplateBindings }

/**
 * What a template is for. Mirrors the picker's page-type step: `home` is `/`, the rest live
 * under `/p/<slug>`. `course` and `product` templates are bound to one course / product
 * (`{{courseId}}` / `{{productId}}`), so the picker asks for it; `all` shows under every type.
 */
export type PageType =
  | 'all'
  | 'home'
  | 'about'
  | 'contact'
  | 'faq'
  | 'terms'
  | 'events'
  | 'course'
  | 'product'
  | 'pricing'

export interface PuckTemplate {
  /** Stable slug: `apply_template` / MCP `template_id` address templates by it. */
  id: string
  name: string
  description: string
  category: string
  puck_data: Data
  sort_order: number
  pageType: PageType
}

// LMS component types that use section spacing — these get the shared
// spacing defaults injected so vertical templates render with consistent
// vertical rhythm without repeating the spacing props on every block.
const SPACED_COMPONENTS = new Set([
  'FeaturesGrid', 'CourseGrid', 'TestimonialGrid', 'CtaBlock',
  'PricingTable', 'FaqAccordion', 'StatsCounter', 'ContactForm',
  // SocialProof is NOT spaced: it has no section fields (a strict validator rejects them).
  'LogoCloud', 'Banner', 'TeamGrid', 'ImageGallery',
  'StatsBand', 'AnimatedStats', 'CtaBanner', 'EnrollCta', 'CatalogBrowser',
  // Data-bound course blocks (WP3) and FaqSplit share the same section layer.
  'FaqSplit', 'CourseHero', 'CourseCurriculum', 'CourseOutcomes', 'CoursePricingCard',
  'ProductGrid', 'InstructorCard',
])

// Module-level counter for stable, unique build-time IDs. Real per-instance
// IDs are regenerated when a template is applied (see deepCloneWithFreshIds).
let idCounter = 0

/** Build a Puck content node with an auto-generated id + spacing defaults. */
export function c(type: string, props: Record<string, unknown>, id?: string) {
  const spacing = SPACED_COMPONENTS.has(type) ? sectionSpacingDefaults : {}
  return { type, props: { id: id || `${type}-tpl-${++idCounter}`, ...spacing, ...props } }
}

/**
 * Deep-clone a template's puck_data with fresh ids for every block (DropZone keys re-keyed
 * onto the new parents) and its binding tokens (`{{schoolName}}`, `{{year}}`, `{{logoUrl}}`,
 * `{{courseId}}`, `{{productId}}`) substituted; unbound tokens fall back to neutral values.
 * Delegates to `cloneWithFreshIds` in `@lms/core`.
 */
export function deepCloneWithFreshIds(data: Data, bindings?: TemplateBindings): Data {
  return cloneWithFreshIds(data as unknown as PageData, { bindings: bindings ?? {} }) as unknown as Data
}

/** Which entity a template must be bound to before it is useful. */
export interface TemplateBindingNeeds {
  course: boolean
  product: boolean
}

/**
 * Whether the template's blocks carry a `{{courseId}}` / `{{productId}}` token, i.e. the
 * picker should ask for a course / product before creating the page.
 */
export function templateBindingNeeds(data: Data): TemplateBindingNeeds {
  const json = JSON.stringify(data) ?? ''
  return {
    course: /\{\{\s*courseId\s*\}\}/.test(json),
    product: /\{\{\s*productId\s*\}\}/.test(json),
  }
}
