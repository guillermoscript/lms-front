'use client'

import { useState } from 'react'
import {
  IconPlus,
  IconAlignLeft,
  IconH1,
  IconInfoCircle,
  IconCode,
  IconHelpCircle,
  IconEyeOff,
  IconListNumbers,
  IconLanguage,
  IconBook2,
  IconPhoto,
  IconPlayerPlay,
  IconMinus,
} from '@tabler/icons-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { BLOCK_METAS, type BlockType } from './types'
import { cn } from '@/lib/utils'

// Map block types to actual Tabler icons and colors
const BLOCK_ICONS: Record<BlockType, { icon: typeof IconAlignLeft; color: string; bg: string }> = {
  text: { icon: IconAlignLeft, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800' },
  heading: { icon: IconH1, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950' },
  callout: { icon: IconInfoCircle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950' },
  code: { icon: IconCode, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950' },
  quiz: { icon: IconHelpCircle, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950' },
  spoiler: { icon: IconEyeOff, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950' },
  steps: { icon: IconListNumbers, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-950' },
  vocabulary: { icon: IconLanguage, color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-950' },
  definition: { icon: IconBook2, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950' },
  image: { icon: IconPhoto, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950' },
  video: { icon: IconPlayerPlay, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950' },
  divider: { icon: IconMinus, color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800' },
}

// Group blocks by category for the palette
const BLOCK_GROUPS = [
  {
    label: 'Texto',
    types: ['text', 'heading', 'callout'] as BlockType[],
  },
  {
    label: 'Media',
    types: ['image', 'video', 'code'] as BlockType[],
  },
  {
    label: 'Interactivo',
    types: ['quiz', 'spoiler', 'steps'] as BlockType[],
  },
  {
    label: 'Referencia',
    types: ['vocabulary', 'definition', 'divider'] as BlockType[],
  },
]

interface AddBlockMenuProps {
  onSelect: (type: BlockType) => void
  position?: 'top' | 'inline' | 'between'
}

export function AddBlockMenu({ onSelect, position = 'inline' }: AddBlockMenuProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (type: BlockType) => {
    onSelect(type)
    setOpen(false)
  }

  // Inline between-block inserter (Notion-style line)
  if (position === 'between') {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <div className="group/inserter relative flex items-center py-0.5 -my-0.5 cursor-pointer">
          <div className="absolute inset-x-0 top-1/2 h-px bg-transparent group-hover/inserter:bg-primary/30 transition-colors" />
          <PopoverTrigger
            className="relative z-10 mx-auto flex h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 group-hover/inserter:opacity-100 transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary shadow-sm"
          >
            <IconPlus className="h-3 w-3" />
          </PopoverTrigger>
        </div>
        <PopoverContent align="center" side="bottom" className="w-[340px] p-3" sideOffset={4}>
          <BlockPalette onSelect={handleSelect} />
        </PopoverContent>
      </Popover>
    )
  }

  // Top-level "Add first block" button
  if (position === 'top') {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/30 px-4 py-3 text-sm text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
        >
          <IconPlus className="h-4 w-4" />
          Añadir bloque
        </PopoverTrigger>
        <PopoverContent align="center" side="bottom" className="w-[340px] p-3" sideOffset={4}>
          <BlockPalette onSelect={handleSelect} />
        </PopoverContent>
      </Popover>
    )
  }

  // Inline small trigger (used in sortable block actions)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex items-center gap-1 rounded-md p-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Añadir bloque"
      >
        <IconPlus className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-[340px] p-3" sideOffset={4}>
        <BlockPalette onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  )
}

// Visual grid palette showing all block types grouped
function BlockPalette({ onSelect }: { onSelect: (type: BlockType) => void }) {
  const metaMap = Object.fromEntries(BLOCK_METAS.map((m) => [m.type, m]))

  return (
    <div className="space-y-3">
      {BLOCK_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            {group.label}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {group.types.map((type) => {
              const meta = metaMap[type]
              const iconData = BLOCK_ICONS[type]
              const Icon = iconData.icon
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onSelect(type)}
                  className={cn(
                    'group flex flex-col items-center gap-1.5 rounded-lg border border-transparent px-2 py-2.5 text-center transition-all',
                    'hover:border-border hover:bg-accent hover:shadow-sm',
                    'active:scale-95'
                  )}
                >
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', iconData.bg)}>
                    <Icon className={cn('h-4 w-4', iconData.color)} />
                  </div>
                  <span className="text-[11px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">
                    {meta?.label || type}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// Export for reuse in block-editor sidebar
export { BlockPalette, BLOCK_ICONS }
