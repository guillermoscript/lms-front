'use client'

import type { GlossaryBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { IconPlus, IconTrash, IconListDetails } from '@tabler/icons-react'

interface GlossaryBlockEditorProps {
  block: GlossaryBlock
  onChange: (updates: Partial<GlossaryBlock>) => void
}

export function GlossaryBlockEditor({ block, onChange }: GlossaryBlockEditorProps) {
  const addItem = () => {
    onChange({
      items: [...block.items, { term: '', definition: '' }],
    })
  }

  const updateItem = (index: number, updates: Partial<{ term: string; definition: string }>) => {
    const newItems = block.items.map((item, i) =>
      i === index ? { ...item, ...updates } : item
    )
    onChange({ items: newItems })
  }

  const removeItem = (index: number) => {
    if (block.items.length <= 1) return
    onChange({ items: block.items.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconListDetails className="h-4 w-4 text-primary" />
        Glosario
      </div>

      <div className="space-y-3">
        {block.items.map((item, index) => (
          <div key={index} className="flex gap-2 items-start">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input
                value={item.term}
                onChange={(e) => updateItem(index, { term: e.target.value })}
                placeholder="Término"
                className="font-medium h-8"
              />
              <Input
                value={item.definition}
                onChange={(e) => updateItem(index, { definition: e.target.value })}
                placeholder="Definición"
                className="h-8"
              />
            </div>
            <button
              type="button"
              onClick={() => removeItem(index)}
              disabled={block.items.length <= 1}
              className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30 self-center"
              aria-label="Eliminar término"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full">
        <IconPlus className="h-4 w-4 mr-2" />
        Añadir término
      </Button>
    </div>
  )
}
