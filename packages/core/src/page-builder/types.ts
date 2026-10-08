/**
 * Page-builder data types: a React-free mirror of Puck 0.20.2 `Data` plus the shapes of the
 * generated manifest and templates.
 *
 * Core never imports `@measured/puck` (nor `lib/puck/config.ts`): it runs in the server
 * route, in the browser op applier and inside the standalone MCP server. Puck's `Data` is
 * structurally compatible with `PageData`, so callers cast at the boundary.
 */

/** One block on the page. `props.id` is the block's identity. */
export interface PageItem {
  type: string
  props: { id: string; [key: string]: unknown }
}

/** Puck `Data`: top-level `content`, plus DropZone children in `zones["<parentId>:<zone>"]`. */
export interface PageData {
  root: { props?: Record<string, unknown>; [key: string]: unknown }
  content: PageItem[]
  zones?: Record<string, PageItem[]>
}

// ── Manifest (generated from lib/puck/config.ts + lib/puck/ai-annotations) ──────────────

export type ManifestOptionValue = string | number | boolean

export interface ManifestField {
  type: string
  label?: string
  options?: Array<{ label?: unknown; value: ManifestOptionValue }>
  arrayFields?: Record<string, ManifestField>
  defaultItemProps?: Record<string, unknown>
}

export type AiFieldRef = 'course' | 'product' | 'plan' | 'courseList' | 'productList' | 'planList'

export interface ManifestAiField {
  instructions?: string
  required?: boolean
  stream?: boolean
  ref?: AiFieldRef
  /** `embed`: a video link or a pasted `<iframe>` snippet, not a plain link. */
  urlKind?: 'embed'
}

export interface ManifestAi {
  instructions: string
  exclude?: boolean
  fields?: Record<string, ManifestAiField>
  /** The block's DropZone names (`col-*` = `col-` + a number). None = it takes no children. */
  zones?: string[]
}

export interface ManifestEntry {
  category: string | null
  fields: Record<string, ManifestField>
  defaultProps: Record<string, unknown>
  ai?: ManifestAi
}

export interface PageBuilderManifest {
  components: Record<string, ManifestEntry>
  /** Shared section fields (spacing + style tokens), described once in the prompt doc. */
  shared: ManifestAi
  /** Page-level `root.props` fields (SEO: metaTitle, metaDescription, ogImage). */
  root?: { fields: Record<string, ManifestField>; defaultProps: Record<string, unknown> }
}

// ── Templates ────────────────────────────────────────────────────────────────────────────

export interface PageTemplate {
  /** Stable slug used by `apply_template` and MCP `template_id`. */
  id: string
  name: string
  description: string
  category: string
  pageType: string
  sortOrder: number
  /** Top-level block types in order (for the prompt and `list_templates`). */
  blocks: string[]
  puck_data: PageData
}
