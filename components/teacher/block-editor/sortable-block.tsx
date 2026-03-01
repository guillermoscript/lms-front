'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  IconGripVertical,
  IconTrash,
  IconCopy,
  IconChevronUp,
  IconChevronDown,
  IconDotsVertical,
} from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BLOCK_METAS, type BlockType } from './types'
import { BLOCK_ICONS } from './add-block-menu'
import { AddBlockMenu } from './add-block-menu'
import { cn } from '@/lib/utils'

interface SortableBlockProps {
  id: string
  blockType: BlockType
  children: React.ReactNode
  isFirst: boolean
  isLast: boolean
  onDelete: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onAddAfter: (type: BlockType) => void
}

export function SortableBlock({
  id,
  blockType,
  children,
  isFirst,
  isLast,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onAddAfter,
}: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const meta = BLOCK_METAS.find((m) => m.type === blockType)
  const iconData = BLOCK_ICONS[blockType]
  const TypeIcon = iconData?.icon

  return (
    <div className="relative">
      {/* The block itself */}
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'group/block relative rounded-xl border bg-card transition-all duration-200',
          isDragging
            ? 'z-50 shadow-xl ring-2 ring-primary/40 scale-[1.01]'
            : 'hover:shadow-md hover:border-border/80',
          'border-border/50'
        )}
      >
        {/* Block type indicator strip */}
        <div className={cn('absolute left-0 top-3 bottom-3 w-1 rounded-full', iconData?.bg || 'bg-muted')} />

        {/* Header bar — visible on hover */}
        <div className="flex items-center gap-1 px-4 pt-2 pb-0 opacity-0 group-hover/block:opacity-100 transition-opacity duration-150">
          {/* Drag handle */}
          <button
            type="button"
            className="cursor-grab rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Arrastrar bloque"
          >
            <IconGripVertical className="h-3.5 w-3.5" />
          </button>

          {/* Type label */}
          <div className="flex items-center gap-1.5 px-1">
            {TypeIcon && <TypeIcon className={cn('h-3 w-3', iconData?.color || 'text-muted-foreground')} />}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {meta?.label || blockType}
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Quick actions */}
          <div className="flex items-center gap-0.5">
            {!isFirst && (
              <button
                type="button"
                onClick={onMoveUp}
                className="rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted"
                aria-label="Mover arriba"
              >
                <IconChevronUp className="h-3.5 w-3.5" />
              </button>
            )}
            {!isLast && (
              <button
                type="button"
                onClick={onMoveDown}
                className="rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted"
                aria-label="Mover abajo"
              >
                <IconChevronDown className="h-3.5 w-3.5" />
              </button>
            )}

            {/* More menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted"
                aria-label="Más opciones"
              >
                <IconDotsVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={onDuplicate}>
                  <IconCopy className="mr-2 h-3.5 w-3.5" />
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <IconTrash className="mr-2 h-3.5 w-3.5" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Block content area */}
        <div className="px-5 pb-4 pt-2 pl-6">{children}</div>
      </div>

      {/* Between-block inserter */}
      {!isLast && (
        <div className="relative z-10">
          <AddBlockMenu onSelect={onAddAfter} position="between" />
        </div>
      )}
    </div>
  )
}
