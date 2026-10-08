'use client'

import { useState, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { LandingPage } from '@/app/actions/admin/landing-pages'
import type { Data } from '@measured/puck'
import type { LandingData } from '@/lib/puck/types'
import { deepCloneWithFreshIds, type PuckTemplate, type TemplateBindings } from '@/lib/puck/templates'
import { translateTemplateString } from '@lms/core/src/page-builder/template-i18n'
import { schoolBindingsFromSettings } from '@/lib/puck/templates/school-bindings'
import { LandingPickerProviders } from '@/lib/puck/utils/landing-pickers-context'
import dynamic from 'next/dynamic'

const PuckEditor = dynamic(
  () => import('./puck-editor').then(m => m.PuckEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    ),
  }
)
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
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

interface Props {
  pages: LandingPage[]
  plan: string
  /** The school has a usable AI key (BYOK): gates "describe your page". */
  aiConfigured?: boolean
  tenantId: string
  templates: PuckTemplate[]
  brandingSettings: Record<string, unknown>
  landingData: LandingData
}

// The builder is available on every plan; free tenants are capped at one page.
// Keep in sync with the server-side cap in app/actions/admin/landing-pages.ts.
const FREE_PLAN_PAGE_LIMIT = 1

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function pageUrl(slug: string): string {
  return slug === 'home' ? '/' : `/p/${slug}`
}

export function LandingPagesClient({ pages: initialPages, plan, aiConfigured = false, tenantId, templates, brandingSettings, landingData }: Props) {
  const router = useRouter()
  const t = useTranslations('landingPageBuilder')
  const locale = useLocale() === 'es' ? 'es' : 'en'
  const [pages, setPages] = useState<LandingPage[]>(initialPages)

  // Sync server-provided pages after router.refresh() — render-time adjustment
  // instead of an effect (react-hooks/set-state-in-effect)
  const [prevInitialPages, setPrevInitialPages] = useState(initialPages)
  if (prevInitialPages !== initialPages) {
    setPrevInitialPages(initialPages)
    setPages(initialPages)
  }

  const [editingPage, setEditingPage] = useState<LandingPage | null>(null)
  // The description a page was started from ("describe your page"): the editor's chat sends it.
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const pendingRef = useRef(false)

  const atFreePageLimit = plan === 'free' && pages.length >= FREE_PLAN_PAGE_LIMIT
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

  async function handleCreateFromTemplate(puckData: Data, templateName: string, slug: string, bindings: TemplateBindings) {
    // The picked course/product (from the picker) over the school's own name and logo, so a
    // template never ships `{{schoolName}}` tokens or the "Academy" fallback (critique D4).
    // The template's copy is written in the admin's language (`locale` binding).
    const allBindings: TemplateBindings = { ...schoolBindingsFromSettings(brandingSettings), ...bindings, locale }
    const name = t('templatePicker.pageName', { name: translateTemplateString(templateName, locale) })
    const result = await withGuard('create', async () => {
      return createLandingPage(name, deepCloneWithFreshIds(puckData, allBindings), slug)
    })
    if (!result) return
    setShowTemplatePicker(false)
    if (!result.success) {
      const errorMsg = typeof result.error === 'string' ? result.error : t('errors.createFailed')
      console.error('[landing-page] create failed:', result)
      toast.error(errorMsg)
    } else if (result.data) {
      setPages(prev => [result.data!, ...prev])
      setEditingPage(result.data!)
      toast.success(t('errors.createSuccess'))
    }
  }

  /** An empty page whose first chat message is the admin's description: the AI builds it live. */
  async function handleCreateFromPrompt(prompt: string, slug: string) {
    const empty = { root: { props: {} }, content: [], zones: {} } as Data
    // A short name from the description (the admin renames it later): first words, ≤ 40 chars.
    const words = prompt.replace(/\s+/g, ' ').trim()
    const name = words.length <= 40 ? words : `${words.slice(0, 40).replace(/\s+\S*$/, '')}…`
    const result = await withGuard('create', () => createLandingPage(name, empty, slug))
    if (!result) return
    setShowTemplatePicker(false)
    if (!result.success) {
      toast.error(typeof result.error === 'string' ? result.error : t('errors.createFailed'))
    } else if (result.data) {
      setPages(prev => [result.data!, ...prev])
      setInitialPrompt(prompt)
      setEditingPage(result.data!)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const targetId = deleteTarget
    setDeleteTarget(null)
    await withGuard(`delete-${targetId}`, async () => {
      const result = await deleteLandingPage(targetId)
      if (!result.success) {
        toast.error(typeof result.error === 'string' ? result.error : t('errors.deleteFailed'))
      } else {
        setPages(prev => prev.filter(p => p.id !== targetId))
        toast.success(t('errors.deleteSuccess'))
      }
      return result
    })
  }

  async function handleDuplicate(page: LandingPage) {
    await withGuard(`duplicate-${page.id}`, async () => {
      const result = await duplicateLandingPage(page.id, `${page.name} (Copy)`)
      if (!result.success) {
        toast.error(typeof result.error === 'string' ? result.error : t('errors.duplicateFailed'))
      } else if (result.data) {
        setPages(prev => [result.data!, ...prev])
        toast.success(t('errors.duplicateSuccess'))
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
          toast.error(typeof result.error === 'string' ? result.error : t('errors.deactivateFailed'))
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
          toast.error(typeof result.error === 'string' ? result.error : t('errors.activateFailed'))
        }
        return result
      }
    })
  }

  // ── Puck Editor mode ──
  if (editingPage) {
    return (
      <PuckEditor
        pageId={editingPage.id}
        pageName={editingPage.name}
        pageStatus={editingPage.status}
        initialData={editingPage.puck_data || { root: { props: {} }, content: [], zones: {} }}
        initialUpdatedAt={editingPage.updated_at}
        brandingSettings={brandingSettings}
        landingData={landingData}
        aiEnabled={plan !== 'free'}
        initialPrompt={initialPrompt}
        // The editor guards unsaved work itself; it hands back the row it last saved so
        // reopening the page before the refresh lands never starts from stale data.
        onBack={(latest) => {
          if (latest) setPages(prev => prev.map(p => (p.id === latest.id ? latest : p)))
          router.refresh()
          setInitialPrompt(undefined)
          setEditingPage(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Free plan is capped at one page — nudge toward upgrade once the cap is hit */}
      {atFreePageLimit && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <IconLock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{t('freeLimit.title')}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {t('freeLimit.description')}
                  </p>
                </div>
              </div>
              <Button onClick={() => router.push('/dashboard/admin/billing/upgrade')} size="sm" className="gap-2 shrink-0">
                {t('featureGate.upgrade')}
                <IconArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pages list */}
      <>
          {pages.length === 0 ? (
            <Card>
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                    <IconLayout className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">{t('createFirst')}</h3>
                    <p className="text-muted-foreground text-sm mt-1.5 max-w-sm">
                      {t('createFirstDescription')}
                    </p>
                  </div>
                  <Button onClick={() => setShowTemplatePicker(true)} className="gap-2">
                    <IconPlus className="w-4 h-4" />
                    {t('getStarted')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t('title')}</CardTitle>
                <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
                  <Button onClick={() => setShowTemplatePicker(true)} disabled={isLoading || atFreePageLimit} size="sm" className="gap-2">
                    <IconPlus className="w-4 h-4" />
                    {t('newPage')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr className="text-left text-sm text-muted-foreground">
                        <th className="pb-3 font-medium">Page</th>
                        <th className="pb-3 font-medium hidden md:table-cell">URL</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium hidden md:table-cell">Updated</th>
                        <th className="pb-3 font-medium"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pages.map(page => (
                        <tr
                          key={page.id}
                          className="text-sm cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => setEditingPage(page)}
                        >
                          {/* Name */}
                          <td className="py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-2 h-2 rounded-full shrink-0 ${page.is_active ? 'bg-success' : 'bg-border'}`}
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <p className="font-medium truncate">{page.name}</p>
                                {page.is_active && (
                                  <span className="text-xs font-medium text-success">
                                    {t('pageCard.live')}
                                  </span>
                                )}
                                {/* URL inline on mobile */}
                                <p className="text-xs text-muted-foreground font-mono truncate md:hidden">
                                  {pageUrl(page.slug)}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* URL — hidden on mobile */}
                          <td className="py-4 hidden md:table-cell">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-muted-foreground truncate">
                                {pageUrl(page.slug)}
                              </span>
                              {page.status === 'published' && (
                                <a
                                  href={pageUrl(page.slug)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 transition-colors"
                                  aria-label={`Open ${page.name} in new tab`}
                                >
                                  <IconExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-4">
                            <Badge
                              variant={page.status === 'published' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {page.status}
                            </Badge>
                          </td>

                          {/* Updated — hidden on mobile */}
                          <td className="py-4 hidden md:table-cell text-xs text-muted-foreground">
                            {page.updated_at ? timeAgo(page.updated_at) : '—'}
                          </td>

                          {/* Actions */}
                          <td className="py-4">
                            <div className="flex justify-end">
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={<Button variant="ghost" size="icon" className="h-8 w-8" />}
                                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                  aria-label={`Actions for ${page.name}`}
                                >
                                  <IconDots className="w-4 h-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                  <DropdownMenuItem onClick={() => setEditingPage(page)}>
                                    <IconEdit className="w-4 h-4 mr-2" /> {t('pageCard.edit')}
                                  </DropdownMenuItem>
                                  {page.status === 'published' && (
                                    <DropdownMenuItem
                                      render={
                                        <a
                                          href={`/dashboard/admin/landing-page/preview/${page.id}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        />
                                      }
                                    >
                                      <IconEye className="w-4 h-4 mr-2" /> {t('pageCard.preview')}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleToggleActive(page)} disabled={isLoading}>
                                    {page.is_active ? (
                                      <><IconEye className="w-4 h-4 mr-2" /> {t('pageCard.deactivate')}</>
                                    ) : (
                                      <><IconWorldUpload className="w-4 h-4 mr-2" /> {t('pageCard.activate')}</>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDuplicate(page)} disabled={isLoading || atFreePageLimit}>
                                    <IconCopy className="w-4 h-4 mr-2" /> {t('pageCard.duplicate')}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setDeleteTarget(page.id)}
                                    disabled={isLoading || page.is_active}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <IconTrash className="w-4 h-4 mr-2" /> {t('pageCard.delete')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>

      {/* The picker's course/product binding step reads the lists from these providers. */}
      <LandingPickerProviders metadata={landingData}>
        <TemplatePicker
          open={showTemplatePicker}
          onClose={() => setShowTemplatePicker(false)}
          templates={templates}
          onSelect={handleCreateFromTemplate}
          onDescribe={plan !== 'free' && aiConfigured ? handleCreateFromPrompt : undefined}
          loading={isLoading}
        />
      </LandingPickerProviders>

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
