'use client'

import type { MatchingPairsBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { IconPlus, IconTrash, IconArrowsShuffle } from '@tabler/icons-react'

interface MatchingPairsBlockEditorProps {
  block: MatchingPairsBlock
  onChange: (updates: Partial<MatchingPairsBlock>) => void
}

export function MatchingPairsBlockEditor({ block, onChange }: MatchingPairsBlockEditorProps) {
  const addPair = () => {
    onChange({ pairs: [...block.pairs, { term: '', match: '' }] })
  }

  const updatePair = (index: number, field: 'term' | 'match', value: string) => {
    const newPairs = [...block.pairs]
    newPairs[index] = { ...newPairs[index], [field]: value }
    onChange({ pairs: newPairs })
  }

  const removePair = (index: number) => {
    if (block.pairs.length <= 2) return
    onChange({ pairs: block.pairs.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3 rounded-lg border bg-gradient-to-br from-indigo-500/5 to-violet-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-indigo-600">
        <IconArrowsShuffle className="h-4 w-4" />
        Emparejar
      </div>

      <div className="space-y-2">
        <div className="flex gap-2 px-6">
          <span className="flex-1 text-xs text-muted-foreground">Término</span>
          <span className="flex-1 text-xs text-muted-foreground">Pareja</span>
          <span className="w-7" />
        </div>
        {block.pairs.map((pair, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-4 shrink-0">{index + 1}</span>
            <Input
              value={pair.term}
              onChange={(e) => updatePair(index, 'term', e.target.value)}
              placeholder="Término..."
              className="flex-1"
            />
            <Input
              value={pair.match}
              onChange={(e) => updatePair(index, 'match', e.target.value)}
              placeholder="Pareja..."
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removePair(index)}
              disabled={block.pairs.length <= 2}
              className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
              aria-label="Eliminar pareja"
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
        onClick={addPair}
        className="w-full"
      >
        <IconPlus className="h-4 w-4 mr-2" />
        Añadir pareja
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
