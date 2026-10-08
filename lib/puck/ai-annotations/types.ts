/**
 * The shape of the AI annotation side-map (Page Architect, design §3.4 + critique G).
 *
 * Puck 0.20.2 field configs have no `ai` key, so the guidance the model needs lives here,
 * keyed by component name. `scripts/gen-puck-fields-manifest.ts` folds it into
 * `packages/core/src/page-builder/generated/manifest.generated.ts`.
 *
 * PURE DATA: no React, no Puck, no imports beyond types. The codegen script and the
 * server-side catalog read it.
 *
 * The special key `'*'` holds the SHARED fields (section spacing + style tokens) that many
 * blocks spread in. The catalog describes them ONCE in the prompt doc instead of once per
 * block, so `'*'.fields` lists every key that counts as a shared style field.
 */

/** A field whose value must be one (or a list) of the tenant's own ids. */
export type AiFieldRef = 'course' | 'product' | 'plan' | 'courseList' | 'productList' | 'planList'

export interface AiFieldAnnotation {
  /** Guidance for this one field. */
  instructions?: string
  /** The model must set it on `add_block`. */
  required?: boolean
  /** `false` keeps a text field out of token streaming (it lands on completion). */
  stream?: boolean
  /** The value is (a list of) this tenant's ids, validated server side. */
  ref?: AiFieldRef
  /** `embed`: a video link or a pasted `<iframe>` snippet (validated as such, never as a plain link). */
  urlKind?: 'embed'
}

export interface AiComponentAnnotation {
  /** When and how the model should use the block (one or two sentences). */
  instructions: string
  /** Keep the block out of the AI catalog (structural/primitive blocks for humans). */
  exclude?: boolean
  /** Per-field guidance, keyed by field name (`items.title` for an array sub-field). */
  fields?: Record<string, AiFieldAnnotation>
  /**
   * The DropZone names the block renders (`col-*` = `col-` + a number). A block without
   * them takes no children: ops into `<id>:<zone>` are refused.
   */
  zones?: string[]
}

/** `{ [ComponentName | '*']: annotation }`. */
export type AiAnnotations = Record<string, AiComponentAnnotation>
