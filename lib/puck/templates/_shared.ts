import type { Data } from '@measured/puck'
import { sectionSpacingDefaults } from '../utils/section-spacing'

export interface PuckTemplate {
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
])

// Module-level counter for stable, unique build-time IDs. Real per-instance
// IDs are regenerated when a template is applied (see deepCloneWithFreshIds).
let idCounter = 0

/** Build a Puck content node with an auto-generated id + spacing defaults. */
export function c(type: string, props: Record<string, unknown>, id?: string) {
  const spacing = SPACED_COMPONENTS.has(type) ? sectionSpacingDefaults : {}
  return { type, props: { id: id || `${type}-tpl-${++idCounter}`, ...spacing, ...props } }
}

/** Deep-clone a template's puck_data and assign fresh random IDs to all components. */
export function deepCloneWithFreshIds(data: Data): Data {
  const cloned = JSON.parse(JSON.stringify(data)) as Data
  for (const item of cloned.content) {
    if (item.props?.id) {
      item.props.id = `${item.type}-${Math.random().toString(36).slice(2, 10)}`
    }
  }
  for (const zoneItems of Object.values(cloned.zones || {})) {
    for (const item of zoneItems as Array<{ type: string; props: Record<string, unknown> }>) {
      if (item.props?.id) {
        item.props.id = `${item.type}-${Math.random().toString(36).slice(2, 10)}`
      }
    }
  }
  return cloned
}
