/**
 * Page Architect edit tools (design §3.5 "Edit tools", critique B3/B4/C7/E4/I).
 *
 * Every tool runs on the SERVER: it validates the model's input against the strict block
 * catalog and this school's ids, applies the resulting ops to the shadow page synchronously
 * (no `await` before the mutation, so a later call always sees the earlier one), and sends
 * each op to the editor as a transient `data-page-op` part. The editor applies the same ops
 * with Puck `dispatch`, so the shadow and the editor stay in step; `get_page` reads the
 * shadow, which therefore includes the admin's unsaved edits and every op of this turn.
 *
 * `add_block` also streams: `onInputStart`/`onInputDelta` feed an `AddBlockStream`
 * (partial-stream.ts) that places a provisional block and streams its text; `execute` then
 * either finalises it with one validated `update{props}` or removes it and returns the errors.
 *
 * Destructive calls go through AI SDK tool approval (`toolApproval`): `apply_template` on a
 * non-empty page, and `remove_block` once a turn would remove 3+ blocks. The SDK decides
 * approval for every call of a step as it arrives but runs the executes only at the end of
 * the step, so the approval functions keep their own tally (a step of five parallel
 * `remove_block` calls must not all see an untouched page).
 */
import { tool, type ToolApprovalStatus } from 'ai'
import { z } from 'zod'
import {
  PAGE_LIMITS,
  PRESETS,
  ROOT_ZONE,
  applyOpInPlace,
  descendantIds,
  emptyPage,
  expandDuplicate,
  findNode,
  formatOutline,
  getPreset,
  getTemplate,
  getZone,
  listTemplates,
  newBlockId,
  normalizeId,
  pageCatalog,
  presetToOps,
  templateToOps,
  unknownRefIds,
  zoneIsAddressable,
  type IdFactory,
  type OpsCatalog,
  type PageCatalog,
  type PageData,
  type PageOp,
  type RefIdSets,
  type TemplateBindings,
  type ThemePreview,
} from '@lms/core'
import { KIT_THEME_IDS, isKitSwatch, isKitThemeId, normalizeKitBrand } from '@/lib/themes/kit'
import { InputStreams, type Placement, type PositionInput, type StreamTarget } from './partial-stream'

// ── Shadow page ────────────────────────────────────────────────────────────────────────

/** The server's copy of the page the editor shows, kept in step by applying every sent op. */
export class ShadowPage {
  readonly data: PageData

  constructor(
    initial: PageData | null | undefined,
    readonly catalog: PageCatalog = pageCatalog
  ) {
    const data = initial ? (JSON.parse(JSON.stringify(initial)) as PageData) : emptyPage()
    if (!Array.isArray(data.content)) data.content = []
    if (!data.root || typeof data.root !== 'object') data.root = { props: {} }
    if (!data.zones || typeof data.zones !== 'object') data.zones = {}
    this.data = data
  }

  /** Apply one op in place. Returns a warning when it was skipped, null when it applied. */
  apply(op: PageOp): string | null {
    return applyOpInPlace(this.data, op, this.catalog)
  }

  get isEmpty(): boolean {
    return this.data.content.length === 0
  }

  get topLevelCount(): number {
    return this.data.content.length
  }
}

// ── Op sink: shadow + editor, with the per-turn budgets ────────────────────────────────

export interface OpSinkOptions {
  /** Ops tools may commit per turn (design §6: 150). */
  maxOps?: number
  /** Provisional streaming ops per turn (appends are cheap but not free). */
  maxStreamOps?: number
}

export const MAX_STREAM_OPS_PER_TURN = 1500

export class OpSink {
  committed = 0
  streamed = 0
  readonly maxOps: number
  readonly maxStreamOps: number

  constructor(
    private readonly shadow: ShadowPage,
    private readonly write: (op: PageOp) => void,
    opts: OpSinkOptions = {}
  ) {
    this.maxOps = opts.maxOps ?? PAGE_LIMITS.maxOpsPerTurn
    this.maxStreamOps = opts.maxStreamOps ?? MAX_STREAM_OPS_PER_TURN
  }

  /** Can `n` more tool ops be committed this turn? */
  canCommit(n = 1): boolean {
    return this.committed + n <= this.maxOps
  }

  /**
   * Apply a tool's op to the shadow, then send it. `force` skips the budget (cleanup of a
   * provisional block). Returns a warning when it did not apply; nothing is sent then.
   */
  commit(op: PageOp, force = false): string | null {
    if (!force && !this.canCommit()) return `op budget for this turn (${this.maxOps}) is spent`
    const warning = this.shadow.apply(op)
    if (warning) return warning
    this.committed++
    this.write(op)
    return null
  }

  /** A provisional streaming op. False when refused (budget, or it did not apply). */
  stream(op: PageOp): boolean {
    if (this.streamed >= this.maxStreamOps) return false
    if (this.shadow.apply(op)) return false
    this.streamed++
    this.write(op)
    return true
  }
}

// ── Placement ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve where a block goes, ignoring `excludeId` (the block being placed). `after_id` wins
 * over `zone`/`index`; no position = the end of the zone (default the page). With a catalog,
 * a new zone must be one its parent block renders.
 */
export function resolvePlacement(
  data: PageData,
  pos: PositionInput,
  excludeId?: string,
  catalog?: OpsCatalog
): Placement | { error: string } {
  if (pos.after_id) {
    if (pos.after_id === excludeId) return { error: 'after_id cannot be the block itself' }
    const node = findNode(data, pos.after_id)
    if (!node) return { error: `after_id: no block "${pos.after_id}" on the page (call get_page)` }
    const list = (getZone(data, node.zone) ?? []).filter((i) => i.props.id !== excludeId)
    return { zone: node.zone, index: list.findIndex((i) => i.props.id === pos.after_id) + 1 }
  }
  const zone = pos.zone || ROOT_ZONE
  const accepts = catalog?.acceptsZone ? (type: string, name: string) => catalog.acceptsZone!(type, name) : undefined
  if (!zoneIsAddressable(data, zone, accepts)) return { error: `zone "${zone}" does not exist (call get_page)` }
  const list = (getZone(data, zone) ?? []).filter((i) => i.props.id !== excludeId)
  const index = pos.index === undefined ? list.length : Math.max(0, Math.min(list.length, Math.floor(pos.index)))
  return { zone, index }
}

function isError(p: Placement | { error: string }): p is { error: string } {
  return 'error' in p
}

// ── Inputs ─────────────────────────────────────────────────────────────────────────────

const looseProps = z.record(z.string(), z.unknown())

const positionShape = {
  after_id: z.string().optional().describe('Insert right after this block id (wins over index/zone).'),
  index: z.number().int().min(0).optional().describe('0-based position in the zone. Omit for the end.'),
  zone: z
    .string()
    .optional()
    .describe('"<parentId>:<zoneName>" for a nested zone. Omit for the page itself.'),
}

/** The add_block props: the `props` object, or parsed `propsJson` (provider fallback, critique B7). */
function inputProps(input: { props?: unknown; propsJson?: string }): { props: Record<string, unknown> } | { error: string } {
  if (input.props && typeof input.props === 'object' && !Array.isArray(input.props)) {
    return { props: input.props as Record<string, unknown> }
  }
  if (typeof input.propsJson === 'string' && input.propsJson.trim()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(input.propsJson)
    } catch {
      return { error: 'propsJson is not valid JSON' }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { props: parsed as Record<string, unknown> }
    return { error: 'propsJson must be a JSON object' }
  }
  return { props: {} }
}

// ── Tools ──────────────────────────────────────────────────────────────────────────────

export interface EditToolsDeps {
  shadow: ShadowPage
  sink: OpSink
  /** This school's ids (ref validation). */
  refs: RefIdSets
  /** Template binding values from the business context. */
  bindings?: Pick<TemplateBindings, 'schoolName' | 'logoUrl'>
  /** A product's linked course ids (binds a product template's course list). */
  productCourseIds?: (productId: string) => string[] | undefined
  /** The block the admin has selected (marked in get_page). */
  selectedId?: string | null
  /** Sends the transient `data-theme-preview` part (the editor previews it; nothing is saved). */
  emitThemePreview?: (preview: ThemePreview) => void
  idFactory?: IdFactory
  /** Use `propsJson: string` instead of an open `props` object in add_block (provider fallback). */
  propsMode?: 'object' | 'json'
  coalesceMs?: number
  now?: () => number
}

type Result = Record<string, unknown>

/** add_block input: `props` (default) or `propsJson` (provider fallback). */
export interface AddBlockInput extends PositionInput {
  type: string
  props?: Record<string, unknown>
  propsJson?: string
}
const fail = (errors: string[] | string): Result => ({ ok: false, errors: Array.isArray(errors) ? errors : [errors] })

/** Names of the edit tools (for labels and tests). */
export const EDIT_TOOL_NAMES = [
  'get_page',
  'list_templates',
  'apply_template',
  'insert_preset',
  'add_block',
  'update_block',
  'move_block',
  'remove_block',
  'duplicate_block',
  'set_page_meta',
  'preview_theme',
] as const

const TEMPLATE_IDS = listTemplates().map((t) => t.id) as [string, ...string[]]

/** The editor prompts templates ship in place of claims (`lib/puck/templates`). */
const PLACEHOLDER = /\bReplace with\b/

/** A turn that removes this many blocks (cascade included) needs the admin's approval. */
export const REMOVAL_APPROVAL_THRESHOLD = 3

export function createEditTools(deps: EditToolsDeps) {
  const { shadow, sink, refs } = deps
  const catalog = shadow.catalog
  const idFactory = deps.idFactory ?? newBlockId
  /** Every block id a remove_block call this turn asked for (cascade included), counted at approval AND at execute. */
  const removalIds = new Set<string>()
  /** A call that adds content was seen this turn (approval time), so the page is no longer "empty" for apply_template. */
  let pendingContent = false
  const maxTop = PAGE_LIMITS.maxTopLevelBlocks

  const target: StreamTarget = {
    catalog,
    newId: idFactory,
    resolve(position, excludeId) {
      const p = resolvePlacement(shadow.data, position, excludeId, catalog)
      return isError(p) ? null : p
    },
    locate(id) {
      const node = findNode(shadow.data, id)
      return node ? { zone: node.zone, index: node.index } : null
    },
    emit: (op) => {
      // A provisional block must not take the page past the section cap, even for a moment.
      if (op.op === 'add' && op.zone === ROOT_ZONE && shadow.topLevelCount >= maxTop) return false
      if (op.op === 'move' && op.zone === ROOT_ZONE && findNode(shadow.data, op.id)?.zone !== ROOT_ZONE && shadow.topLevelCount >= maxTop) {
        return false
      }
      return sink.stream(op)
    },
  }
  const streams = new InputStreams(target, { coalesceMs: deps.coalesceMs, now: deps.now })

  const removalSet = (id: string): string[] => (findNode(shadow.data, id) ? [id, ...descendantIds(shadow.data, id)] : [])

  const bindingsFor = (b: { courseId?: string | number; productId?: string | number } | undefined) => {
    const errors: string[] = []
    const courseId = normalizeId(b?.courseId) ?? undefined
    const productId = normalizeId(b?.productId) ?? undefined
    if (courseId && unknownRefIds(courseId, 'course', refs).length) errors.push(`courseId ${courseId} is not one of this school's courses`)
    if (productId && unknownRefIds(productId, 'product', refs).length) errors.push(`productId ${productId} is not one of this school's products`)
    const bindings: TemplateBindings = {
      ...deps.bindings,
      courseId,
      productId,
      courseIds: productId ? deps.productCourseIds?.(productId) : undefined,
    }
    return { bindings, errors }
  }

  // Key order matters (B4): the type and position stream before the props.
  const addInput = (
    deps.propsMode === 'json'
      ? z.object({
          type: z.string().describe('Block type from BLOCKS.'),
          ...positionShape,
          propsJson: z.string().describe('The block props as a JSON object string. Omit props you do not need.'),
        })
      : z.object({
          type: z.string().describe('Block type from BLOCKS.'),
          ...positionShape,
          props: looseProps.describe('Block props from BLOCKS. Omit props you do not need (defaults apply).'),
        })
  ) as unknown as z.ZodType<AddBlockInput>

  const tools = {
    get_page: tool({
      description:
        'The current page, including the admin\'s unsaved edits and your edits this turn: one line per block (index, type, [id], text). Pass id to read one block\'s full props before rewriting it.',
      inputSchema: z.object({ id: z.string().optional() }),
      execute: ({ id }): Result => {
        if (id) {
          const node = findNode(shadow.data, id)
          if (!node) return fail(`no block "${id}" on the page`)
          return { ok: true, id, type: node.item.type, zone: node.zone, index: node.index, props: node.item.props }
        }
        return {
          ok: true,
          blocks: shadow.topLevelCount,
          root: shadow.data.root?.props ?? {},
          outline: formatOutline(shadow.data, deps.selectedId),
        }
      },
    }),

    list_templates: tool({
      description: 'Templates with their block sequences. Filter by pageType (home, course, product, pricing, about…).',
      inputSchema: z.object({ pageType: z.string().optional() }),
      execute: ({ pageType }): Result => ({ ok: true, templates: listTemplates({ pageType }) }),
    }),

    apply_template: tool({
      description:
        'Replace the WHOLE page with a template (fresh ids). Use on an empty page or when the admin asks for a new page; the admin must approve it on a non-empty page. Bind courseId for course templates and productId for product templates. Then rewrite its text in the page language with update_block.',
      inputSchema: z.object({
        // An enum, not a free string: in live QA gpt-4.1-mini kept passing a PRESETS id
        // (`course-hero-outcomes`) here; the provider now refuses anything but a template id.
        templateId: z.enum(TEMPLATE_IDS).describe('A TEMPLATES id (never a PRESETS id; presets go to insert_preset).'),
        bindings: z
          .object({ courseId: z.string().optional(), productId: z.string().optional() })
          .optional(),
      }),
      execute: ({ templateId, bindings }): Result => {
        if (!getTemplate(templateId)) return fail(`unknown template "${templateId}" (see TEMPLATES or list_templates)`)
        const { bindings: b, errors } = bindingsFor(bindings)
        if (errors.length) return fail(errors)
        const ops = templateToOps(templateId, { bindings: b, idFactory })
        if (!sink.canCommit(ops.length)) return fail('not enough op budget left this turn for a template')
        const warnings: string[] = []
        for (const op of ops) {
          const w = sink.commit(op)
          if (w) warnings.push(w)
        }
        // Live QA: the model rewrote some blocks and left others, and editor prompts ("Replace
        // with…") reached the public page. Name the blocks that still hold one as a to-do list.
        const placeholders = shadow.data.content
          .filter((i) => PLACEHOLDER.test(JSON.stringify(i.props)))
          .map((i) => ({ id: i.props.id, type: i.type }))
        return {
          ok: true,
          blocks: shadow.data.content.map((i) => ({ id: i.props.id, type: i.type })),
          ...(placeholders.length
            ? {
                rewrite: placeholders,
                note: 'These blocks hold editor prompts ("Replace with…") that would show on the public page. Rewrite each with update_block in the page language, from real course facts (get_course), along with every English heading.',
              }
            : {}),
          ...(warnings.length ? { warnings } : {}),
        }
      },
    }),

    insert_preset: tool({
      description: `Insert a ready-made multi-block section. Presets: ${PRESETS.map((p) => p.id).join(', ')}.`,
      inputSchema: z.object({
        presetId: z.string(),
        ...positionShape,
        bindings: z.object({ courseId: z.string().optional() }).optional(),
      }),
      execute: ({ presetId, after_id, index, zone, bindings }): Result => {
        if (!getPreset(presetId)) return fail(`unknown preset "${presetId}". Valid: ${PRESETS.map((p) => p.id).join(', ')}`)
        const place = resolvePlacement(shadow.data, { after_id, index, zone }, undefined, catalog)
        if (isError(place)) return fail(place.error)
        const { bindings: b, errors } = bindingsFor(bindings)
        if (errors.length) return fail(errors)
        const ops = presetToOps(presetId, place, { bindings: b, idFactory })
        const topLevel = ops.filter((o) => o.zone === ROOT_ZONE).length
        if (place.zone === ROOT_ZONE && shadow.topLevelCount + topLevel > PAGE_LIMITS.maxTopLevelBlocks) {
          return fail(`the page would exceed ${PAGE_LIMITS.maxTopLevelBlocks} sections`)
        }
        if (!sink.canCommit(ops.length)) return fail('not enough op budget left this turn')
        for (const op of ops) sink.commit(op)
        return { ok: true, ids: ops.filter((o) => o.zone === place.zone).map((o) => ({ id: o.id, type: o.type })) }
      },
    }),

    add_block: tool({
      description:
        'Add one block. Props are validated against BLOCKS; ids (courseId…) must be this school\'s. Returns the new block id.',
      inputSchema: addInput,
      onInputStart: ({ toolCallId }) => {
        streams.start(toolCallId)
      },
      onInputDelta: ({ toolCallId, inputTextDelta }) => {
        streams.delta(toolCallId, inputTextDelta)
      },
      execute: (input, { toolCallId }): Result => {
        const streamed = streams.take(toolCallId)
        const provisional = streamed?.blockId ?? null
        const cleanup = () => {
          if (provisional) sink.commit({ op: 'remove', id: provisional }, true)
        }
        const raw = inputProps(input)
        if ('error' in raw) {
          cleanup()
          return fail(raw.error)
        }
        const { type } = input
        const v = catalog.validateBlock(type, raw.props, { refs, mode: 'add' })
        const place = resolvePlacement(shadow.data, input, provisional ?? undefined, catalog)
        const errors = [...v.errors]
        if (isError(place)) errors.push(place.error)
        else if (place.zone === ROOT_ZONE) {
          // The provisional block (when it sits on the page itself) is the one being placed.
          const provAt = provisional ? findNode(shadow.data, provisional) : null
          const others = shadow.topLevelCount - (provAt?.zone === ROOT_ZONE ? 1 : 0)
          if (others >= maxTop) errors.push(`the page already has ${maxTop} sections`)
        }
        if (errors.length || isError(place)) {
          cleanup()
          return fail(errors)
        }

        if (provisional && streamed?.type === type && findNode(shadow.data, provisional)) {
          const at = findNode(shadow.data, provisional)!
          if (at.zone !== place.zone || at.index !== place.index) {
            const w = sink.commit({ op: 'move', id: provisional, zone: place.zone, index: place.index })
            if (w) {
              cleanup()
              return fail(w)
            }
          }
          const w = sink.commit({ op: 'update', id: provisional, props: v.props })
          if (w) {
            cleanup()
            return fail(w)
          }
          return { ok: true, id: provisional }
        }

        cleanup()
        const id = idFactory(type)
        const w = sink.commit({ op: 'add', id, type, zone: place.zone, index: place.index, props: v.props })
        if (w) return fail(w)
        return { ok: true, id }
      },
    }),

    update_block: tool({
      description:
        'Change some props of a block (shallow merge; a list prop is replaced whole, so send the full list). Prefer this over removing and re-adding.',
      inputSchema: z.object({ id: z.string(), props: looseProps }),
      execute: ({ id, props }): Result => {
        const node = findNode(shadow.data, id)
        if (!node) return fail(`no block "${id}" on the page (call get_page)`)
        const v = catalog.validateBlock(node.item.type, props, { refs, mode: 'update' })
        if (!v.ok) return fail(v.errors)
        if (!Object.keys(v.props).length) return fail('nothing to update')
        const w = sink.commit({ op: 'update', id, props: v.props })
        return w ? fail(w) : { ok: true, id }
      },
    }),

    move_block: tool({
      description: 'Move a block to a new position (after_id, or index in a zone).',
      inputSchema: z.object({ id: z.string(), ...positionShape }),
      execute: ({ id, after_id, index, zone }): Result => {
        const node = findNode(shadow.data, id)
        if (!node) return fail(`no block "${id}" on the page`)
        const place = resolvePlacement(shadow.data, { after_id, index, zone: zone ?? (after_id ? undefined : node.zone) }, id, catalog)
        if (isError(place)) return fail(place.error)
        const w = sink.commit({ op: 'move', id, zone: place.zone, index: place.index })
        return w ? fail(w) : { ok: true, id, zone: place.zone, index: place.index }
      },
    }),

    remove_block: tool({
      description: 'Remove a block and everything nested in it.',
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }): Result => {
        const ids = removalSet(id)
        if (!ids.length) return fail(`no block "${id}" on the page`)
        const w = sink.commit({ op: 'remove', id })
        if (w) return fail(w)
        for (const i of ids) removalIds.add(i)
        return { ok: true, removed: ids.length }
      },
    }),

    duplicate_block: tool({
      description: 'Copy a block (and its nested blocks) right after itself. Returns the new id.',
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }): Result => {
        const node = findNode(shadow.data, id)
        if (!node) return fail(`no block "${id}" on the page`)
        if (node.zone === ROOT_ZONE && shadow.topLevelCount >= PAGE_LIMITS.maxTopLevelBlocks) {
          return fail(`the page already has ${PAGE_LIMITS.maxTopLevelBlocks} sections`)
        }
        const dup = expandDuplicate(shadow.data, id, idFactory)
        if (!dup) return fail(`no block "${id}" on the page`)
        if (!sink.canCommit(dup.ops.length)) return fail('not enough op budget left this turn')
        for (const op of dup.ops) sink.commit(op)
        return { ok: true, id: dup.newId }
      },
    }),

    set_page_meta: tool({
      description: 'Set the page\'s SEO settings: metaTitle (≤70 chars), metaDescription (≤160 chars), ogImage (https image URL).',
      inputSchema: z.object({
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        ogImage: z.string().optional(),
      }),
      execute: (input): Result => {
        const props = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
        if (!Object.keys(props).length) return fail('nothing to set')
        const v = catalog.validateRoot(props)
        if (!v.ok) return fail(v.errors)
        const w = sink.commit({ op: 'updateRoot', props: v.props })
        return w ? fail(w) : { ok: true }
      },
    }),

    preview_theme: tool({
      description: `Preview a school-wide theme in the editor (nothing is saved; the admin applies it). preset: ${KIT_THEME_IDS.join('|')}; primary: #RRGGBB brand colour.`,
      inputSchema: z.object({ preset: z.string(), primary: z.string().optional() }),
      execute: ({ preset, primary }): Result => {
        if (!isKitThemeId(preset)) return fail(`preset must be one of ${KIT_THEME_IDS.join(', ')}`)
        if (primary !== undefined && !/^#[0-9a-f]{6}$/i.test(primary.trim())) return fail('primary must be a #RRGGBB colour')
        const brand = normalizeKitBrand(preset, primary)
        const custom = !isKitSwatch(preset, brand)
        deps.emitThemePreview?.({ preset, primary: brand })
        return {
          ok: true,
          theme: preset,
          brand,
          note: custom
            ? 'Previewing. A custom colour needs the custom_branding plan feature to apply; the admin applies it from the preview bar.'
            : 'Previewing. The admin applies it from the preview bar.',
        }
      },
    }),
  }

  /** Approval-time hook for a tool that adds content: never asks, only records it. */
  const notesContent = (): ToolApprovalStatus => {
    pendingContent = true
    return undefined
  }

  const toolApproval = {
    apply_template: (input?: {
      templateId?: string
      bindings?: { courseId?: string; productId?: string }
    }): ToolApprovalStatus => {
      // A call its execute refuses (unknown template, another school's id) runs straight to
      // that error: never ask the admin to approve something that cannot apply.
      if (input && (!getTemplate(input.templateId ?? '') || bindingsFor(input.bindings).errors.length)) return undefined
      const needs = !shadow.isEmpty || pendingContent
      pendingContent = true
      return needs ? { type: 'user-approval', reason: 'Replaces every block on the page' } : undefined
    },
    remove_block: (input: { id: string }): ToolApprovalStatus => {
      // Counted now, not at execute: the executes of a step run after every approval of it.
      for (const i of removalSet(input.id)) removalIds.add(i)
      return removalIds.size >= REMOVAL_APPROVAL_THRESHOLD ? { type: 'user-approval', reason: 'Removes several blocks' } : undefined
    },
    add_block: notesContent,
    insert_preset: notesContent,
    duplicate_block: notesContent,
  }

  /**
   * Remove the provisional blocks of add_block calls whose execute never ran (an invalid
   * call, a step cut off by its finish reason, an abort). Call after every step and at the end.
   */
  const sweepOrphans = (): string[] => {
    const ids = streams.abandon()
    for (const id of ids) if (findNode(shadow.data, id)) sink.commit({ op: 'remove', id }, true)
    return ids
  }

  return { tools, toolApproval, streams, sweepOrphans }
}

export type EditTools = ReturnType<typeof createEditTools>['tools']
