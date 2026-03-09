'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { IconCheck, IconX, IconRefresh } from '@tabler/icons-react'

interface OrderingProps {
  items: string[]
  explanation?: string
  className?: string
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function isIdenticalOrder(arr: string[], original: string[]): boolean {
  return arr.every((val, idx) => val === original[idx])
}

export function Ordering({ items, explanation, className }: OrderingProps) {
  const initialOrder = useMemo(() => {
    if (items.length <= 1) return [...items]
    let shuffled = shuffleArray(items)
    while (isIdenticalOrder(shuffled, items)) {
      shuffled = shuffleArray(items)
    }
    return shuffled
  }, [items])

  const [currentOrder, setCurrentOrder] = useState<string[]>(initialOrder)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)
  const [results, setResults] = useState<Record<number, boolean>>({})

  const handleItemClick = (index: number) => {
    if (checked) return

    if (selectedIndex === null) {
      setSelectedIndex(index)
    } else if (selectedIndex === index) {
      setSelectedIndex(null)
    } else {
      // Swap
      const newOrder = [...currentOrder];
      [newOrder[selectedIndex], newOrder[index]] = [newOrder[index], newOrder[selectedIndex]]
      setCurrentOrder(newOrder)
      setSelectedIndex(null)
    }
  }

  const handleCheck = () => {
    const newResults: Record<number, boolean> = {}
    for (let i = 0; i < items.length; i++) {
      newResults[i] = currentOrder[i] === items[i]
    }
    setResults(newResults)
    setChecked(true)
  }

  const handleReset = () => {
    setCurrentOrder(initialOrder)
    setSelectedIndex(null)
    setResults({})
    setChecked(false)
  }

  const allCorrect = checked && items.every((item, i) => currentOrder[i] === item)

  return (
    <div className={cn('my-6 rounded-lg border bg-card p-4 shadow-sm', className)}>
      <div className="space-y-2">
        {currentOrder.map((item, index) => {
          const isSelected = selectedIndex === index
          return (
            <button
              key={`${index}-${item}`}
              type="button"
              onClick={() => handleItemClick(index)}
              disabled={checked}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm transition-colors',
                !checked && !isSelected && 'hover:bg-muted/50',
                isSelected && 'ring-2 ring-primary bg-primary/5',
                checked && results[index] && 'border-green-500 bg-green-50 dark:bg-green-950',
                checked && results[index] === false && 'border-red-500 bg-red-50 dark:bg-red-950',
                checked && 'cursor-default'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                  !checked && 'bg-muted text-muted-foreground',
                  checked && results[index] && 'bg-green-500 text-white',
                  checked && results[index] === false && 'bg-red-500 text-white'
                )}
              >
                {checked && results[index] ? (
                  <IconCheck className="size-3" />
                ) : checked && results[index] === false ? (
                  <IconX className="size-3" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="flex-1">{item}</span>
            </button>
          )
        })}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Toca un elemento y luego otro para intercambiar posiciones
      </p>

      <div className="mt-4 flex items-center gap-3">
        {!checked ? (
          <button
            type="button"
            onClick={handleCheck}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
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
