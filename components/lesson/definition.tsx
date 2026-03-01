import { cn } from '@/lib/utils'
import { IconBook } from '@tabler/icons-react'

interface DefinitionProps {
  term: string
  children: React.ReactNode
  pronunciation?: string
  partOfSpeech?: string // noun, verb, adjective, etc.
  className?: string
}

export function Definition({
  term,
  children,
  pronunciation,
  partOfSpeech,
  className,
}: DefinitionProps) {
  return (
    <div
      className={cn(
        'my-4 rounded-lg border-l-4 border-primary bg-muted/30 p-4',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <IconBook className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-bold text-base">{term}</span>
            {pronunciation && (
              <span className="text-sm text-muted-foreground">
                /{pronunciation}/
              </span>
            )}
            {partOfSpeech && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs italic text-muted-foreground">
                {partOfSpeech}
              </span>
            )}
          </div>
          <div className="mt-2 text-sm [&>p]:mb-2 [&>p:last-child]:mb-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// Componente para lista de definiciones (glosario)
interface GlossaryProps {
  items: {
    term: string
    definition: string
    pronunciation?: string
    partOfSpeech?: string
  }[]
  className?: string
}

export function Glossary({ items, className }: GlossaryProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item, index) => (
        <Definition
          key={index}
          term={item.term}
          pronunciation={item.pronunciation}
          partOfSpeech={item.partOfSpeech}
        >
          {item.definition}
        </Definition>
      ))}
    </div>
  )
}
