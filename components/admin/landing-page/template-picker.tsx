'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconLoader2, IconSparkles, IconArrowRight, IconArrowLeft, IconHome, IconInfoCircle, IconMail, IconQuestionMark, IconFileText, IconCalendar } from '@tabler/icons-react'
import type { LandingSection, SectionType } from '@/lib/landing-pages/types'
import type { BuiltInTemplate } from '@/lib/landing-pages/templates'
import { useTranslations } from 'next-intl'

interface Props {
  open: boolean
  onClose: () => void
  templates: BuiltInTemplate[]
  onSelect: (sections: LandingSection[], templateName: string, slug?: string) => void
  loading?: boolean
}

const PAGE_TYPE_PRESETS = [
  { slug: 'home', icon: IconHome, color: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
  { slug: 'about', icon: IconInfoCircle, color: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
  { slug: 'contact', icon: IconMail, color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  { slug: 'faq', icon: IconQuestionMark, color: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
  { slug: 'terms', icon: IconFileText, color: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400' },
  { slug: 'events', icon: IconCalendar, color: 'bg-rose-500/10 border-rose-500/20 text-rose-400' },
] as const

const CATEGORY_COLORS: Record<string, string> = {
  education: 'bg-primary/10 text-primary border-primary/20',
  general: 'bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20',
  creative: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  business: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
}

const SECTION_MINI_COLORS: Record<string, string> = {
  hero: 'bg-gradient-to-r from-primary/30 to-primary/20',
  features: 'bg-emerald-500/20',
  courses: 'bg-amber-500/20',
  testimonials: 'bg-pink-500/20',
  faq: 'bg-cyan-500/20',
  cta: 'bg-orange-500/20',
  stats: 'bg-violet-500/20',
  text: 'bg-muted-foreground/10',
  image_text: 'bg-sky-500/20',
  video: 'bg-red-500/20',
  pricing: 'bg-green-500/20',
  team: 'bg-teal-500/20',
  logo_cloud: 'bg-muted-foreground/10',
  gallery: 'bg-fuchsia-500/20',
  banner: 'bg-yellow-500/20',
  divider: 'bg-muted-foreground/5',
  contact: 'bg-rose-500/20',
}

function MiniPagePreview({ sections }: { sections: LandingSection[] }) {
  return (
    <div className="w-full rounded-lg bg-background border border-border p-2 space-y-1">
      {sections.slice(0, 6).map((s, i) => {
        const color = SECTION_MINI_COLORS[s.type] || 'bg-zinc-500/20'
        const isHero = s.type === 'hero'
        return (
          <div
            key={i}
            className={`rounded ${color} flex items-center justify-center ${isHero ? 'h-8' : 'h-4'}`}
          >
            {isHero && <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Hero</span>}
          </div>
        )
      })}
    </div>
  )
}

export function TemplatePicker({ open, onClose, templates, onSelect, loading }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [step, setStep] = useState<'slug' | 'template'>('slug')
  const [selectedSlug, setSelectedSlug] = useState('home')
  const [customSlug, setCustomSlug] = useState('')
  const t = useTranslations('landingPageBuilder.templatePicker')
  const tLabels = useTranslations('landingPageBuilder.sectionLabels')

  const pageType = selectedSlug === 'custom' ? 'home' : selectedSlug
  const filtered = templates.filter(t => t.pageType === pageType || t.pageType === 'all')
  const sorted = [...filtered].sort((a, b) => a.sort_order - b.sort_order)

  function handleClose() {
    setStep('slug')
    setSelectedSlug('home')
    setCustomSlug('')
    onClose()
  }

  function handleSlugNext() {
    setStep('template')
  }

  function handleSelectTemplate(sections: LandingSection[], name: string) {
    const slug = selectedSlug === 'custom' ? customSlug : selectedSlug
    onSelect(sections, name, slug || 'home')
    setStep('slug')
    setSelectedSlug('home')
    setCustomSlug('')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className={`${step === 'slug' ? 'md:max-w-2xl' : 'md:max-w-6xl'} max-h-[85vh] overflow-hidden flex flex-col p-0`}>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div className="flex flex-col flex-1 overflow-hidden" onPointerDownCapture={(e) => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              {step === 'template' && (
                <button type="button" onClick={() => setStep('slug')} onPointerDown={(e) => e.stopPropagation()} className="p-1 rounded hover:bg-muted transition-colors mr-1" aria-label="Back to page type selection">
                  <IconArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <IconSparkles className="w-4 h-4 text-white" />
              </div>
              {step === 'slug' ? t('choosePageType') : t('title')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            {step === 'slug' ? t('choosePageTypeDescription') : t('description')}
          </p>
        </div>

        {step === 'slug' ? (
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
              {PAGE_TYPE_PRESETS.map((preset) => {
                const Icon = preset.icon
                const isSelected = selectedSlug === preset.slug
                return (
                  <button
                    key={preset.slug}
                    type="button"
                    className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                      isSelected
                        ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border hover:border-border/80 bg-card/50'
                    }`}
                    onClick={() => { setSelectedSlug(preset.slug); setCustomSlug('') }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${preset.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm capitalize">{preset.slug}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">
                        /{preset.slug === 'home' ? '' : `p/${preset.slug}`}
                      </p>
                    </div>
                  </button>
                )
              })}
              {/* Custom slug option */}
              <button
                type="button"
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                  selectedSlug === 'custom'
                    ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:border-border/80 bg-card/50'
                }`}
                onClick={() => setSelectedSlug('custom')}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center border bg-muted-foreground/10 border-muted-foreground/20 text-muted-foreground">
                  <IconFileText className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">{t('customSlug')}</p>
                  <p className="text-[10px] text-muted-foreground">{t('customSlugDescription')}</p>
                </div>
              </button>
            </div>

            {selectedSlug === 'custom' && (
              <div className="mt-4 max-w-2xl mx-auto">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground font-mono">/p/</span>
                  <Input
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    onBlur={() => setCustomSlug(prev => prev.replace(/-+/g, '-').replace(/^-|-$/g, ''))}
                    placeholder="my-page"
                    className="font-mono text-sm"
                    aria-label={t('customSlug')}
                    autoFocus
                  />
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end max-w-2xl mx-auto">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleSlugNext() }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={selectedSlug === 'custom' && !customSlug.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                {t('next')}
                <IconArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 w-full">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {sorted.map((template, idx) => {
                const catColor = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.general

                return (
                  <button
                    key={idx}
                    className={`group relative flex flex-col rounded-xl border text-left transition-all duration-200 overflow-hidden ${hoveredIdx === idx
                      ? 'border-primary/50 bg-primary/5 shadow-lg shadow-primary/5 scale-[1.02]'
                      : 'border-border hover:border-border/80 bg-card/50'
                      }`}
                    onClick={() => handleSelectTemplate(template.sections, template.name)}
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
                          <span key={i} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {tLabels(s.type as SectionType)}
                          </span>
                        ))}
                        {template.sections.length > 4 && (
                          <span className="text-[10px] text-muted-foreground px-1">
                            {t('more', { count: template.sections.length - 4 })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={`absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl transition-opacity duration-200 ${hoveredIdx === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'
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
        )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
