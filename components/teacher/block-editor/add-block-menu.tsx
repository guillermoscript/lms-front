'use client'

import {
  IconPlus,
} from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { BLOCK_METAS, type BlockType } from './types'

interface AddBlockMenuProps {
  onSelect: (type: BlockType) => void
  position?: 'top' | 'inline'
}

export function AddBlockMenu({ onSelect, position = 'inline' }: AddBlockMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {position === 'top' ? (
          <div className="flex items-center justify-center py-2">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer px-3 py-1.5 rounded-md border border-dashed hover:border-primary/50 transition-colors">
              <IconPlus className="h-4 w-4" />
              Añadir bloque
            </span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer">
            <IconPlus className="h-4 w-4" />
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {BLOCK_METAS.map((meta) => (
          <DropdownMenuItem key={meta.type} onClick={() => onSelect(meta.type)}>
            <div className="flex flex-col">
              <span className="font-medium">{meta.label}</span>
              <span className="text-xs text-muted-foreground">{meta.description}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
