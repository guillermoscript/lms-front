/**
 * Templates and section presets as AI assets (design §5, critique D4/I).
 *
 * `PAGE_TEMPLATES` is generated from `lib/puck/templates/*` (never hand-edited). The AI's
 * `apply_template`, MCP `template_id` and the human picker all instantiate through here, so
 * binding substitution and the fresh-id clone (zones re-keyed) behave the same everywhere.
 *
 * Presets are multi-block snippets lifted from the templates ("hero + social proof",
 * "pricing + FAQ") for `insert_preset`.
 */
import { subtreeToAddOps } from './apply-ops'
import { cloneWithFreshIds, substituteBindings, type TemplateBindings } from './bindings'
import { newBlockId, type IdFactory } from './ids'
import { ROOT_ZONE, type AddOp, type PageOp, type Zone } from './ops'
import { childZoneKeys, getZone } from './tree'
import type { PageData, PageItem, PageTemplate } from './types'
import { PAGE_TEMPLATES } from './generated/templates.generated'

export { PAGE_TEMPLATES }

const BY_ID = /* @__PURE__ */ new Map(PAGE_TEMPLATES.map((t) => [t.id, t]))

export function getTemplate(id: string): PageTemplate | undefined {
  return BY_ID.get(id)
}

export interface TemplateSummary {
  id: string
  name: string
  description: string
  pageType: string
  category: string
  blocks: string[]
}

/** Templates without their page data, ordered like the picker. */
export function listTemplates(filter: { pageType?: string } = {}): TemplateSummary[] {
  return [...PAGE_TEMPLATES]
    .filter((t) => !filter.pageType || t.pageType === filter.pageType || t.pageType === 'all')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id, name, description, pageType, category, blocks }) => ({ id, name, description, pageType, category, blocks }))
}

/** One line per template for a system prompt: `id (pageType): name`. Sequences live behind list_templates. */
export function formatTemplateList(): string {
  return listTemplates()
    .map((t) => `${t.id} (${t.pageType}): ${t.description}`)
    .join('\n')
}

export interface InstantiateOptions {
  bindings?: TemplateBindings
  idFactory?: IdFactory
}

function resolveTemplate(template: PageTemplate | string): PageTemplate {
  const t = typeof template === 'string' ? getTemplate(template) : template
  if (!t) throw new Error(`Unknown template "${String(template)}"`)
  return t
}

/** A ready-to-save page: fresh ids everywhere, zones re-keyed, bindings substituted. */
export function instantiateTemplate(template: PageTemplate | string, opts: InstantiateOptions = {}): PageData {
  return cloneWithFreshIds(resolveTemplate(template).puck_data, { idFactory: opts.idFactory, bindings: opts.bindings ?? {} })
}

/**
 * The ops that build a template on the live page: `reset` (keeping the template's root
 * props), then one `add` per block, parents before their DropZone children.
 */
export function templateToOps(template: PageTemplate | string, opts: InstantiateOptions = {}): PageOp[] {
  const data = substituteBindings(resolveTemplate(template).puck_data, opts.bindings ?? {})
  const { ops } = subtreeToAddOps(data, data.content, { zone: ROOT_ZONE, index: 0 }, opts.idFactory ?? newBlockId)
  return [{ op: 'reset', root: { ...(data.root?.props ?? {}) } }, ...ops]
}

// ── Section presets ────────────────────────────────────────────────────────────────────

export interface SectionPreset {
  id: string
  name: string
  description: string
  /** The template the blocks are lifted from. */
  templateId: string
  /** Block types, taken in order (each one the next occurrence after the previous). */
  blocks: string[]
}

export const PRESETS: readonly SectionPreset[] = [
  {
    id: 'hero-social-proof',
    name: 'Hero + social proof',
    description: 'Opening hero followed by a ratings/proof strip.',
    templateId: 'business-coaching-home',
    blocks: ['HeroBlock', 'SocialProof'],
  },
  {
    id: 'hero-stats',
    name: 'Hero + stats',
    description: 'Opening hero followed by a row of statistics.',
    templateId: 'code-school-home',
    blocks: ['HeroBlock', 'StatsCounter'],
  },
  {
    id: 'features-courses',
    name: 'Features + courses',
    description: 'Benefits grid followed by the course grid.',
    templateId: 'school-home',
    blocks: ['FeaturesGrid', 'CourseGrid'],
  },
  {
    id: 'stats-courses',
    name: 'Stats + courses',
    description: 'Live statistics band followed by the course grid.',
    templateId: 'free-course-school',
    blocks: ['StatsBand', 'CourseGrid'],
  },
  {
    id: 'course-enroll',
    name: 'Courses + enroll band',
    description: 'Course grid followed by a single-course enroll band.',
    templateId: 'free-course-school',
    blocks: ['CourseGrid', 'EnrollCta'],
  },
  {
    id: 'pricing-faq',
    name: 'Pricing + FAQ',
    description: 'Pricing plans followed by an FAQ.',
    templateId: 'code-school-home',
    blocks: ['PricingTable', 'FaqAccordion'],
  },
  {
    id: 'testimonials-cta',
    name: 'Testimonials + CTA',
    description: 'Testimonials followed by a call to action.',
    templateId: 'school-home',
    blocks: ['TestimonialGrid', 'CtaBlock'],
  },
  {
    id: 'faq-cta',
    name: 'FAQ + CTA',
    description: 'FAQ followed by a closing call to action.',
    templateId: 'minimal',
    blocks: ['FaqAccordion', 'CtaBlock'],
  },
  {
    id: 'about-story',
    name: 'Story + stats',
    description: 'A story paragraph followed by statistics.',
    templateId: 'about',
    blocks: ['TextBlock', 'StatsCounter'],
  },
  {
    id: 'contact-faq',
    name: 'Contact + FAQ',
    description: 'Contact form followed by an FAQ.',
    templateId: 'contact',
    blocks: ['ContactForm', 'FaqAccordion'],
  },
]

export function getPreset(id: string): SectionPreset | undefined {
  return PRESETS.find((p) => p.id === id)
}

/** The preset's source blocks (with their DropZone children) from its template. */
function presetSource(preset: SectionPreset): { data: PageData; items: PageItem[] } {
  const template = resolveTemplate(preset.templateId)
  const items: PageItem[] = []
  let from = 0
  for (const type of preset.blocks) {
    const i = template.puck_data.content.findIndex((item, idx) => idx >= from && item.type === type)
    if (i < 0) throw new Error(`Preset "${preset.id}": no ${type} in template "${preset.templateId}"`)
    items.push(template.puck_data.content[i])
    from = i + 1
  }
  return { data: template.puck_data, items }
}

/**
 * A preset's blocks with fresh ids and bindings substituted: `items` go into the target zone,
 * `zones` holds their DropZone children keyed onto the new ids.
 */
export function instantiatePreset(
  preset: SectionPreset | string,
  opts: InstantiateOptions = {}
): { items: PageItem[]; zones: Record<string, PageItem[]> } {
  const p = typeof preset === 'string' ? getPreset(preset) : preset
  if (!p) throw new Error(`Unknown preset "${String(preset)}"`)
  const { data, items } = presetSource(p)
  const sub: PageData = { root: { props: {} }, content: items, zones: {} }
  // Carry the DropZone children of the picked blocks (recursively).
  const stack = items.map((i) => i.props.id)
  while (stack.length) {
    const id = stack.pop()!
    for (const z of childZoneKeys(data, id)) {
      const children = getZone(data, z) ?? []
      sub.zones![z] = children
      stack.push(...children.map((c) => c.props.id))
    }
  }
  const fresh = cloneWithFreshIds(sub, { idFactory: opts.idFactory, bindings: opts.bindings ?? {} })
  return { items: fresh.content, zones: fresh.zones ?? {} }
}

/** `add` ops that insert a preset at `zone` (default: the root zone) / `index`. */
export function presetToOps(
  preset: SectionPreset | string,
  target: { zone?: Zone; index: number },
  opts: InstantiateOptions = {}
): AddOp[] {
  const p = typeof preset === 'string' ? getPreset(preset) : preset
  if (!p) throw new Error(`Unknown preset "${String(preset)}"`)
  const { data, items } = presetSource(p)
  const substituted = substituteBindings({ data, items }, opts.bindings ?? {})
  return subtreeToAddOps(
    substituted.data,
    substituted.items,
    { zone: target.zone ?? ROOT_ZONE, index: target.index },
    opts.idFactory ?? newBlockId
  ).ops
}
