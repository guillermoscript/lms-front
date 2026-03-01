import type { DividerSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: DividerSectionData
}

const HEIGHT_MAP = { sm: 'py-4', md: 'py-8', lg: 'py-16' }

export function DividerSection({ data }: Props) {
  const heightClass = HEIGHT_MAP[data.height] || HEIGHT_MAP.md

  return (
    <div className={heightClass}>
      <div className="container mx-auto px-4 md:px-6">
        {data.style === 'line' && (
          <hr className="border-white/10" />
        )}
        {data.style === 'dots' && (
          <div className="flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
          </div>
        )}
        {data.style === 'gradient' && (
          <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        )}
        {/* 'space' style renders nothing — just the padding */}
      </div>
    </div>
  )
}
