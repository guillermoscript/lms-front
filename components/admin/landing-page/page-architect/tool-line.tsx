'use client'

/**
 * One quiet line per tool call in the Page Architect chat: "Adding Course hero…" while it
 * runs (shimmering), a check when done, a warning when the server refused it.
 */
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import { Shimmer } from '@/components/ai-elements/shimmer'

export interface ToolPartLike {
  type: string
  toolName?: string
  toolCallId?: string
  state?: string
  input?: unknown
  output?: unknown
  errorText?: string
  approval?: { id: string; approved?: boolean; reason?: string }
}

/** Tools with their own label in `pageArchitect.panel.tools`. */
export const KNOWN_TOOLS = [
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
  'list_courses',
  'get_course',
  'list_products',
  'list_plans',
  'get_school_profile',
] as const

export function toolNameOf(part: ToolPartLike): string | null {
  if (part.type === 'dynamic-tool') return part.toolName ?? null
  if (part.type.startsWith('tool-')) return part.type.slice(5)
  return null
}

/** `CourseHero` → `Course hero`. */
export function humanizeBlockType(type: string): string {
  const words = type.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ')
  return words.map((w, i) => (i === 0 ? w : w.toLowerCase())).join(' ')
}

/**
 * A block that is no longer on the page (a later turn replaced it) still has a name: block ids
 * are `<Type>-<suffix>` (server-assigned, and Puck's own), so earlier turns' lines keep saying
 * "Updating Course hero" instead of "a block".
 */
export function typeFromId(id: string, typeLabel: (type: string) => string): string | null {
  const match = /^([A-Z][A-Za-z0-9]*)-[A-Za-z0-9-]+$/.exec(id)
  return match ? typeLabel(match[1]) : null
}

export function isFailedToolPart(part: ToolPartLike): boolean {
  if (part.state === 'output-error' || part.state === 'output-denied') return true
  const output = part.output as { ok?: unknown; isError?: unknown } | undefined
  return part.state === 'output-available' && (output?.ok === false || output?.isError === true)
}

export function isDoneToolPart(part: ToolPartLike): boolean {
  return part.state === 'output-available' || part.state === 'output-error' || part.state === 'output-denied'
}

interface Props {
  part: ToolPartLike
  /** Label for a block id on the page (update/move/remove), or null when unknown. */
  blockLabel: (id: string) => string | null
  /** Label for a block type (add_block). */
  typeLabel: (type: string) => string
}

export function ToolLine({ part, blockLabel, typeLabel }: Props) {
  const t = useTranslations('pageArchitect.panel')
  const name = toolNameOf(part)
  if (!name) return null

  const input = (part.input ?? {}) as Record<string, unknown>
  const block =
    typeof input.type === 'string'
      ? typeLabel(input.type)
      : typeof input.id === 'string'
        ? (blockLabel(input.id) ?? typeFromId(input.id, typeLabel) ?? t('aBlock'))
        : t('aBlock')
  const key = (KNOWN_TOOLS as readonly string[]).includes(name) ? name : 'other'
  const label = t(`tools.${key}`, { block })

  const done = isDoneToolPart(part)
  const failed = done && isFailedToolPart(part)

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground" data-testid="page-architect-tool-line">
      {failed ? (
        <IconAlertTriangle className="size-3.5 shrink-0 text-destructive" aria-hidden />
      ) : done ? (
        <IconCheck className="size-3.5 shrink-0 text-success" aria-hidden />
      ) : (
        <span
          className="size-3.5 shrink-0 animate-pulse rounded-full bg-primary/40 motion-reduce:animate-none"
          aria-hidden
        />
      )}
      {done ? (
        <span className="min-w-0 truncate">{failed ? t('toolFailed', { label }) : label}</span>
      ) : (
        <Shimmer className="min-w-0 truncate text-xs">{`${label}…`}</Shimmer>
      )}
    </div>
  )
}
