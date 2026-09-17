'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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
  IconVolume,
  IconWorldWww,
  IconFileDownload,
  IconListDetails,
  IconArrowsExchange,
  IconTable,
  IconCards,
  IconTextPlus,
  IconArrowsShuffle,
  IconSortAscending,
  IconChecklist,
} from '@tabler/icons-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { BlockType } from './types'
import { cn } from '@/lib/utils'

// Map block types to actual Tabler icons and colors
const BLOCK_ICONS: Record<BlockType, { icon: typeof IconAlignLeft; color: string; bg: string }> = {
  text: { icon: IconAlignLeft, color: 'text-brand-text', bg: 'bg-brand-tint' },
  heading: { icon: IconH1, color: 'text-brand-text', bg: 'bg-brand-tint' },
  callout: { icon: IconInfoCircle, color: 'text-brand-text', bg: 'bg-brand-tint' },
  code: { icon: IconCode, color: 'text-brand-text', bg: 'bg-brand-tint' },
  quiz: { icon: IconHelpCircle, color: 'text-brand-text', bg: 'bg-brand-tint' },
  spoiler: { icon: IconEyeOff, color: 'text-brand-text', bg: 'bg-brand-tint' },
  steps: { icon: IconListNumbers, color: 'text-brand-text', bg: 'bg-brand-tint' },
  vocabulary: { icon: IconLanguage, color: 'text-brand-text', bg: 'bg-brand-tint' },
  definition: { icon: IconBook2, color: 'text-brand-text', bg: 'bg-brand-tint' },
  image: { icon: IconPhoto, color: 'text-brand-text', bg: 'bg-brand-tint' },
  video: { icon: IconPlayerPlay, color: 'text-brand-text', bg: 'bg-brand-tint' },
  divider: { icon: IconMinus, color: 'text-brand-text', bg: 'bg-brand-tint' },
  audio: { icon: IconVolume, color: 'text-brand-text', bg: 'bg-brand-tint' },
  embed: { icon: IconWorldWww, color: 'text-brand-text', bg: 'bg-brand-tint' },
  'file-download': { icon: IconFileDownload, color: 'text-brand-text', bg: 'bg-brand-tint' },
  glossary: { icon: IconListDetails, color: 'text-brand-text', bg: 'bg-brand-tint' },
  comparison: { icon: IconArrowsExchange, color: 'text-brand-text', bg: 'bg-brand-tint' },
  table: { icon: IconTable, color: 'text-brand-text', bg: 'bg-brand-tint' },
  'flashcard-set': { icon: IconCards, color: 'text-brand-text', bg: 'bg-brand-tint' },
  'fill-in-the-blank': { icon: IconTextPlus, color: 'text-brand-text', bg: 'bg-brand-tint' },
  'matching-pairs': { icon: IconArrowsShuffle, color: 'text-brand-text', bg: 'bg-brand-tint' },
  ordering: { icon: IconSortAscending, color: 'text-brand-text', bg: 'bg-brand-tint' },
  checkpoint: { icon: IconChecklist, color: 'text-brand-text', bg: 'bg-brand-tint' },
}

// Group blocks by category for the palette
const BLOCK_GROUPS = [
  {
    key: 'text',
    types: ['text', 'heading', 'callout'] as BlockType[],
  },
  {
    key: 'media',
    types: ['image', 'video', 'audio', 'embed', 'file-download', 'code'] as BlockType[],
  },
  {
    key: 'interactive',
    types: ['quiz', 'flashcard-set', 'fill-in-the-blank', 'matching-pairs', 'ordering', 'checkpoint'] as BlockType[],
  },
  {
    key: 'data',
    types: ['table', 'comparison', 'glossary', 'definition'] as BlockType[],
  },
  {
    key: 'structure',
    types: ['steps', 'spoiler', 'vocabulary', 'divider'] as BlockType[],
  },
]

interface AddBlockMenuProps {
  onSelect: (type: BlockType) => void
  position?: 'top' | 'inline' | 'between'
}

// The palette is taller than the room most triggers leave on screen; PopoverContent
// caps itself at `--available-height` and scrolls, so all 23 blocks stay reachable.
const PALETTE_POPOVER_CLASS = 'w-[360px] p-3'

export function AddBlockMenu({ onSelect, position = 'inline' }: AddBlockMenuProps) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')
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
        <PopoverContent align="center" side="bottom" className={PALETTE_POPOVER_CLASS} sideOffset={4}>
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
          {t('addBlock')}
        </PopoverTrigger>
        <PopoverContent align="center" side="bottom" className={PALETTE_POPOVER_CLASS} sideOffset={4}>
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
        aria-label={t('addBlock')}
      >
        <IconPlus className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className={PALETTE_POPOVER_CLASS} sideOffset={4}>
        <BlockPalette onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  )
}

// Visual grid palette showing all block types grouped
function BlockPalette({ onSelect }: { onSelect: (type: BlockType) => void }) {
  const t = useTranslations('dashboard.teacher.lessonEditor.blockEditor')

  return (
    <div className="space-y-3">
      {BLOCK_GROUPS.map((group) => (
        <div key={group.key}>
          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t(`groups.${group.key}`)}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {group.types.map((type) => {
              const iconData = BLOCK_ICONS[type]
              const Icon = iconData.icon
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onSelect(type)}
                  className={cn(
                    'group flex flex-col items-center gap-1.5 rounded-lg border border-transparent px-2 py-2.5 text-center transition-all',
                    'hover:border-border hover:bg-muted hover:shadow-sm',
                    'active:scale-95'
                  )}
                >
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', iconData.bg)}>
                    <Icon className={cn('h-4 w-4', iconData.color)} />
                  </div>
                  <span className="text-xs font-medium leading-tight text-foreground/80 group-hover:text-foreground">
                    {t(`blocks.${type}.label`)}
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
