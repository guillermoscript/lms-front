'use client'

import { useState } from 'react'
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
} from '@tabler/icons-react'
import type { LandingPage, LandingPageTemplate } from '@/lib/landing-pages/types'
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

interface Props {
  pages: LandingPage[]
  plan: string
  tenantId: string
  templates: Array<Omit<LandingPageTemplate, 'id' | 'created_at'>>
}

const PAID_PLANS = ['starter', 'pro', 'business', 'enterprise']

const SECTION_MINI_COLORS: Record<string, string> = {
  hero: 'bg-blue-500/30',
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

function PageCardPreview({ sections }: { sections: LandingPage['sections'] }) {
  if (!sections || sections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-700 text-xs">
        Empty
      </div>
    )
  }
  return (
    <div className="space-y-0.5 p-1.5">
      {sections.slice(0, 7).map((s, i) => {
        const color = SECTION_MINI_COLORS[s.type] || 'bg-zinc-500/20'
        const isHero = s.type === 'hero'
        return (
          <div
            key={i}
            className={`rounded-sm ${color} ${isHero ? 'h-5' : 'h-2.5'} ${!s.visible ? 'opacity-30' : ''}`}
          />
        )
      })}
      {sections.length > 7 && (
        <div className="text-center text-[8px] text-zinc-600 pt-0.5">+{sections.length - 7}</div>
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
  const [loading, setLoading] = useState(false)

  const canUseBuilder = PAID_PLANS.includes(plan)

  async function handleCreateFromTemplate(templateSections: LandingPageTemplate['sections'], templateName: string) {
    setLoading(true)
    setShowTemplatePicker(false)
    const result = await createLandingPage(`${templateName} Page`, templateSections)
    if (result.success && result.data) {
      setPages(prev => [result.data!, ...prev])
      setEditingPage(result.data!)
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setLoading(true)
    const result = await deleteLandingPage(deleteTarget)
    if (result.success) {
      setPages(prev => prev.filter(p => p.id !== deleteTarget))
    }
    setDeleteTarget(null)
    setLoading(false)
  }

  async function handleDuplicate(page: LandingPage) {
    setLoading(true)
    const result = await duplicateLandingPage(page.id, `${page.name} (Copy)`)
    if (result.success && result.data) {
      setPages(prev => [result.data!, ...prev])
    }
    setLoading(false)
  }

  async function handleToggleActive(page: LandingPage) {
    setLoading(true)
    if (page.is_active) {
      const result = await deactivateLandingPage(page.id)
      if (result.success) {
        setPages(prev => prev.map(p => p.id === page.id ? { ...p, is_active: false } : p))
      }
    } else {
      if (page.status !== 'published') {
        alert(t('pageCard.publishFirst'))
        setLoading(false)
        return
      }
      const result = await activateLandingPage(page.id)
      if (result.success) {
        setPages(prev => prev.map(p => ({
          ...p,
          is_active: p.id === page.id ? true : (p.slug === page.slug ? false : p.is_active),
        })))
      }
    }
    setLoading(false)
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
          <Button onClick={() => setShowTemplatePicker(true)} disabled={loading} className="gap-2">
            <IconPlus className="w-4 h-4" />
            {t('newPage')}
          </Button>
        )}
      </div>

      {/* Feature gate for free plan */}
      {!canUseBuilder && (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5" />
          <div className="relative flex flex-col items-center justify-center py-16 gap-5 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center border border-blue-500/20">
              <IconLock className="w-6 h-6 text-blue-400" />
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
            <div className="relative overflow-hidden rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-indigo-500/5" />
              <div className="relative flex flex-col items-center justify-center py-20 gap-5 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center border border-blue-500/20">
                  <IconLayout className="w-6 h-6 text-blue-400" />
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
                  className={`group relative rounded-xl border transition-all duration-200 hover:shadow-lg cursor-pointer ${
                    page.is_active
                      ? 'border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                  }`}
                  onClick={() => setEditingPage(page)}
                >
                  {/* Mini preview */}
                  <div className="h-28 rounded-t-xl bg-zinc-950 border-b border-zinc-800/50 overflow-hidden">
                    <PageCardPreview sections={page.sections} />
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-sm truncate">{page.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {sectionCount(page.sections?.length ?? 0)}
                          {page.updated_at && (
                            <> &middot; {new Date(page.updated_at).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {page.is_active && (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
                        >
                          <IconDots className="w-3.5 h-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => handleToggleActive(page)} disabled={loading}>
                            {page.is_active ? (
                              <><IconEye className="w-3.5 h-3.5 mr-2" /> {t('pageCard.deactivate')}</>
                            ) : (
                              <><IconWorldUpload className="w-3.5 h-3.5 mr-2" /> {t('pageCard.activate')}</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(page)} disabled={loading}>
                            <IconCopy className="w-3.5 h-3.5 mr-2" /> {t('pageCard.duplicate')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(page.id)}
                            disabled={loading || page.is_active}
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
              <button
                className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 hover:border-zinc-600 hover:bg-zinc-900/50 transition-all duration-200 min-h-[200px] group"
                onClick={() => setShowTemplatePicker(true)}
                disabled={loading}
              >
                <div className="w-10 h-10 rounded-xl bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-colors mb-3">
                  <IconPlus className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300" />
                </div>
                <span className="text-sm text-zinc-500 group-hover:text-zinc-300 font-medium transition-colors">
                  {t('newPage')}
                </span>
              </button>
            </div>
          )}
        </>
      )}

      <TemplatePicker
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        templates={templates}
        onSelect={handleCreateFromTemplate}
        loading={loading}
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
