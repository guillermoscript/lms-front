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

export interface PuckTemplate {
  /** Stable slug: `apply_template` / MCP `template_id` address templates by it. */
  id: string
  name: string
  description: string
  category: string
  puck_data: Data
  sort_order: number
  pageType: string
}

// LMS component types that use section spacing — these get the shared
// spacing defaults injected so vertical templates render with consistent
// vertical rhythm without repeating the spacing props on every block.
const SPACED_COMPONENTS = new Set([
  'FeaturesGrid', 'CourseGrid', 'TestimonialGrid', 'CtaBlock',
  'PricingTable', 'FaqAccordion', 'StatsCounter', 'ContactForm',
  'LogoCloud', 'Banner', 'TeamGrid', 'ImageGallery', 'SocialProof',
  'StatsBand', 'AnimatedStats', 'CtaBanner', 'EnrollCta', 'CatalogBrowser',
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
