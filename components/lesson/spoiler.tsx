'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { IconChevronDown, IconEye, IconEyeOff } from '@tabler/icons-react'

interface SpoilerProps {
  title?: string
  children: React.ReactNode
  className?: string
  defaultOpen?: boolean
}

export function Spoiler({
  title = 'Ver respuesta',
  children,
  className,
  defaultOpen = false,
}: SpoilerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div
      className={cn(
        'my-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          {isOpen ? (
            <IconEyeOff className="size-4" aria-hidden="true" />
          ) : (
            <IconEye className="size-4" aria-hidden="true" />
          )}
          {title}
        </span>
        <IconChevronDown
          className={cn(
            'size-4 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>
      
      <div
        className={cn(
          'grid transition-all duration-200 ease-in-out',
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-dashed border-muted-foreground/30 px-4 py-3 text-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// Alias para uso en MDX
export const Solution = (props: Omit<SpoilerProps, 'title'>) => (
  <Spoiler title="Ver solución" {...props} />
)
export const Hint = (props: Omit<SpoilerProps, 'title'>) => (
  <Spoiler title="Ver pista" {...props} />
)
export const Answer = (props: Omit<SpoilerProps, 'title'>) => (
  <Spoiler title="Ver respuesta" {...props} />
)
