'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconLoader2, IconArrowRight, IconArrowLeft, IconHome, IconInfoCircle, IconMail, IconQuestionMark, IconFileText, IconCalendar } from '@tabler/icons-react'
import type { Data } from '@measured/puck'
import { useTranslations } from 'next-intl'

interface PuckTemplate {
  name: string
  description?: string
  category: string
  puck_data: Data
  sort_order: number
  pageType: string
}

interface Props {
  open: boolean
  onClose: () => void
  templates: PuckTemplate[]
  onSelect: (puckData: Data, templateName: string, slug?: string) => void
  loading?: boolean
}

const PAGE_TYPE_PRESETS = [
  { slug: 'home', icon: IconHome, label: 'Home' },
  { slug: 'about', icon: IconInfoCircle, label: 'About' },
  { slug: 'contact', icon: IconMail, label: 'Contact' },
  { slug: 'faq', icon: IconQuestionMark, label: 'FAQ' },
  { slug: 'terms', icon: IconFileText, label: 'Terms' },
  { slug: 'events', icon: IconCalendar, label: 'Events' },
] as const

const CATEGORY_COLORS: Record<string, string> = {
  education: 'bg-primary/10 text-primary border-primary/20',
  general: 'bg-muted/80 text-muted-foreground border-border',
  creative: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  business: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  'code-school': 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
}

export function TemplatePicker({ open, onClose, templates, onSelect, loading }: Props) {
  const [step, setStep] = useState<'slug' | 'template'>('slug')
  const [selectedSlug, setSelectedSlug] = useState('home')
  const [customSlug, setCustomSlug] = useState('')
  const t = useTranslations('landingPageBuilder.templatePicker')

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

  function handleSelectTemplate(puckData: Data, name: string) {
    const slug = selectedSlug === 'custom' ? customSlug : selectedSlug
    onSelect(puckData, name, slug || 'home')
    setStep('slug')
    setSelectedSlug('home')
    setCustomSlug('')
  }

  function getComponentCount(data: Data): number {
    let count = data.content?.length ?? 0
    if (data.zones) {
      for (const zone of Object.values(data.zones)) {
        count += (zone as any[]).length
      }
    }
    return count
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="md:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div className="flex flex-col flex-1 overflow-hidden" onPointerDownCapture={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                {step === 'template' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 -ml-1"
                    onClick={() => setStep('slug')}
                    aria-label="Back to page type selection"
                  >
                    <IconArrowLeft className="w-4 h-4" />
                  </Button>
                )}
                {step === 'slug' ? t('choosePageType') : t('title')}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-1">
              {step === 'slug' ? t('choosePageTypeDescription') : t('description')}
            </p>
          </div>

          {step === 'slug' ? (
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              <fieldset>
                <legend className="sr-only">{t('choosePageType')}</legend>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {PAGE_TYPE_PRESETS.map((preset) => {
                    const Icon = preset.icon
                    const isSelected = selectedSlug === preset.slug
                    return (
                      <button
                        key={preset.slug}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                            : 'border-border hover:border-foreground/20 bg-card'
                        }`}
                        onClick={() => { setSelectedSlug(preset.slug); setCustomSlug('') }}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{preset.label}</p>
                          <p className="text-xs font-mono text-muted-foreground truncate">
                            {preset.slug === 'home' ? '/' : `/p/${preset.slug}`}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                  {/* Custom slug option */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedSlug === 'custom'}
                    className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selectedSlug === 'custom'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border hover:border-foreground/20 bg-card'
                    }`}
                    onClick={() => setSelectedSlug('custom')}
                  >
                    <IconFileText className={`w-4 h-4 shrink-0 ${selectedSlug === 'custom' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{t('customSlug')}</p>
                      <p className="text-xs text-muted-foreground">{t('customSlugDescription')}</p>
                    </div>
                  </button>
                </div>
              </fieldset>

              {selectedSlug === 'custom' && (
                <div className="mt-4">
                  <label className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground font-mono">/p/</span>
                    <Input
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                      onBlur={() => setCustomSlug(prev => prev.replace(/-+/g, '-').replace(/^-|-$/g, ''))}
                      placeholder="my-page"
                      className="font-mono text-sm"
                      autoFocus
                    />
                  </label>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <Button
                  onClick={handleSlugNext}
                  disabled={selectedSlug === 'custom' && !customSlug.trim()}
                  className="gap-2"
                >
                  {t('next')}
                  <IconArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 w-full min-h-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="list" aria-label="Templates">
                {sorted.map((template) => {
                  const catColor = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.general
                  const count = getComponentCount(template.puck_data)

                  return (
                    <button
                      key={template.name}
                      role="listitem"
                      className="group relative flex flex-col rounded-lg border border-border bg-card text-left transition-all hover:border-foreground/20 hover:shadow-sm overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => handleSelectTemplate(template.puck_data, template.name)}
                      disabled={!!loading}
                    >
                      {/* Wireframe preview */}
                      <div className="p-3 pb-2">
                        <div className="w-full rounded-md bg-muted/50 border border-border/50 p-2 space-y-1" aria-hidden="true">
                          <div className="h-6 rounded-sm bg-foreground/[0.06]" />
                          <div className="h-3 rounded-sm bg-foreground/[0.04] w-full" />
                          <div className="h-3 rounded-sm bg-foreground/[0.04] w-3/4" />
                          {count > 4 && <div className="h-3 rounded-sm bg-foreground/[0.03] w-1/2" />}
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 px-3 pb-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm">{template.name}</h3>
                          <Badge variant="outline" className={`text-xs px-1.5 py-0 ${catColor}`}>
                            {template.category}
                          </Badge>
                        </div>
                        {template.description && (
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{template.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{count} sections</p>
                      </div>

                      {/* Hover overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150">
                        {loading ? (
                          <IconLoader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        ) : (
                          <span className="text-sm font-medium">{t('useTemplate')}</span>
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
