'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { IconLoader2, IconSparkles, IconArrowRight } from '@tabler/icons-react'
import type { LandingPageTemplate, LandingSection, SectionType } from '@/lib/landing-pages/types'
import { useTranslations } from 'next-intl'

interface Props {
  open: boolean
  onClose: () => void
  templates: Array<Omit<LandingPageTemplate, 'id' | 'created_at'>>
  onSelect: (sections: LandingSection[], templateName: string) => void
  loading?: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  education: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  general: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  creative: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  business: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

const SECTION_MINI_COLORS: Record<string, string> = {
  hero: 'bg-gradient-to-r from-blue-500/30 to-indigo-500/30',
  features: 'bg-emerald-500/20',
  courses: 'bg-amber-500/20',
  testimonials: 'bg-pink-500/20',
  faq: 'bg-cyan-500/20',
  cta: 'bg-orange-500/20',
  stats: 'bg-violet-500/20',
  text: 'bg-zinc-500/20',
  image_text: 'bg-sky-500/20',
  video: 'bg-red-500/20',
  pricing: 'bg-green-500/20',
  team: 'bg-teal-500/20',
  logo_cloud: 'bg-slate-500/20',
  gallery: 'bg-fuchsia-500/20',
  banner: 'bg-yellow-500/20',
  divider: 'bg-zinc-400/10',
  contact: 'bg-rose-500/20',
}

function MiniPagePreview({ sections }: { sections: LandingSection[] }) {
  return (
    <div className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-2 space-y-1">
      {sections.slice(0, 6).map((s, i) => {
        const color = SECTION_MINI_COLORS[s.type] || 'bg-zinc-500/20'
        const isHero = s.type === 'hero'
        return (
          <div
            key={i}
            className={`rounded ${color} flex items-center justify-center ${isHero ? 'h-8' : 'h-4'}`}
          >
            {isHero && <span className="text-[9px] font-semibold text-white/50 uppercase tracking-wider">Hero</span>}
          </div>
        )
      })}
    </div>
  )
}

export function TemplatePicker({ open, onClose, templates, onSelect, loading }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const t = useTranslations('landingPageBuilder.templatePicker')
  const tLabels = useTranslations('landingPageBuilder.sectionLabels')

  const sorted = [...templates].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <div className="px-6 pt-6 pb-4 border-b">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <IconSparkles className="w-4 h-4 text-white" />
              </div>
              {t('title')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">{t('description')}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((template, idx) => {
              const catColor = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.general

              return (
                <button
                  key={idx}
                  className={`group relative flex flex-col rounded-xl border text-left transition-all duration-200 overflow-hidden ${
                    hoveredIdx === idx
                      ? 'border-blue-500/50 bg-blue-500/5 shadow-lg shadow-blue-500/5 scale-[1.02]'
                      : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50'
                  }`}
                  onClick={() => onSelect(template.sections, template.name)}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  disabled={!!loading}
                >
                  <div className="p-3 pb-2">
                    <MiniPagePreview sections={template.sections} />
                  </div>

                  <div className="flex-1 px-3 pb-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-foreground">{template.name}</h3>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${catColor}`}>
                        {template.category}
                      </Badge>
                    </div>
                    {template.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{template.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {template.sections.slice(0, 4).map((s, i) => (
                        <span key={i} className="text-[10px] text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                          {tLabels(s.type as SectionType)}
                        </span>
                      ))}
                      {template.sections.length > 4 && (
                        <span className="text-[10px] text-zinc-600 px-1">
                          {t('more', { count: template.sections.length - 4 })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={`absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl transition-opacity duration-200 ${
                    hoveredIdx === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}>
                    {loading ? (
                      <IconLoader2 className="w-5 h-5 animate-spin text-white" />
                    ) : (
                      <div className="flex items-center gap-2 text-white font-medium text-sm">
                        {t('useTemplate')}
                        <IconArrowRight className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
