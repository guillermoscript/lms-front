'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
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
import { deepCloneWithFreshIds } from '@/lib/puck/templates'
import { PuckEditor } from './puck-editor'
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

interface PuckTemplate {
  name: string
  description?: string
  category: string
  puck_data: Data
  sort_order: number
  pageType: string
}

interface Props {
  pages: LandingPage[]
  plan: string
  tenantId: string
  templates: PuckTemplate[]
}

const PAID_PLANS = ['starter', 'pro', 'business', 'enterprise']

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

export function LandingPagesClient({ pages: initialPages, plan, tenantId, templates }: Props) {
  const router = useRouter()
  const t = useTranslations('landingPageBuilder')
  const [pages, setPages] = useState<LandingPage[]>(initialPages)

  useEffect(() => {
    setPages(initialPages)
  }, [initialPages])

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

  async function handleCreateFromTemplate(puckData: Data, templateName: string, slug?: string) {
    const result = await withGuard('create', async () => {
      return createLandingPage(`${templateName} Page`, deepCloneWithFreshIds(puckData), slug)
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

  // ── Puck Editor mode ──
  if (editingPage) {
    return (
      <PuckEditor
        pageId={editingPage.id}
        pageName={editingPage.name}
        pageStatus={editingPage.status}
        initialData={editingPage.puck_data || { root: { props: {} }, content: [], zones: {} }}
        onBack={() => {
          router.refresh()
          setEditingPage(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Feature gate for free plan */}
      {!canUseBuilder && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <IconLock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-base">{t('featureGate.title')}</h3>
                <p className="text-muted-foreground text-sm mt-1.5 max-w-md leading-relaxed">
                  {t('featureGate.description')}
                </p>
              </div>
              <Button onClick={() => router.push('/dashboard/admin/billing/upgrade')} className="gap-2">
                {t('featureGate.upgrade')}
                <IconArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pages list */}
      {canUseBuilder && (
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
                  <Button onClick={() => setShowTemplatePicker(true)} disabled={isLoading} size="sm" className="gap-2">
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
                                className={`w-2 h-2 rounded-full shrink-0 ${page.is_active ? 'bg-emerald-500' : 'bg-border'}`}
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <p className="font-medium truncate">{page.name}</p>
                                {page.is_active && (
                                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
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
                                  <DropdownMenuItem onClick={() => handleDuplicate(page)} disabled={isLoading}>
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
