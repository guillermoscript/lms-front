'use client'

import { useState, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  IconLayout,
  IconPlus,
  IconEdit,
  IconTrash,
  IconCopy,
  IconEye,
  IconLock,
  IconWorldUpload,
  IconDots,
  IconArrowRight,
  IconExternalLink,
} from '@tabler/icons-react'
import type { LandingPage } from '@/lib/landing-pages/types'
import type { BuiltInTemplate } from '@/lib/landing-pages/templates'
import { LandingPageBuilder } from './landing-page-builder'
import { TemplatePicker } from './template-picker'
import {
  createLandingPage,
  deleteLandingPage,
  duplicateLandingPage,
  activateLandingPage,
  deactivateLandingPage,
} from '@/app/actions/admin/landing-pages'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

interface Props {
  pages: LandingPage[]
  plan: string
  tenantId: string
  templates: BuiltInTemplate[]
}

const PAID_PLANS = ['starter', 'pro', 'business', 'enterprise']

const SECTION_MINI_COLORS: Record<string, string> = {
  hero: 'bg-primary/20',
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

function PageCardPreview({ sections }: { sections: LandingPage['sections'] }) {
  if (!sections || sections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Empty
      </div>
    )
  }
  return (
    <div className="space-y-0.5 p-1.5">
      {sections.slice(0, 7).map((s, i) => {
        const color = SECTION_MINI_COLORS[s.type] || 'bg-muted-foreground/10'
        const isHero = s.type === 'hero'
        return (
          <div
            key={i}
            className={`rounded-sm ${color} ${isHero ? 'h-5' : 'h-2.5'} ${!s.visible ? 'opacity-30' : ''}`}
          />
        )
      })}
      {sections.length > 7 && (
        <div className="text-center text-[8px] text-muted-foreground pt-0.5">+{sections.length - 7}</div>
      )}
    </div>
  )
}

export function LandingPagesClient({ pages: initialPages, plan, tenantId, templates }: Props) {
  const router = useRouter()
  const t = useTranslations('landingPageBuilder')
  const [pages, setPages] = useState<LandingPage[]>(initialPages)
  const [editingPage, setEditingPage] = useState<LandingPage | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const pendingRef = useRef(false)

  const canUseBuilder = PAID_PLANS.includes(plan)
  const isLoading = loadingAction !== null

  const withGuard = useCallback(async <T,>(actionKey: string, fn: () => Promise<T>): Promise<T | null> => {
    if (pendingRef.current) return null
    pendingRef.current = true
    setLoadingAction(actionKey)
    try {
      return await fn()
    } finally {
      pendingRef.current = false
      setLoadingAction(null)
    }
  }, [])

  async function handleCreateFromTemplate(templateSections: BuiltInTemplate['sections'], templateName: string, slug?: string) {
    const result = await withGuard('create', async () => {
      return createLandingPage(`${templateName} Page`, templateSections, slug)
    })
    if (!result) return
    setShowTemplatePicker(false)
    if (!result.success) {
      toast.error(result.error || t('errors.createFailed'))
    } else if (result.data) {
      setPages(prev => [result.data!, ...prev])
      setEditingPage(result.data!)
      toast.success(t('errors.createSuccess') ?? 'Page created')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const targetId = deleteTarget
    setDeleteTarget(null)
    await withGuard(`delete-${targetId}`, async () => {
      const result = await deleteLandingPage(targetId)
      if (!result.success) {
        toast.error(result.error || t('errors.deleteFailed'))
      } else {
        setPages(prev => prev.filter(p => p.id !== targetId))
        toast.success(t('errors.deleteSuccess') ?? 'Page deleted')
      }
      return result
    })
  }

  async function handleDuplicate(page: LandingPage) {
    await withGuard(`duplicate-${page.id}`, async () => {
      const result = await duplicateLandingPage(page.id, `${page.name} (Copy)`)
      if (!result.success) {
        toast.error(result.error || t('errors.duplicateFailed'))
      } else if (result.data) {
        setPages(prev => [result.data!, ...prev])
        toast.success(t('errors.duplicateSuccess') ?? 'Page duplicated')
      }
      return result
    })
  }

  async function handleToggleActive(page: LandingPage) {
    await withGuard(`toggle-${page.id}`, async () => {
      if (page.is_active) {
        const result = await deactivateLandingPage(page.id)
        if (result.success) {
          setPages(prev => prev.map(p => p.id === page.id ? { ...p, is_active: false } : p))
        } else {
          toast.error(result.error || t('errors.deactivateFailed'))
        }
        return result
      } else {
        if (page.status !== 'published') {
          toast.warning(t('pageCard.publishFirst'))
          return null
        }
        const result = await activateLandingPage(page.id)
        if (result.success) {
          setPages(prev => prev.map(p => ({
            ...p,
            is_active: p.id === page.id ? true : (p.slug === page.slug ? false : p.is_active),
          })))
        } else {
          toast.error(result.error || t('errors.activateFailed'))
        }
        return result
      }
    })
  }

  if (editingPage) {
    return (
      <LandingPageBuilder
        page={editingPage}
        onBack={(updatedPage) => {
          if (updatedPage) {
            setPages(prev => prev.map(p => p.id === updatedPage.id ? updatedPage : p))
          }
          setEditingPage(null)
        }}
      />
    )
  }

  const sectionCount = (count: number) => count === 1 ? `1 ${t('pageCard.section')}` : `${count} ${t('pageCard.sections')}`

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('subtitle')}</p>
        </div>
        {canUseBuilder && (
          <Button onClick={() => setShowTemplatePicker(true)} disabled={isLoading} className="gap-2">
            <IconPlus className="w-4 h-4" />
            {t('newPage')}
          </Button>
        )}
      </div>

      {/* Feature gate for free plan */}
      {!canUseBuilder && (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-card/50">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
          <div className="relative flex flex-col items-center justify-center py-16 gap-5 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
              <IconLock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{t('featureGate.title')}</h3>
              <p className="text-muted-foreground text-sm mt-2 max-w-md leading-relaxed">
                {t('featureGate.description')}
              </p>
            </div>
            <Button onClick={() => router.push('/dashboard/admin/billing/upgrade')} className="gap-2 mt-1">
              {t('featureGate.upgrade')}
              <IconArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Pages list */}
      {canUseBuilder && (
        <>
          {pages.length === 0 ? (
            <div className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-card/30">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
              <div className="relative flex flex-col items-center justify-center py-20 gap-5 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
                  <IconLayout className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{t('createFirst')}</h3>
                  <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                    {t('createFirstDescription')}
                  </p>
                </div>
                <Button onClick={() => setShowTemplatePicker(true)} className="gap-2 mt-1">
                  <IconPlus className="w-4 h-4" />
                  {t('getStarted')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pages.map(page => (
                <div
                  key={page.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit page: ${page.name}`}
                  className={`group relative rounded-xl border transition-all duration-200 hover:shadow-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    page.is_active
                      ? 'border-primary/30 bg-primary/5 hover:border-primary/50'
                      : 'border-border bg-card/50 hover:border-border/80'
                  }`}
                  onClick={() => setEditingPage(page)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingPage(page) } }}
                >
                  {/* Mini preview */}
                  <div className="h-28 rounded-t-xl bg-background border-b border-border/50 overflow-hidden">
                    <PageCardPreview sections={page.sections} />
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-sm truncate">{page.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">/{page.slug === 'home' ? '' : `p/${page.slug}`}</span>
                          {' '}&middot; {sectionCount(page.sections?.length ?? 0)}
                          {page.updated_at && (
                            <> &middot; {new Date(page.updated_at).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {page.is_active && (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 motion-safe:animate-pulse" aria-hidden="true" />
                            {t('pageCard.live')}
                          </span>
                        )}
                        <Badge
                          variant={page.status === 'published' ? 'default' : 'secondary'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {page.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center gap-1 mt-3">
                      <Button
                        size="sm"
                        className="h-7 text-xs flex-1 gap-1"
                        onClick={(e) => { e.stopPropagation(); setEditingPage(page) }}
                      >
                        <IconEdit className="w-3 h-3" />
                        {t('pageCard.edit')}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Actions for ${page.name}`}
                        >
                          <IconDots className="w-3.5 h-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => handleToggleActive(page)} disabled={isLoading}>
                            {page.is_active ? (
                              <><IconEye className="w-3.5 h-3.5 mr-2" /> {t('pageCard.deactivate')}</>
                            ) : (
                              <><IconWorldUpload className="w-3.5 h-3.5 mr-2" /> {t('pageCard.activate')}</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`/dashboard/admin/landing-page/preview/${page.id}`, '_blank')}>
                            <IconExternalLink className="w-3.5 h-3.5 mr-2" /> {t('pageCard.preview')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(page)} disabled={isLoading}>
                            <IconCopy className="w-3.5 h-3.5 mr-2" /> {t('pageCard.duplicate')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(page.id)}
                            disabled={isLoading || page.is_active}
                            className="text-destructive focus:text-destructive"
                          >
                            <IconTrash className="w-3.5 h-3.5 mr-2" /> {t('pageCard.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}

              {/* New page card */}
              <Button
                variant="ghost"
                className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 hover:border-border/80 hover:bg-card/50 transition-all duration-200 min-h-[200px] h-auto group"
                onClick={() => setShowTemplatePicker(true)}
                disabled={isLoading}
              >
                <div className="w-10 h-10 rounded-xl bg-muted group-hover:bg-accent flex items-center justify-center transition-colors mb-3">
                  <IconPlus className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                </div>
                <span className="text-sm text-muted-foreground group-hover:text-foreground font-medium transition-colors">
                  {t('newPage')}
                </span>
              </Button>
            </div>
          )}
        </>
      )}

      <TemplatePicker
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        templates={templates}
        onSelect={handleCreateFromTemplate}
        loading={isLoading}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('deleteDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
