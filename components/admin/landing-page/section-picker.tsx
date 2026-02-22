'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { SectionType } from '@/lib/landing-pages/types'
import {
  IconLayoutNavbar,
  IconLayoutGrid,
  IconBook,
  IconQuote,
  IconHelp,
  IconSpeakerphone,
  IconChartBar,
  IconFileText,
  IconPhoto,
  IconVideo,
  IconCurrencyDollar,
  IconUsers,
  IconBuildingStore,
  IconGridPattern,
  IconFlag,
  IconSeparator,
  IconAddressBook,
} from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

const SECTION_ICONS: Record<SectionType, React.ComponentType<{ className?: string }>> = {
  hero: IconLayoutNavbar,
  features: IconLayoutGrid,
  courses: IconBook,
  testimonials: IconQuote,
  faq: IconHelp,
  cta: IconSpeakerphone,
  stats: IconChartBar,
  text: IconFileText,
  image_text: IconPhoto,
  video: IconVideo,
  pricing: IconCurrencyDollar,
  team: IconUsers,
  logo_cloud: IconBuildingStore,
  gallery: IconGridPattern,
  banner: IconFlag,
  divider: IconSeparator,
  contact: IconAddressBook,
}

const ICON_COLORS: Record<SectionType, string> = {
  hero: 'from-blue-500 to-indigo-600',
  features: 'from-emerald-500 to-green-600',
  courses: 'from-amber-500 to-orange-600',
  testimonials: 'from-pink-500 to-rose-600',
  faq: 'from-cyan-500 to-teal-600',
  cta: 'from-orange-500 to-red-600',
  stats: 'from-violet-500 to-purple-600',
  text: 'from-zinc-500 to-zinc-600',
  image_text: 'from-sky-500 to-blue-600',
  video: 'from-red-500 to-rose-600',
  pricing: 'from-green-500 to-emerald-600',
  team: 'from-teal-500 to-cyan-600',
  logo_cloud: 'from-slate-500 to-zinc-600',
  gallery: 'from-fuchsia-500 to-purple-600',
  banner: 'from-yellow-500 to-amber-600',
  divider: 'from-zinc-400 to-zinc-500',
  contact: 'from-rose-500 to-pink-600',
}

interface SectionCategory {
  labelKey: string
  types: SectionType[]
}

const CATEGORIES: SectionCategory[] = [
  { labelKey: 'heroCta', types: ['hero', 'cta', 'banner'] },
  { labelKey: 'content', types: ['features', 'text', 'image_text', 'video', 'faq'] },
  { labelKey: 'socialProof', types: ['testimonials', 'stats', 'team', 'logo_cloud'] },
  { labelKey: 'commerce', types: ['courses', 'pricing', 'contact'] },
  { labelKey: 'layout', types: ['gallery', 'divider'] },
]

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (type: SectionType) => void
}

export function SectionPicker({ open, onClose, onSelect }: Props) {
  const [filter, setFilter] = useState<string | null>(null)
  const t = useTranslations('landingPageBuilder.sectionPicker')
  const tLabels = useTranslations('landingPageBuilder.sectionLabels')
  const tDesc = useTranslations('landingPageBuilder.sectionDescriptions')

  const filteredCategories = filter
    ? CATEGORIES.filter(c => c.labelKey === filter)
    : CATEGORIES

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setFilter(null) } }}>
      <DialogContent className="w-full max-h-[80vh] overflow-hidden flex flex-col p-0">
        <div className="px-6 pt-6 pb-3 border-b space-y-3">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            <button
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                !filter ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setFilter(null)}
            >
              {t('all')}
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat.labelKey}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  filter === cat.labelKey ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setFilter(filter === cat.labelKey ? null : cat.labelKey)}
              >
                {t(`categories.${cat.labelKey}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {filteredCategories.map(category => (
            <div key={category.labelKey}>
              {!filter && (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                  {t(`categories.${category.labelKey}`)}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {category.types.map(type => {
                  const Icon = SECTION_ICONS[type]
                  const gradient = ICON_COLORS[type]
                  return (
                    <button
                      key={type}
                      className="flex items-center gap-3 p-3 rounded-lg border border-transparent text-left hover:border-zinc-700 hover:bg-accent/40 transition-all duration-150 group"
                      onClick={() => { onSelect(type); setFilter(null) }}
                    >
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{tLabels(type)}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight line-clamp-1">
                          {tDesc(type)}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
