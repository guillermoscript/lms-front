'use client'

import type { OrderingBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { IconPlus, IconTrash, IconSortAscending } from '@tabler/icons-react'

interface OrderingBlockEditorProps {
  block: OrderingBlock
  onChange: (updates: Partial<OrderingBlock>) => void
}

export function OrderingBlockEditor({ block, onChange }: OrderingBlockEditorProps) {
  const addItem = () => {
    onChange({ items: [...block.items, ''] })
  }

  const updateItem = (index: number, value: string) => {
    const newItems = [...block.items]
    newItems[index] = value
    onChange({ items: newItems })
  }

  const removeItem = (index: number) => {
    if (block.items.length <= 2) return
    onChange({ items: block.items.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3 rounded-lg border bg-gradient-to-br from-rose-500/5 to-pink-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-rose-600">
        <IconSortAscending className="h-4 w-4" />
        Ordenar
      </div>

      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">
          Ingresa los elementos en el orden correcto
        </span>
        {block.items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-medium text-rose-700 dark:bg-rose-900 dark:text-rose-200">
              {index + 1}
            </span>
            <Input
              value={item}
              onChange={(e) => updateItem(index, e.target.value)}
              placeholder={`Elemento ${index + 1}`}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeItem(index)}
              disabled={block.items.length <= 2}
              className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
              aria-label="Eliminar elemento"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addItem}
        className="w-full"
      >
        <IconPlus className="h-4 w-4 mr-2" />
        Añadir elemento
      </Button>

      <div>
        <span className="text-xs text-muted-foreground">Explicación (opcional)</span>
        <Textarea
          value={block.explanation || ''}
          onChange={(e) => onChange({ explanation: e.target.value || undefined })}
          placeholder="Explicación que se mostrará después de responder..."
          className="mt-1 min-h-[60px]"
        />
      </div>
    </div>
  )
}
