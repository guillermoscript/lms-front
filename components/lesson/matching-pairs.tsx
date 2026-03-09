'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { IconCheck, IconX, IconRefresh } from '@tabler/icons-react'

interface MatchingPairsProps {
  pairs: { term: string; match: string }[]
  explanation?: string
  className?: string
}

const PAIR_COLORS = [
  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
]

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function isIdenticalOrder(shuffled: number[], length: number): boolean {
  return shuffled.every((val, idx) => val === idx)
}

export function MatchingPairs({ pairs, explanation, className }: MatchingPairsProps) {
  const shuffledMatchIndices = useMemo(() => {
    if (pairs.length <= 1) return pairs.map((_, i) => i)
    const indices = pairs.map((_, i) => i)
    let shuffled = shuffleArray(indices)
    while (isIdenticalOrder(shuffled, pairs.length)) {
      shuffled = shuffleArray(indices)
    }
    return shuffled
  }, [pairs])

  // connections: map from term index to match original index
  const [connections, setConnections] = useState<Record<number, number>>({})
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)
  const [results, setResults] = useState<Record<number, boolean>>({})

  const handleTermClick = (termIdx: number) => {
    if (checked) return

    // If this term is already connected, disconnect it
    if (connections[termIdx] !== undefined) {
      const newConn = { ...connections }
      delete newConn[termIdx]
      setConnections(newConn)
      setSelectedTerm(null)
      setSelectedMatch(null)
      return
    }

    setSelectedTerm(termIdx)

    // If a match is already selected, connect them
    if (selectedMatch !== null) {
      setConnections((prev) => ({ ...prev, [termIdx]: selectedMatch }))
      setSelectedTerm(null)
      setSelectedMatch(null)
    }
  }

  const handleMatchClick = (originalIdx: number) => {
    if (checked) return

    // If this match is already connected, find and disconnect it
    const connectedTerm = Object.entries(connections).find(([, v]) => v === originalIdx)
    if (connectedTerm) {
      const newConn = { ...connections }
      delete newConn[Number(connectedTerm[0])]
      setConnections(newConn)
      setSelectedTerm(null)
      setSelectedMatch(null)
      return
    }

    setSelectedMatch(originalIdx)

    // If a term is already selected, connect them
    if (selectedTerm !== null) {
      setConnections((prev) => ({ ...prev, [selectedTerm]: originalIdx }))
      setSelectedTerm(null)
      setSelectedMatch(null)
    }
  }

  const getColorForConnection = (termIdx: number): string | null => {
    if (connections[termIdx] === undefined) return null
    const connIndex = Object.keys(connections).sort().indexOf(String(termIdx))
    return PAIR_COLORS[connIndex % PAIR_COLORS.length]
  }

  const getMatchColor = (originalIdx: number): string | null => {
    const entry = Object.entries(connections).find(([, v]) => v === originalIdx)
    if (!entry) return null
    return getColorForConnection(Number(entry[0]))
  }

  const handleCheck = () => {
    const newResults: Record<number, boolean> = {}
    for (let i = 0; i < pairs.length; i++) {
      newResults[i] = connections[i] === i
    }
    setResults(newResults)
    setChecked(true)
  }

  const handleReset = () => {
    setConnections({})
    setSelectedTerm(null)
    setSelectedMatch(null)
    setResults({})
    setChecked(false)
  }

  const allCorrect = checked && pairs.every((_, i) => results[i])
  const allConnected = Object.keys(connections).length === pairs.length

  return (
    <div className={cn('my-6 rounded-lg border bg-card p-4 shadow-sm', className)}>
      <div className="grid grid-cols-2 gap-4">
        {/* Terms column */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Términos</span>
          {pairs.map((pair, termIdx) => {
            const color = getColorForConnection(termIdx)
            const isSelected = selectedTerm === termIdx
            return (
              <button
                key={termIdx}
                type="button"
                onClick={() => handleTermClick(termIdx)}
                disabled={checked}
                className={cn(
                  'w-full rounded-md border p-3 text-left text-sm transition-colors',
                  !checked && !color && !isSelected && 'hover:bg-muted/50',
                  isSelected && 'ring-2 ring-primary',
                  color && color,
                  checked && results[termIdx] && 'border-green-500',
                  checked && results[termIdx] === false && 'border-red-500',
                  checked && 'cursor-default'
                )}
              >
                {pair.term}
              </button>
            )
          })}
        </div>

        {/* Matches column (shuffled) */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Parejas</span>
          {shuffledMatchIndices.map((originalIdx) => {
            const color = getMatchColor(originalIdx)
            const isSelected = selectedMatch === originalIdx
            return (
              <button
                key={originalIdx}
                type="button"
                onClick={() => handleMatchClick(originalIdx)}
                disabled={checked}
                className={cn(
                  'w-full rounded-md border p-3 text-left text-sm transition-colors',
                  !checked && !color && !isSelected && 'hover:bg-muted/50',
                  isSelected && 'ring-2 ring-primary',
                  color && color,
                  checked && 'cursor-default'
                )}
              >
                {pairs[originalIdx].match}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        {!checked ? (
          <button
            type="button"
            onClick={handleCheck}
            disabled={!allConnected}
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
