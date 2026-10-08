/**
 * The page op protocol (design §3.2, critique A1).
 *
 * Six ops that map 1:1 onto Puck reducer actions, so the same op runs as `dispatch` in the
 * editor and as `applyOps` on stored JSON. There is NO `duplicate` on the wire: Puck's
 * `duplicate` mints its own id and `replace` refuses an id change, so the server expands a
 * duplicate into explicit `add` ops (`expandDuplicate` in apply-ops.ts).
 */
import { z } from 'zod'

/** Puck's top-level zone (`rootAreaId:rootZone`). Maps to `data.content`. */
export const ROOT_ZONE = 'root:default-zone'

/** `"root:default-zone"` or `"<parentId>:<zoneName>"`. */
export type Zone = string

const record = z.record(z.string(), z.unknown())
/** `appends`: dotted/bracket path (`items[2].title`) → text tail to append. */
const appends = z.record(z.string(), z.string())

export const addOpSchema = z.object({
  op: z.literal('add'),
  id: z.string().min(1),
  type: z.string().min(1),
  zone: z.string().min(1),
  index: z.number().int().min(0),
  props: record,
})

export const updateOpSchema = z.object({
  op: z.literal('update'),
  id: z.string().min(1),
  props: record.optional(),
  appends: appends.optional(),
})

export const updateRootOpSchema = z.object({
  op: z.literal('updateRoot'),
  props: record.optional(),
  appends: appends.optional(),
})

export const moveOpSchema = z.object({
  op: z.literal('move'),
  id: z.string().min(1),
  zone: z.string().min(1),
  index: z.number().int().min(0),
})

export const removeOpSchema = z.object({
  op: z.literal('remove'),
  id: z.string().min(1),
})

export const resetOpSchema = z.object({
  op: z.literal('reset'),
  root: record.optional(),
})

export const pageOpSchema = z.discriminatedUnion('op', [
  addOpSchema,
  updateOpSchema,
  updateRootOpSchema,
  moveOpSchema,
  removeOpSchema,
  resetOpSchema,
])

export type AddOp = z.infer<typeof addOpSchema>
export type UpdateOp = z.infer<typeof updateOpSchema>
export type UpdateRootOp = z.infer<typeof updateRootOpSchema>
export type MoveOp = z.infer<typeof moveOpSchema>
export type RemoveOp = z.infer<typeof removeOpSchema>
export type ResetOp = z.infer<typeof resetOpSchema>
export type PageOp = z.infer<typeof pageOpSchema>
export type PageOpKind = PageOp['op']

export const PAGE_OP_KINDS: readonly PageOpKind[] = ['add', 'update', 'updateRoot', 'move', 'remove', 'reset']

/**
 * A live theme preview (critique E4): a kit theme id and a `#RRGGBB` brand colour. The editor
 * re-scopes the canvas's CSS variables to it; nothing is saved until the admin applies it.
 */
export interface ThemePreview {
  preset: string
  primary: string
}

/**
 * Custom data parts on the page-builder UI message stream (`data-page-op`, `data-turn-status`,
 * `data-theme-preview`).
 */
export type PageBuilderDataParts = {
  'page-op': PageOp
  'turn-status': { label: string; toolCallId?: string; error?: string }
  'theme-preview': ThemePreview
}
