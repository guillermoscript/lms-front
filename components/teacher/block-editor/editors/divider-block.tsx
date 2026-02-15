'use client'

import { IconMinus } from '@tabler/icons-react'

export function DividerBlockEditor() {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex-1 border-t border-dashed" />
      <IconMinus className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 border-t border-dashed" />
    </div>
  )
}
