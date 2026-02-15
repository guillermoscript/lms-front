import { cn } from '@/lib/utils'
import { IconArrowsExchange } from '@tabler/icons-react'

interface CompareProps {
  left: {
    title: string
    content: React.ReactNode
    highlight?: 'positive' | 'negative' | 'neutral'
  }
  right: {
    title: string
    content: React.ReactNode
    highlight?: 'positive' | 'negative' | 'neutral'
  }
  className?: string
}

const highlightStyles = {
  positive: 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/50',
  negative: 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/50',
  neutral: 'border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/50',
}

export function Compare({ left, right, className }: CompareProps) {
  return (
    <div className={cn('my-6', className)}>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Lado izquierdo */}
        <div
          className={cn(
            'rounded-lg border p-4',
            highlightStyles[left.highlight || 'neutral']
          )}
        >
          <h4 className="mb-3 flex items-center gap-2 font-semibold text-sm">
            {left.highlight === 'negative' && (
              <span className="text-red-500">✗</span>
            )}
            {left.highlight === 'positive' && (
              <span className="text-green-500">✓</span>
            )}
            {left.title}
          </h4>
          <div className="text-sm [&>p]:mb-2 [&>p:last-child]:mb-0">
            {left.content}
          </div>
        </div>

        {/* Separador visual en mobile */}
        <div className="flex items-center justify-center md:hidden">
          <IconArrowsExchange className="size-5 rotate-90 text-muted-foreground" />
        </div>

        {/* Lado derecho */}
        <div
          className={cn(
            'rounded-lg border p-4',
            highlightStyles[right.highlight || 'neutral']
          )}
        >
          <h4 className="mb-3 flex items-center gap-2 font-semibold text-sm">
            {right.highlight === 'negative' && (
              <span className="text-red-500">✗</span>
            )}
            {right.highlight === 'positive' && (
              <span className="text-green-500">✓</span>
            )}
            {right.title}
          </h4>
          <div className="text-sm [&>p]:mb-2 [&>p:last-child]:mb-0">
            {right.content}
          </div>
        </div>
      </div>
    </div>
  )
}

// Versión simplificada para comparar código incorrecto vs correcto
interface CodeCompareProps {
  incorrect: string
  correct: string
  language?: string
  className?: string
}

export function CodeCompare({ incorrect, correct, language = 'javascript', className }: CodeCompareProps) {
  return (
    <Compare
      className={className}
      left={{
        title: 'Incorrecto',
        highlight: 'negative',
        content: (
          <pre className="overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/5">
            <code>{incorrect}</code>
          </pre>
        ),
      }}
      right={{
        title: 'Correcto',
        highlight: 'positive',
        content: (
          <pre className="overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/5">
            <code>{correct}</code>
          </pre>
        ),
      }}
    />
  )
}

// Versión para comparar "Antes" vs "Después"
interface BeforeAfterProps {
  before: React.ReactNode
  after: React.ReactNode
  className?: string
}

export function BeforeAfter({ before, after, className }: BeforeAfterProps) {
  return (
    <Compare
      className={className}
      left={{
        title: 'Antes',
        highlight: 'neutral',
        content: before,
      }}
      right={{
        title: 'Después',
        highlight: 'positive',
        content: after,
      }}
    />
  )
}
