'use client'

import { useState } from 'react'
import type { QuizBlock } from '../types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { IconPlus, IconTrash, IconCircleCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface QuizBlockEditorProps {
  block: QuizBlock
  onChange: (updates: Partial<QuizBlock>) => void
}

export function QuizBlockEditor({ block, onChange }: QuizBlockEditorProps) {
  const addOption = () => {
    onChange({ options: [...block.options, ''] })
  }

  const updateOption = (index: number, value: string) => {
    const newOptions = [...block.options]
    newOptions[index] = value
    onChange({ options: newOptions })
  }

  const removeOption = (index: number) => {
    if (block.options.length <= 2) return
    const newOptions = block.options.filter((_, i) => i !== index)
    // Adjust correctIndex if needed
    let newCorrectIndex = block.correctIndex
    if (index === block.correctIndex) {
      newCorrectIndex = 0
    } else if (index < block.correctIndex) {
      newCorrectIndex = block.correctIndex - 1
    }
    onChange({ options: newOptions, correctIndex: newCorrectIndex })
  }

  const setCorrect = (index: number) => {
    onChange({ correctIndex: index })
  }

  return (
    <div className="space-y-3 rounded-lg border bg-gradient-to-br from-purple-500/5 to-blue-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-purple-600">
        <IconCircleCheck className="h-4 w-4" />
        Quiz
      </div>
      
      <Input
        value={block.question}
        onChange={(e) => onChange({ question: e.target.value })}
        placeholder="Escribe tu pregunta..."
        className="font-medium"
      />

      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">
          Opciones (haz clic en el círculo para marcar la correcta)
        </span>
        {block.options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCorrect(index)}
              className={cn(
                'h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors',
                block.correctIndex === index
                  ? 'border-green-500 bg-green-500 text-white'
                  : 'border-muted-foreground/30 hover:border-green-500/50'
              )}
              aria-label={`Marcar opción ${index + 1} como correcta`}
            >
              {block.correctIndex === index && (
                <IconCircleCheck className="h-3 w-3" />
              )}
            </button>
            <Input
              value={option}
              onChange={(e) => updateOption(index, e.target.value)}
              placeholder={`Opción ${index + 1}`}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeOption(index)}
              disabled={block.options.length <= 2}
              className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
              aria-label="Eliminar opción"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addOption}
          className="w-full"
        >
          <IconPlus className="h-4 w-4 mr-2" />
          Añadir opción
        </Button>
      </div>

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
