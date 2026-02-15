'use client'

import type { StepsBlock, StepItem } from '../types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { IconPlus, IconTrash, IconListNumbers } from '@tabler/icons-react'

interface StepsBlockEditorProps {
  block: StepsBlock
  onChange: (updates: Partial<StepsBlock>) => void
}

export function StepsBlockEditor({ block, onChange }: StepsBlockEditorProps) {
  const addStep = () => {
    onChange({
      steps: [...block.steps, { title: `Paso ${block.steps.length + 1}`, content: '' }],
    })
  }

  const updateStep = (index: number, updates: Partial<StepItem>) => {
    const newSteps = block.steps.map((step, i) =>
      i === index ? { ...step, ...updates } : step
    )
    onChange({ steps: newSteps })
  }

  const removeStep = (index: number) => {
    if (block.steps.length <= 1) return
    onChange({ steps: block.steps.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconListNumbers className="h-4 w-4 text-primary" />
        Pasos
      </div>

      <div className="space-y-3">
        {block.steps.map((step, index) => (
          <div key={index} className="flex gap-2 pl-4 border-l-2 border-primary/30">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {index + 1}
            </div>
            <div className="flex-1 space-y-1">
              <Input
                value={step.title}
                onChange={(e) => updateStep(index, { title: e.target.value })}
                placeholder="Título del paso"
                className="font-medium h-8"
              />
              <Textarea
                value={step.content}
                onChange={(e) => updateStep(index, { content: e.target.value })}
                placeholder="Descripción del paso..."
                className="min-h-[60px]"
              />
            </div>
            <button
              type="button"
              onClick={() => removeStep(index)}
              disabled={block.steps.length <= 1}
              className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30 self-start"
              aria-label="Eliminar paso"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addStep} className="w-full">
        <IconPlus className="h-4 w-4 mr-2" />
        Añadir paso
      </Button>
    </div>
  )
}
