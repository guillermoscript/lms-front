'use client'

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  IconLoader2,
  IconArrowRight,
  IconArrowLeft,
  IconHome,
  IconInfoCircle,
  IconMail,
  IconQuestionMark,
  IconFileText,
  IconCalendar,
  IconSchool,
  IconPackage,
  IconTags,
  IconSearch,
} from '@tabler/icons-react'
import type { Data } from '@measured/puck'
import { useLocale, useTranslations } from 'next-intl'
import { TEMPLATE_ITEM_KEYS, templateMessageKey } from '@/lib/puck/template-labels'
import { templateBindingNeeds, type PuckTemplate, type TemplateBindings } from '@/lib/puck/templates'
import { productBindings, slugFromTitle } from '@/lib/puck/templates/school-bindings'
import { useLandingCourses } from '@/lib/puck/utils/courses-context'
import { useLandingProducts } from '@/lib/puck/utils/landing-pickers-context'
import { formatMoney } from '@/lib/puck/utils/format-money'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  templates: PuckTemplate[]
  /**
   * `bindings` carries the picked course / product (`courseId`, or `productId` + the
   * product's `courseIds`); the caller adds the school's own (`schoolName`, `logoUrl`).
   */
  onSelect: (puckData: Data, templateName: string, slug: string, bindings: TemplateBindings) => void
  loading?: boolean
}

// Labels come from `landingPageBuilder.pageTypes` (#726) and, for the bound page types
// added with Page Architect WP5, from `puck.templates.pageTypes`.
const PAGE_TYPE_PRESETS = [
  { slug: 'home', icon: IconHome },
  { slug: 'about', icon: IconInfoCircle },
  { slug: 'contact', icon: IconMail },
  { slug: 'faq', icon: IconQuestionMark },
  { slug: 'terms', icon: IconFileText },
  { slug: 'events', icon: IconCalendar },
  { slug: 'course', icon: IconSchool },
  { slug: 'product', icon: IconPackage },
  { slug: 'pricing', icon: IconTags },
] as const

type PresetSlug = (typeof PAGE_TYPE_PRESETS)[number]['slug']
const WP5_PAGE_TYPES = new Set<string>(['course', 'product', 'pricing'])
/** Page types whose final slug comes from the bound course / product title. */
const TITLE_SLUG_TYPES = new Set<string>(['course', 'product'])

/** WP5 template id → key under `puck.templates.items`. */

type Step = 'slug' | 'template' | 'binding'

export function TemplatePicker({ open, onClose, templates, onSelect, loading }: Props) {
  const [step, setStep] = useState<Step>('slug')
  const [selectedSlug, setSelectedSlug] = useState<PresetSlug | 'custom'>('home')
  const [customSlug, setCustomSlug] = useState('')
  const [pending, setPending] = useState<PuckTemplate | null>(null)
  const t = useTranslations('landingPageBuilder.templatePicker')
  const tPageTypes = useTranslations('landingPageBuilder.pageTypes')
  const tT = useTranslations('puck.templates')
  // Template names and descriptions stay in English in the data, because the
  // MCP tools and stored pages reference them; only the display is translated,
  // and a template with no key falls back to the name as written (#726).
  const tTemplates = useTranslations('landingPageBuilder.templates')
  const templateName = (tpl: PuckTemplate) => {
    const item = TEMPLATE_ITEM_KEYS[tpl.id]
    if (item) return tT(`items.${item}.name` as Parameters<typeof tT>[0])
    const key = templateMessageKey(tpl.name)
    return key ? tTemplates(`${key}.name` as Parameters<typeof tTemplates>[0]) : tpl.name
  }
  const templateDescription = (tpl: PuckTemplate) => {
    const item = TEMPLATE_ITEM_KEYS[tpl.id]
    if (item) return tT(`items.${item}.description` as Parameters<typeof tT>[0])
    const key = templateMessageKey(tpl.name)
    return key ? tTemplates(`${key}.description` as Parameters<typeof tTemplates>[0]) : tpl.description
  }
  const pageTypeLabel = (slug: PresetSlug) =>
    WP5_PAGE_TYPES.has(slug)
      ? tT(`pageTypes.${slug}` as Parameters<typeof tT>[0])
      : tPageTypes(slug as Parameters<typeof tPageTypes>[0])
  const pageTypeHint = (slug: PresetSlug) => {
    if (slug === 'home') return '/'
    if (TITLE_SLUG_TYPES.has(slug)) return tT(`pageTypeHints.${slug}` as Parameters<typeof tT>[0])
    return `/p/${slug}`
  }

  const pageType = selectedSlug === 'custom' ? 'home' : selectedSlug
  const sorted = useMemo(
    () =>
      templates
        .filter((tpl) => tpl.pageType === pageType || tpl.pageType === 'all')
        .sort((a, b) => a.sort_order - b.sort_order),
    [templates, pageType]
  )

  function reset() {
    setStep('slug')
    setSelectedSlug('home')
    setCustomSlug('')
    setPending(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  /** The page slug; a course/product page takes the bound title when there is one. */
  function resolveSlug(boundTitle?: string): string {
    if (selectedSlug === 'custom') return customSlug || 'home'
    if (TITLE_SLUG_TYPES.has(selectedSlug)) return (boundTitle && slugFromTitle(boundTitle)) || selectedSlug
    return selectedSlug
  }

  function finish(tpl: PuckTemplate, bindings: TemplateBindings, boundTitle?: string) {
    onSelect(tpl.puck_data, tpl.name, resolveSlug(boundTitle), bindings)
    reset()
  }

  function handleSelectTemplate(tpl: PuckTemplate) {
    const needs = templateBindingNeeds(tpl.puck_data)
    if (needs.course || needs.product) {
      setPending(tpl)
      setStep('binding')
      return
    }
    finish(tpl, {})
  }

  function getComponentCount(data: Data): number {
    let count = data.content?.length ?? 0
    if (data.zones) {
      for (const zone of Object.values(data.zones)) {
        count += zone.length
      }
    }
    return count
  }

  const pendingNeeds = pending ? templateBindingNeeds(pending.puck_data) : null
  const bindingKind: 'course' | 'product' = pendingNeeds?.product && !pendingNeeds.course ? 'product' : 'course'

  const title =
    step === 'slug'
      ? t('choosePageType')
      : step === 'template'
        ? t('title')
        : bindingKind === 'course'
          ? tT('binding.chooseCourse')
          : tT('binding.chooseProduct')
  const description =
    step === 'slug'
      ? t('choosePageTypeDescription')
      : step === 'template'
        ? t('description')
        : bindingKind === 'course'
          ? tT('binding.chooseCourseDescription')
          : tT('binding.chooseProductDescription')

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="md:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <div className="flex flex-col flex-1 overflow-hidden" onPointerDownCapture={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                {step !== 'slug' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 -ml-1"
                    onClick={() => setStep(step === 'binding' ? 'template' : 'slug')}
                    aria-label={tT('binding.back')}
                  >
                    <IconArrowLeft className="w-4 h-4" />
                  </Button>
                )}
                {title}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>

          {step === 'slug' && (
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
                        className={cn(
                          'flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                            : 'border-border hover:border-foreground/20 bg-card'
                        )}
                        onClick={() => { setSelectedSlug(preset.slug); setCustomSlug('') }}
                      >
                        <Icon className={cn('w-4 h-4 shrink-0', isSelected ? 'text-brand-text' : 'text-muted-foreground')} />
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{pageTypeLabel(preset.slug)}</p>
                          <p
                            className={cn(
                              'text-xs text-muted-foreground truncate',
                              !TITLE_SLUG_TYPES.has(preset.slug) && 'font-mono'
                            )}
                          >
                            {pageTypeHint(preset.slug)}
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
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selectedSlug === 'custom'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border hover:border-foreground/20 bg-card'
                    )}
                    onClick={() => setSelectedSlug('custom')}
                  >
                    <IconFileText className={cn('w-4 h-4 shrink-0', selectedSlug === 'custom' ? 'text-brand-text' : 'text-muted-foreground')} />
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
                  onClick={() => setStep('template')}
                  disabled={selectedSlug === 'custom' && !customSlug.trim()}
                  className="gap-2"
                >
                  {t('next')}
                  <IconArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 'template' && (
            <div className="flex-1 overflow-y-auto p-6 w-full min-h-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="list" aria-label={t('title')}>
                {sorted.map((template) => {
                  const count = getComponentCount(template.puck_data)
                  const desc = templateDescription(template)

                  return (
                    <button
                      key={template.id}
                      type="button"
                      role="listitem"
                      className="group relative flex flex-col rounded-lg border border-border bg-card text-left transition-colors motion-reduce:transition-none hover:border-foreground/20  overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => handleSelectTemplate(template)}
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
                          <h3 className="font-medium text-sm">{templateName(template)}</h3>
                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                            {template.category}
                          </Badge>
                        </div>
                        {desc && (
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{desc}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{tT('sections', { count })}</p>
                      </div>

                      {/* Hover overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity motion-reduce:transition-none duration-150">
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

          {step === 'binding' && pending && (
            <BindingStep
              key={pending.id}
              kind={bindingKind}
              loading={!!loading}
              slugFor={resolveSlug}
              onConfirm={(bindings, boundTitle) => finish(pending, bindings, boundTitle)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface BindingOption {
  id: string
  title: string
  meta: string
}

/**
 * Pick the course or product a bound template is for. The lists come from the picker
 * providers (`LandingPickerProviders`, fed from the page list's `landingData`), which hold
 * PUBLISHED courses only; the step says so, since a draft course cannot be picked here.
 */
function BindingStep({
  kind,
  loading,
  slugFor,
  onConfirm,
}: {
  kind: 'course' | 'product'
  loading: boolean
  slugFor: (boundTitle?: string) => string
  onConfirm: (bindings: TemplateBindings, boundTitle?: string) => void
}) {
  const tT = useTranslations('puck.templates.binding')
  const locale = useLocale()
  const courses = useLandingCourses()
  const products = useLandingProducts()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const options: BindingOption[] = useMemo(() => {
    if (kind === 'course') {
      return courses.map((c) => ({
        id: c.id,
        title: c.title,
        meta: formatMoney(c.price, c.currency, locale) ?? tT('free'),
      }))
    }
    return products.map((p) => ({
      id: p.id,
      title: p.name,
      meta: [formatMoney(p.price, p.currency, locale) ?? tT('free'), tT('coursesCount', { count: p.courseIds.length })].join(' · '),
    }))
  }, [kind, courses, products, locale, tT])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.title.toLowerCase().includes(q)) : options
  }, [options, query])

  const selected = options.find((o) => o.id === selectedId)
  const slug = slugFor(selected?.title)

  function confirm(skip = false) {
    if (skip || !selected) return onConfirm({})
    if (kind === 'course') return onConfirm({ courseId: selected.id }, selected.title)
    const product = products.find((p) => p.id === selected.id)
    onConfirm(product ? productBindings(product) : { productId: selected.id }, selected.title)
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {options.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {kind === 'course' ? tT('noCourses') : tT('noProducts')}
          </p>
        ) : (
          <>
            <div className="relative mb-3">
              <IconSearch aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tT('search')}
                aria-label={tT('search')}
                className="pl-8 text-sm"
              />
            </div>
            <div role="radiogroup" aria-label={kind === 'course' ? tT('chooseCourse') : tT('chooseProduct')} className="flex flex-col gap-1.5">
              {filtered.map((o) => {
                const isSelected = o.id === selectedId
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedId(o.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border hover:border-foreground/20 bg-card'
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{o.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{o.meta}</span>
                    </span>
                  </button>
                )
              })}
              {filtered.length === 0 && <p className="py-2 text-sm text-muted-foreground">{tT('noMatches')}</p>}
            </div>
            {kind === 'course' && <p className="mt-3 text-xs text-muted-foreground">{tT('publishedOnly')}</p>}
          </>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="truncate text-xs text-muted-foreground font-mono">
          {tT('pageUrl', { url: slug === 'home' ? '/' : `/p/${slug}` })}
        </p>
        <div className="flex gap-2 sm:justify-end">
          <Button variant="ghost" onClick={() => confirm(true)} disabled={loading}>
            {tT('skip')}
          </Button>
          <Button onClick={() => confirm()} disabled={loading || (!selected && options.length > 0)} className="gap-2">
            {loading && <IconLoader2 className="w-4 h-4 animate-spin" />}
            {tT('create')}
          </Button>
        </div>
      </div>
    </div>
  )
}
