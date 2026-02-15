"use client"

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { IconCheck, IconX, IconRefresh } from '@tabler/icons-react'

interface QuizOption {
  text: string
  explanation?: string
}

interface QuizProps {
  question: string
  options: (string | QuizOption)[]
  // backward-compatible prop names
  correct?: number | number[]
  correctIndex?: number
  explanation?: string
  multiple?: boolean // permitir múltiples respuestas
  className?: string
}

export function Quiz({
  question,
  options,
  correct,
  correctIndex,
  explanation,
  multiple = false,
  className,
}: QuizProps) {
  const [selected, setSelected] = useState<number[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [announce, setAnnounce] = useState('')
  const liveRef = useRef<HTMLDivElement | null>(null)

  // support both correct and correctIndex prop names
  const resolvedCorrect = correct ?? (typeof correctIndex === 'number' ? correctIndex : undefined)

  const correctAnswers = Array.isArray(resolvedCorrect)
    ? resolvedCorrect
    : typeof resolvedCorrect === 'number'
    ? [resolvedCorrect]
    : []

  // if multiple is not explicitly set but there are multiple correct answers, enable multiple
  const allowMultiple = multiple || correctAnswers.length > 1

  useEffect(() => {
    if (submitted) {
      if (correctAnswers.length === 0) {
        setAnnounce('Respuesta enviada')
      } else {
        const isCorrect =
          selected.length === correctAnswers.length &&
          selected.every((s) => correctAnswers.includes(s))
        setAnnounce(isCorrect ? 'Respuesta correcta' : 'Respuesta incorrecta')
      }
    } else {
      setAnnounce('')
    }
  }, [submitted, selected, correctAnswers])

  const handleSelect = (index: number) => {
    if (submitted) return

    if (allowMultiple) {
      setSelected((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]))
    } else {
      setSelected([index])
    }
  }

  const handleSubmit = () => {
    if (selected.length > 0 || correctAnswers.length === 0) {
      setSubmitted(true)
    }
  }

  const handleReset = () => {
    setSelected([])
    setSubmitted(false)
  }

  const normalizedOptions = options.map((opt) => (typeof opt === 'string' ? { text: opt } : opt))

  const isCorrect =
    submitted &&
    correctAnswers.length > 0 &&
    selected.length === correctAnswers.length &&
    selected.every((s) => correctAnswers.includes(s))

  return (
    <div
      className={cn('my-6 rounded-lg border bg-card p-4 shadow-sm', className)}
      role="group"
      aria-labelledby="quiz-question"
    >
      <p id="quiz-question" className="mb-4 font-medium text-sm">
        {question}
      </p>

      <div className="space-y-2">
        {normalizedOptions.map((option, index) => {
          const isSelected = selected.includes(index)
          const isCorrectOption = correctAnswers.includes(index)
          const showResult = submitted && correctAnswers.length > 0

          return (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(index)}
              disabled={submitted}
              className={cn(
                'flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors',
                !submitted && 'hover:bg-muted/50',
                isSelected && !submitted && 'border-primary bg-primary/5',
                showResult && isCorrectOption && 'border-green-500 bg-green-50 dark:bg-green-950',
                showResult && isSelected && !isCorrectOption && 'border-red-500 bg-red-50 dark:bg-red-950',
                submitted && 'cursor-default'
              )}
              aria-pressed={isSelected}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                  allowMultiple ? 'rounded' : 'rounded-full',
                  isSelected && !submitted && 'border-primary bg-primary text-primary-foreground',
                  showResult && isCorrectOption && 'border-green-500 bg-green-500 text-white',
                  showResult && isSelected && !isCorrectOption && 'border-red-500 bg-red-500 text-white'
                )}
              >
                {showResult && isCorrectOption ? (
                  <IconCheck className="size-3" />
                ) : showResult && isSelected && !isCorrectOption ? (
                  <IconX className="size-3" />
                ) : (
                  String.fromCharCode(65 + index)
                )}
              </span>
              <span className="flex-1">
                {option.text}
                {showResult && option.explanation && (
                  <span className="mt-1 block text-xs text-muted-foreground">{option.explanation}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selected.length === 0 && correctAnswers.length > 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Comprobar
          </button>
        ) : (
          <>
            <div
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                isCorrect
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
              )}
              role="status"
              aria-live="polite"
            >
              {isCorrect ? (
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
            <button type="button" onClick={handleReset} className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              <IconRefresh className="size-4" />
              Reintentar
            </button>
          </>
        )}
      </div>

      {submitted && explanation && (
        <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">{explanation}</p>
      )}

      {/* Live region for screen readers */}
      <div ref={liveRef} className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  )
}
