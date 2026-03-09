'use client'

import type { ComparisonBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { IconPlus, IconTrash, IconArrowsExchange } from '@tabler/icons-react'

interface ComparisonBlockEditorProps {
  block: ComparisonBlock
  onChange: (updates: Partial<ComparisonBlock>) => void
}

type Highlight = 'positive' | 'negative' | 'neutral'

function SideEditor({
  label,
  side,
  onChangeSide,
}: {
  label: string
  side: { title: string; points: string[]; highlight: Highlight }
  onChangeSide: (updates: Partial<typeof side>) => void
}) {
  const addPoint = () => {
    onChangeSide({ points: [...side.points, ''] })
  }

  const updatePoint = (index: number, value: string) => {
    const newPoints = side.points.map((p, i) => (i === index ? value : p))
    onChangeSide({ points: newPoints })
  }

  const removePoint = (index: number) => {
    if (side.points.length <= 1) return
    onChangeSide({ points: side.points.filter((_, i) => i !== index) })
  }

  return (
    <div className="flex-1 space-y-2 rounded-lg border p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <Input
        value={side.title}
        onChange={(e) => onChangeSide({ title: e.target.value })}
        placeholder="Título"
        className="font-medium h-8"
      />
      <select
        value={side.highlight}
        onChange={(e) => onChangeSide({ highlight: e.target.value as Highlight })}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="positive">Positivo</option>
        <option value="negative">Negativo</option>
        <option value="neutral">Neutral</option>
      </select>

      <div className="space-y-1">
        {side.points.map((point, index) => (
          <div key={index} className="flex gap-1 items-center">
            <Input
              value={point}
              onChange={(e) => updatePoint(index, e.target.value)}
              placeholder={`Punto ${index + 1}`}
              className="h-8 flex-1"
            />
            <button
              type="button"
              onClick={() => removePoint(index)}
              disabled={side.points.length <= 1}
              className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
              aria-label="Eliminar punto"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addPoint} className="w-full">
        <IconPlus className="h-3.5 w-3.5 mr-1" />
        Añadir punto
      </Button>
    </div>
  )
}

export function ComparisonBlockEditor({ block, onChange }: ComparisonBlockEditorProps) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconArrowsExchange className="h-4 w-4 text-primary" />
        Comparación
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SideEditor
          label="Lado A"
          side={block.sideA}
          onChangeSide={(updates) =>
            onChange({ sideA: { ...block.sideA, ...updates } })
          }
        />
        <SideEditor
          label="Lado B"
          side={block.sideB}
          onChangeSide={(updates) =>
            onChange({ sideB: { ...block.sideB, ...updates } })
          }
        />
      </div>

      <Textarea
        value={block.summary ?? ''}
        onChange={(e) => onChange({ summary: e.target.value || undefined })}
        placeholder="Resumen (opcional)"
        className="min-h-[60px]"
      />
    </div>
  )
}
