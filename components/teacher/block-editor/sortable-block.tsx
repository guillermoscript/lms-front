'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  IconGripVertical,
  IconTrash,
  IconCopy,
  IconChevronUp,
  IconChevronDown,
  IconPlus,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BLOCK_METAS, type BlockType } from './types'
import { cn } from '@/lib/utils'

interface SortableBlockProps {
  id: string
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex gap-2 rounded-lg border bg-card p-3 transition-shadow',
        isDragging && 'z-50 shadow-lg ring-2 ring-primary/50'
      )}
    >
      {/* Drag handle & controls */}
      <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Drag handle */}
        <button
          type="button"
          className="cursor-grab p-1 rounded hover:bg-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Arrastrar bloque"
        >
          <IconGripVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Move up */}
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 rounded hover:bg-muted disabled:opacity-30"
          aria-label="Mover arriba"
        >
          <IconChevronUp className="h-3 w-3 text-muted-foreground" />
        </button>

        {/* Move down */}
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 rounded hover:bg-muted disabled:opacity-30"
          aria-label="Mover abajo"
        >
          <IconChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      {/* Block content */}
      <div className="flex-1 min-w-0">{children}</div>

      {/* Block actions */}
      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Add block after */}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <span
              className="p-1 rounded hover:bg-muted inline-flex cursor-pointer"
              aria-label="Añadir bloque"
            >
              <IconPlus className="h-4 w-4 text-muted-foreground" />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {BLOCK_METAS.map((meta) => (
              <DropdownMenuItem key={meta.type} onClick={() => onAddAfter(meta.type)}>
                <span className="font-medium">{meta.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Duplicate */}
        <button
          type="button"
          onClick={onDuplicate}
          className="p-1 rounded hover:bg-muted"
          aria-label="Duplicar bloque"
        >
          <IconCopy className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded hover:bg-destructive/10 text-destructive"
          aria-label="Eliminar bloque"
        >
          <IconTrash className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
