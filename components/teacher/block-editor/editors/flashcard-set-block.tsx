'use client'

import type { FlashcardSetBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { IconPlus, IconTrash, IconCards } from '@tabler/icons-react'

interface FlashcardSetBlockEditorProps {
  block: FlashcardSetBlock
  onChange: (updates: Partial<FlashcardSetBlock>) => void
}

export function FlashcardSetBlockEditor({ block, onChange }: FlashcardSetBlockEditorProps) {
  const addCard = () => {
    onChange({ cards: [...block.cards, { front: '', back: '' }] })
  }

  const updateCard = (index: number, field: 'front' | 'back', value: string) => {
    const newCards = [...block.cards]
    newCards[index] = { ...newCards[index], [field]: value }
    onChange({ cards: newCards })
  }

  const removeCard = (index: number) => {
    if (block.cards.length <= 1) return
    onChange({ cards: block.cards.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3 rounded-lg border bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-600">
        <IconCards className="h-4 w-4" />
        Flashcards
      </div>

      <div className="space-y-2">
        {block.cards.map((card, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-4 shrink-0">{index + 1}</span>
            <Input
              value={card.front}
              onChange={(e) => updateCard(index, 'front', e.target.value)}
              placeholder="Frente"
              className="flex-1"
            />
            <Input
              value={card.back}
              onChange={(e) => updateCard(index, 'back', e.target.value)}
              placeholder="Reverso"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeCard(index)}
              disabled={block.cards.length <= 1}
              className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
              aria-label="Eliminar tarjeta"
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
        onClick={addCard}
        className="w-full"
      >
        <IconPlus className="h-4 w-4 mr-2" />
        Añadir tarjeta
      </Button>
    </div>
  )
}
