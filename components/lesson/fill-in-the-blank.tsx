'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { IconCheck, IconX, IconRefresh } from '@tabler/icons-react'

interface FillInTheBlankProps {
  segments: { type: 'text' | 'blank'; value: string }[]
  explanation?: string
  className?: string
}

export function FillInTheBlank({ segments, explanation, className }: FillInTheBlankProps) {
  const blankIndices = useMemo(
    () => segments.map((s, i) => (s.type === 'blank' ? i : -1)).filter((i) => i !== -1),
    [segments]
  )

  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)
  const [results, setResults] = useState<Record<number, boolean>>({})

  const updateAnswer = (index: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [index]: value }))
  }

  const handleCheck = () => {
    const newResults: Record<number, boolean> = {}
    for (const idx of blankIndices) {
      const userAnswer = (answers[idx] || '').trim().toLowerCase()
      const correctAnswer = segments[idx].value.trim().toLowerCase()
      newResults[idx] = userAnswer === correctAnswer
    }
    setResults(newResults)
    setChecked(true)
  }

  const handleReset = () => {
    setAnswers({})
    setResults({})
    setChecked(false)
  }

  const allCorrect = checked && blankIndices.every((idx) => results[idx])

  return (
    <div className={cn('my-6 rounded-lg border bg-card p-4 shadow-sm', className)}>
      <div className="flex flex-wrap items-baseline gap-1 text-sm leading-relaxed">
        {segments.map((segment, index) => {
          if (segment.type === 'text') {
            return <span key={index}>{segment.value}</span>
          }

          const isCorrect = results[index]
          return (
            <input
              key={index}
              type="text"
              value={answers[index] || ''}
              onChange={(e) => updateAnswer(index, e.target.value)}
              disabled={checked}
              placeholder="..."
              className={cn(
                'inline-block w-28 border-b-2 bg-transparent px-1 py-0.5 text-center text-sm outline-none transition-colors',
                !checked && 'border-muted-foreground/30 focus:border-primary',
                checked && isCorrect && 'border-green-500 text-green-700 dark:text-green-400',
                checked && isCorrect === false && 'border-red-500 text-red-700 dark:text-red-400'
              )}
              aria-label={`Espacio en blanco ${blankIndices.indexOf(index) + 1}`}
            />
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {!checked ? (
          <button
            type="button"
            onClick={handleCheck}
            disabled={blankIndices.some((idx) => !(answers[idx] || '').trim())}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Comprobar
          </button>
        ) : (
          <>
            <div
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                allCorrect
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
              )}
              role="status"
            >
              {allCorrect ? (
                <>
                  <IconCheck className="size-4" />
                  ¡Correcto!
                </>
              ) : (
                <>
                  <IconX className="size-4" />
                  Incorrecto
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <IconRefresh className="size-4" />
              Reintentar
            </button>
          </>
        )}
      </div>

      {checked && explanation && (
        <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">{explanation}</p>
      )}
    </div>
  )
}
